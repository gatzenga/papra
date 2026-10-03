import type { Component } from 'solid-js';
import { useParams } from '@/modules/shared/router/use-params';
import { useQuery } from '@tanstack/solid-query';
import {
  createEffect,
  createMemo,
  createSignal,
  lazy,
  on,
  onCleanup,
  Show,
  Suspense,
} from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createToast } from '@/modules/ui/components/sonner';
import { Button } from '@/modules/ui/components/button';
import { Progress } from '@/modules/ui/components/progress';
import { linkScrollContainers } from '../components/pdf-viewer/synced-pdf-pane.component';
import { getDocumentPath } from '../document.models';
import { DOCUMENTS_BROADCAST_CHANNEL } from '../documents.constants';
import { fetchDocument, fetchDocumentFile } from '../documents.services';
import type { PdfOptimizationJob } from '../pdf-optimization.services';
import {
  applyPdfOptimization,
  cancelPdfOptimization,
  fetchPdfOptimizationFile,
  fetchPdfOptimizationJob,
  startPdfOptimization,
} from '../pdf-optimization.services';

const SyncedPdfPane = lazy(async () =>
  import('../components/pdf-viewer/synced-pdf-pane.component').then((m) => ({
    default: m.SyncedPdfPane,
  })),
);

function useObjectUrl(getBlob: () => Blob | undefined) {
  const getUrl = createMemo<string | undefined>((previous) => {
    if (previous) {
      URL.revokeObjectURL(previous);
    }

    const blob = getBlob();

    return blob ? URL.createObjectURL(blob) : undefined;
  });

  onCleanup(() => {
    const url = getUrl();

    if (url) {
      URL.revokeObjectURL(url);
    }
  });

  return getUrl;
}

