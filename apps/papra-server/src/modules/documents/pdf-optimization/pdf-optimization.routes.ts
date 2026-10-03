import type { RouteDefinitionContext } from '../../app/server.types';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import * as v from 'valibot';
import { requireAuthentication } from '../../app/auth/auth.middleware';
import { getUser } from '../../app/auth/auth.models';
import { organizationIdSchema } from '../../organizations/organization.schemas';
import { createOrganizationsRepository } from '../../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../../organizations/organizations.usecases';
import { validateParams } from '../../shared/validation/validation';
import { buildCreateDocumentStorageKey } from '../document-storage.usecases';
import { createDocumentsRepository } from '../documents.repository';
import { documentIdSchema } from '../documents.schemas';
import { getDocumentOrThrow } from '../documents.usecases';
import { buildResolveStoragePatternContext } from '../storage-patterns/storage-pattern.usecases';
import {
  createDocumentIsNotPdfError,
  createPdfOptimizationNotCompletedError,
} from './pdf-optimization.errors';
import { createPdfOptimizationJobs } from './pdf-optimization.jobs';
import { applyPdfOptimization } from './pdf-optimization.usecases';

const BASE_PATH = '/api/organizations/:organizationId/documents/:documentId/pdf-optimization';

const jobParamsSchema = v.strictObject({
  organizationId: organizationIdSchema,
  documentId: documentIdSchema,
  jobId: v.pipe(v.string(), v.uuid()),
});

export function registerPdfOptimizationRoutes(context: RouteDefinitionContext) {
  const { app, db, config, documentsStorageService } = context;

  const jobs = createPdfOptimizationJobs(config.pdfOptimization);

  const formatJob = ({
    id,
    status,
    progress,
    error,
  }: {
    id: string;
    status: string;
    progress: number;
    error?: string;
  }) => ({
    id,
    status,
    progress,
    error,
  });

  async function getAuthorizedPdfDocument({
    userId,
    organizationId,
    documentId,
  }: {
    userId: string;
    organizationId: string;
    documentId: string;
  }) {
    await ensureUserIsInOrganization({
      userId,
      organizationId,
      organizationsRepository: createOrganizationsRepository({ db }),
    });

    const { document } = await getDocumentOrThrow({
      documentId,
      organizationId,
      documentsRepository: createDocumentsRepository({ db }),
    });

    return { document };
  }

  // Start (or resume) the optimization of a document
  app.post(
    BASE_PATH,
    requireAuthentication(),
    validateParams(
      v.strictObject({ organizationId: organizationIdSchema, documentId: documentIdSchema }),
    ),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId, documentId } = c.req.valid('param');

      const { document } = await getAuthorizedPdfDocument({ userId, organizationId, documentId });

      if (document.isDeleted || document.mimeType !== 'application/pdf') {
        throw createDocumentIsNotPdfError();
      }

      const { fileStream } = await documentsStorageService.getFileStream({
        storageKey: document.originalStorageKey,
        fileEncryptionAlgorithm: document.fileEncryptionAlgorithm,
        fileEncryptionKekVersion: document.fileEncryptionKekVersion,
        fileEncryptionKeyWrapped: document.fileEncryptionKeyWrapped,
      });

      const { job } = await jobs.start({ documentId, organizationId, inputStream: fileStream });

      return c.json({ job: formatJob(job) }, 202);
    },
  );

  app.get(
    `${BASE_PATH}/:jobId`,
    requireAuthentication(),
    validateParams(jobParamsSchema),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId, documentId, jobId } = c.req.valid('param');

      await getAuthorizedPdfDocument({ userId, organizationId, documentId });
      const { job } = jobs.getJob({ jobId, documentId, organizationId });

      return c.json({ job: formatJob(job) });
    },
  );

  app.get(
    `${BASE_PATH}/:jobId/file`,
    requireAuthentication(),
    validateParams(jobParamsSchema),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId, documentId, jobId } = c.req.valid('param');

      await getAuthorizedPdfDocument({ userId, organizationId, documentId });
      const { job } = jobs.getJob({ jobId, documentId, organizationId });

      if (job.status !== 'completed') {
        throw createPdfOptimizationNotCompletedError();
      }

      return c.body(Readable.toWeb(createReadStream(job.outputPath)), 200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment',
        'Content-Length': String(job.outputSize ?? 0),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      });
    },
  );

  app.delete(
    `${BASE_PATH}/:jobId`,
    requireAuthentication(),
    validateParams(jobParamsSchema),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId, documentId, jobId } = c.req.valid('param');

      await getAuthorizedPdfDocument({ userId, organizationId, documentId });
      await jobs.cancel({ jobId, documentId, organizationId });

      return c.body(null, 204);
    },
  );

  app.post(
    `${BASE_PATH}/:jobId/apply`,
    requireAuthentication(),
    validateParams(jobParamsSchema),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId, documentId, jobId } = c.req.valid('param');

      const { document } = await getAuthorizedPdfDocument({ userId, organizationId, documentId });
      const { job } = jobs.getJob({ jobId, documentId, organizationId });

      if (job.status !== 'completed') {
        throw createPdfOptimizationNotCompletedError();
      }

      const { pattern } = config.documentsStorage;

      await applyPdfOptimization({
        document,
        optimizedFilePath: job.outputPath,
        userId,
        db,
        documentsRepository: createDocumentsRepository({ db }),
        documentsStorageService,
        createDocumentStorageKey: buildCreateDocumentStorageKey({
          storagePatternConfig: pattern,
          documentsStorageService,
          resolveStoragePatternContext: buildResolveStoragePatternContext({
            organizationsRepository: createOrganizationsRepository({ db }),
          }),
        }),
        maxIncrementalSuffixAttempts: pattern.maxIncrementalSuffixAttempts,
        enableRandomSuffixFallback: pattern.enableRandomSuffixFallback,
      });

      await jobs.discard({ jobId });

      return c.body(null, 204);
    },
  );
}
