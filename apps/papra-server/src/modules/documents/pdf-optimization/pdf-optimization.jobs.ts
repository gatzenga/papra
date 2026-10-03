import type { ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { Logger } from '../../shared/logger/logger';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createLogger } from '../../shared/logger/logger';
import {
  createPdfOptimizationJobNotFoundError,
  createTooManyPdfOptimizationsError,
} from './pdf-optimization.errors';
import {
  buildOcrmypdfArguments,
  computeOverallProgress,
  parseProgressLine,
  PROGRESS_PLUGIN_SOURCE,
} from './pdf-optimization.models';

export type PdfOptimizationJobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type PdfOptimizationJob = {
  id: string;
  documentId: string;
  organizationId: string;
  status: PdfOptimizationJobStatus;
  progress: number;
  error?: string;
  outputPath: string;
  outputSize?: number;
};

type InternalJob = PdfOptimizationJob & {
  directory: string;
  childProcess?: ChildProcess;
  stepFractions: Map<string, number>;
  expiryTimer?: NodeJS.Timeout;
};

const FINISHED_JOB_RETENTION_MS = 60 * 60 * 1000;

export type PdfOptimizationJobs = ReturnType<typeof createPdfOptimizationJobs>;

// Runs OCRmyPDF in the background, one temporary directory per job. Jobs only live in memory: after
// a restart they are gone, which is fine as the result is only a preview until it is applied.
export function createPdfOptimizationJobs({
  command,
  languages,
  timeoutSeconds,
  maxConcurrentJobs,
  logger = createLogger({ namespace: 'pdf-optimization' }),
}: {
  command: string;
  languages: string;
  timeoutSeconds: number;
  maxConcurrentJobs: number;
  logger?: Logger;
}) {
  const jobs = new Map<string, InternalJob>();

  const toPublicJob = ({
    id,
    documentId,
    organizationId,
    status,
    progress,
    error,
    outputPath,
    outputSize,
  }: InternalJob): PdfOptimizationJob => ({
    id,
    documentId,
    organizationId,
    status,
    progress,
    error,
    outputPath,
    outputSize,
  });

  async function removeJob({ jobId }: { jobId: string }) {
    const job = jobs.get(jobId);

    if (!job) {
      return;
    }

    clearTimeout(job.expiryTimer);
    job.childProcess?.kill('SIGKILL');
    jobs.delete(jobId);
    await rm(job.directory, { recursive: true, force: true });
  }

  function scheduleExpiry(job: InternalJob) {
    clearTimeout(job.expiryTimer);
    job.expiryTimer = setTimeout(() => {
      void removeJob({ jobId: job.id });
    }, FINISHED_JOB_RETENTION_MS);
    job.expiryTimer.unref();
  }

  function finish(job: InternalJob, status: PdfOptimizationJobStatus, error?: string) {
    // A cancelled job stays cancelled even if the process reports its exit afterwards
    if (job.status !== 'running') {
      return;
    }

    job.status = status;
    job.error = error;
    job.childProcess = undefined;

    if (status === 'completed') {
      job.progress = 1;
    }

    scheduleExpiry(job);
  }

  async function run(job: InternalJob, inputStream: Readable) {
    const inputPath = join(job.directory, 'input.pdf');
    const pluginPath = join(job.directory, 'progress_plugin.py');

    try {
      await pipeline(inputStream, createWriteStream(inputPath));
      await writeFile(pluginPath, PROGRESS_PLUGIN_SOURCE);
    } catch (error) {
      finish(job, 'failed', error instanceof Error ? error.message : String(error));
      return;
    }

    if (job.status !== 'running') {
      return;
    }

    const childProcess = spawn(
      command,
      buildOcrmypdfArguments({ languages, pluginPath, inputPath, outputPath: job.outputPath }),
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    job.childProcess = childProcess;

    const timeout = setTimeout(() => {
      finish(job, 'failed', 'The optimization took too long and was stopped.');
      childProcess.kill('SIGKILL');
    }, timeoutSeconds * 1000);
    timeout.unref();

    const errorLines: string[] = [];
    let buffer = '';

    childProcess.stderr?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const progress = parseProgressLine({ line });

        if (progress) {
          if (progress.total && progress.total > 0) {
            job.stepFractions.set(progress.desc, Math.min(1, progress.n / progress.total));
            job.progress = Math.min(
              0.99,
              computeOverallProgress({ stepFractions: job.stepFractions }),
            );
          }
        } else if (line.trim().length > 0) {
          errorLines.push(line.trim());
          errorLines.splice(0, Math.max(0, errorLines.length - 10));
        }
      }
    });

    childProcess.on('error', (error) => {
      clearTimeout(timeout);
      logger.error({ error, jobId: job.id }, 'Could not start the PDF optimization');
      finish(job, 'failed', `Could not start ${command}: ${error.message}`);
    });

    childProcess.on('close', async (code) => {
      clearTimeout(timeout);

      if (job.status !== 'running') {
        return;
      }

      if (code === 0) {
        const { size } = await stat(job.outputPath);
        job.outputSize = size;
        finish(job, 'completed');
        return;
      }

      logger.error({ jobId: job.id, code, stderr: errorLines }, 'PDF optimization failed');
      finish(job, 'failed', errorLines.at(-1) ?? `The optimization failed (exit code ${code}).`);
    });
  }

  return {
    async start({
      documentId,
      organizationId,
      inputStream,
    }: {
      documentId: string;
      organizationId: string;
      inputStream: Readable;
    }) {
      // Starting again for the same document resumes the existing one
      const existing = [...jobs.values()].find(
        (job) =>
          job.documentId === documentId &&
          job.organizationId === organizationId &&
          job.status === 'running',
      );

      if (existing) {
        inputStream.destroy();
        return { job: toPublicJob(existing) };
      }

      if (
        [...jobs.values()].filter((job) => job.status === 'running').length >= maxConcurrentJobs
      ) {
        inputStream.destroy();
        throw createTooManyPdfOptimizationsError();
      }

      const directory = await mkdtemp(join(tmpdir(), 'papra-pdf-optimization-'));
      const job: InternalJob = {
        id: randomUUID(),
        documentId,
        organizationId,
        status: 'running',
        progress: 0,
        directory,
        outputPath: join(directory, 'output.pdf'),
        stepFractions: new Map(),
      };

      jobs.set(job.id, job);
      void run(job, inputStream);

      return { job: toPublicJob(job) };
    },

    getJob({
      jobId,
      documentId,
      organizationId,
    }: {
      jobId: string;
      documentId: string;
      organizationId: string;
    }) {
      const job = jobs.get(jobId);

      if (!job || job.documentId !== documentId || job.organizationId !== organizationId) {
        throw createPdfOptimizationJobNotFoundError();
      }

      return { job: toPublicJob(job) };
    },

    async cancel({
      jobId,
      documentId,
      organizationId,
    }: {
      jobId: string;
      documentId: string;
      organizationId: string;
    }) {
      const { job } = this.getJob({ jobId, documentId, organizationId });

      // Mark first so the process exit is not reported as a failure
      const internalJob = jobs.get(job.id);
      if (internalJob?.status === 'running') {
        internalJob.status = 'cancelled';
      }

      await removeJob({ jobId });
    },

    async discard({ jobId }: { jobId: string }) {
      await removeJob({ jobId });
    },
  };
}