export const PdfOptimizationPage: Component = () => {
  const params = useParams();
  const { t } = useI18n();

  const target = () => ({ organizationId: params.organizationId, documentId: params.documentId });

  const documentQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', params.documentId],
    queryFn: async () => fetchDocument(target()),
  }));

  const originalQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', params.documentId, 'file'],
    queryFn: async () => fetchDocumentFile(target()),
  }));

  const [getJob, setJob] = createSignal<PdfOptimizationJob>();
  const [getResult, setResult] = createSignal<Blob>();
  const [getIsApplying, setIsApplying] = createSignal(false);
  const [getFailure, setFailure] = createSignal<string>();

  const getOriginalUrl = useObjectUrl(() => originalQuery.data);
  const getResultUrl = useObjectUrl(getResult);

  const getIsRunning = () => getJob()?.status === 'running';
  const getIsCompleted = () => getJob()?.status === 'completed' && getResult() !== undefined;

  // The two panes scroll together once both documents are shown
  const [getOriginalContainer, setOriginalContainer] = createSignal<HTMLElement>();
  const [getResultContainer, setResultContainer] = createSignal<HTMLElement>();

  createEffect(() => {
    const first = getOriginalContainer();
    const second = getResultContainer();

    if (first && second) {
      onCleanup(linkScrollContainers({ first, second }));
    }
  });

  // Poll the job while it runs
  createEffect(
    on(getIsRunning, (isRunning) => {
      if (!isRunning) {
        return;
      }

      const timer = setInterval(async () => {
        const job = getJob();

        if (!job) {
          return;
        }

        try {
          const { job: updatedJob } = await fetchPdfOptimizationJob({ ...target(), jobId: job.id });
          setJob(updatedJob);

          if (updatedJob.status === 'completed') {
            setResult(await fetchPdfOptimizationFile({ ...target(), jobId: job.id }));
          }

          if (updatedJob.status === 'failed') {
            setFailure(updatedJob.error ?? t('documents.pdf-optimization.failed'));
          }
        } catch {
          // The job disappeared (cancelled or expired)
          setJob(undefined);
        }
      }, 1000);

      onCleanup(() => clearInterval(timer));
    }),
  );

  const handleStart = async () => {
    setFailure(undefined);
    setResult(undefined);

    try {
      const { job } = await startPdfOptimization(target());
      setJob(job);
    } catch {
      setFailure(t('documents.pdf-optimization.failed'));
    }
  };

  const handleCancel = async () => {
    const job = getJob();

    setJob(undefined);

    if (job) {
      await cancelPdfOptimization({ ...target(), jobId: job.id }).catch(() => {});
    }
  };

  const handleApply = async () => {
    const job = getJob();

    if (!job || getIsApplying()) {
      return;
    }

    setIsApplying(true);

    try {
      await applyPdfOptimization({ ...target(), jobId: job.id });
      createToast({ type: 'success', message: t('documents.pdf-optimization.applied') });

      const channel = new BroadcastChannel(DOCUMENTS_BROADCAST_CHANNEL);
      channel.postMessage({ type: 'document-updated', ...target() });
      channel.close();

      window.close();
      // Closing only works for tabs opened by the app, otherwise show the document
      window.location.href = documentQuery.data
        ? getDocumentPath({ document: documentQuery.data.document })
        : '/documents';
    } catch {
      createToast({ type: 'error', message: t('documents.pdf-optimization.apply-failed') });
      setIsApplying(false);
    }
  };

  // Leaving the page stops a running optimization
  onCleanup(() => {
    const job = getJob();

    if (job?.status === 'running') {
      void cancelPdfOptimization({ ...target(), jobId: job.id }).catch(() => {});
    }
  });

  const getProgressPercent = () => Math.round((getJob()?.progress ?? 0) * 100);

  return (
    <div class="flex flex-col h-screen overflow-hidden">
      <div class="flex items-center gap-3 px-3 py-2 border-b bg-card shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <div class="i-tabler-file-type-pdf size-5 text-muted-foreground shrink-0" />
          <span class="text-sm font-medium truncate">{documentQuery.data?.document.name}</span>
          <span class="text-sm text-muted-foreground hidden md:inline">
            {t('documents.pdf-optimization.title')}
          </span>
        </div>

        <div class="flex-1 flex items-center justify-center min-w-0 px-4">
          <Show when={getIsRunning()}>
            <Progress
              class="max-w-md"
              value={getProgressPercent()}
              minValue={0}
              maxValue={100}
              getValueLabel={({ value }) => `${value}%`}
            />
            <span class="ml-3 text-sm text-muted-foreground tabular-nums w-10">
              {getProgressPercent()}%
            </span>
          </Show>
          <Show when={getFailure()}>
            <span class="text-sm text-destructive truncate">{getFailure()}</span>
          </Show>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <Show
            when={getIsRunning()}
            fallback={
              <Button variant="outline" onClick={handleStart} disabled={getIsApplying()}>
                <div class="i-tabler-player-play size-4 mr-2" />
                {getJob() === undefined && getResult() === undefined
                  ? t('documents.pdf-optimization.start')
                  : t('documents.pdf-optimization.restart')}
              </Button>
            }
          >
            <Button variant="outline" onClick={handleCancel}>
              <div class="i-tabler-player-stop size-4 mr-2" />
              {t('documents.pdf-optimization.cancel')}
            </Button>
          </Show>

          <Button onClick={handleApply} disabled={!getIsCompleted()} isLoading={getIsApplying()}>
            <div class="i-tabler-check size-4 mr-2" />
            {t('documents.pdf-optimization.apply')}
          </Button>
        </div>
      </div>

      <div class="flex-1 min-h-0 grid grid-cols-2 gap-px bg-border">
        <div class="flex flex-col min-h-0 bg-background">
          <div class="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b shrink-0">
            {t('documents.pdf-optimization.original')}
          </div>
          <div class="flex-1 min-h-0 relative">
            <Suspense>
              <Show when={getOriginalUrl()}>
                {(url) => <SyncedPdfPane url={url()} onScrollContainer={setOriginalContainer} />}
              </Show>
            </Suspense>
          </div>
        </div>

        <div class="flex flex-col min-h-0 bg-background">
          <div class="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b shrink-0">
            {t('documents.pdf-optimization.optimized')}
          </div>
          <div class="flex-1 min-h-0 relative">
            <Show
              when={getResultUrl()}
              fallback={
                <div class="h-full flex items-center justify-center text-center px-8 text-sm text-muted-foreground">
                  <Show
                    when={getIsRunning()}
                    fallback={<p class="max-w-sm">{t('documents.pdf-optimization.description')}</p>}
                  >
                    <div class="flex flex-col items-center gap-2">
                      <div class="i-tabler-loader-2 size-6 animate-spin" />
                      <p>{t('documents.pdf-optimization.running')}</p>
                    </div>
                  </Show>
                </div>
              }
            >
              {(url) => (
                <Suspense>
                  <SyncedPdfPane url={url()} onScrollContainer={setResultContainer} />
                </Suspense>
              )}
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
