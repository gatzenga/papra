import { apiClient } from '../shared/http/api-client';

export type PdfOptimizationJob = {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
};

type Target = { organizationId: string; documentId: string };

const getBasePath = ({ organizationId, documentId }: Target) =>
  `/api/organizations/${organizationId}/documents/${documentId}/pdf-optimization`;

export async function startPdfOptimization(target: Target) {
  const { job } = await apiClient<{ job: PdfOptimizationJob }>({
    method: 'POST',
    path: getBasePath(target),
    retry: 0,
  });

  return { job };
}

export async function fetchPdfOptimizationJob({ jobId, ...target }: Target & { jobId: string }) {
  const { job } = await apiClient<{ job: PdfOptimizationJob }>({
    method: 'GET',
    path: `${getBasePath(target)}/${jobId}`,
    retry: 0,
  });

  return { job };
}

export async function fetchPdfOptimizationFile({ jobId, ...target }: Target & { jobId: string }) {
  const blob = await apiClient({
    method: 'GET',
    path: `${getBasePath(target)}/${jobId}/file`,
    responseType: 'blob',
  });

  return new Blob([blob], { type: 'application/pdf' });
}

export async function cancelPdfOptimization({ jobId, ...target }: Target & { jobId: string }) {
  await apiClient({ method: 'DELETE', path: `${getBasePath(target)}/${jobId}` });
}

export async function applyPdfOptimization({ jobId, ...target }: Target & { jobId: string }) {
  await apiClient({ method: 'POST', path: `${getBasePath(target)}/${jobId}/apply`, retry: 0 });
}
