import { createErrorFactory } from '../../shared/errors/errors';

export const createDocumentIsNotPdfError = createErrorFactory({
  message: 'Only PDF documents can be optimized.',
  code: 'document.not_a_pdf',
  statusCode: 400,
});

export const createPdfOptimizationJobNotFoundError = createErrorFactory({
  message: 'PDF optimization not found.',
  code: 'pdf_optimization.not_found',
  statusCode: 404,
});

export const createPdfOptimizationNotCompletedError = createErrorFactory({
  message: 'The PDF optimization is not completed.',
  code: 'pdf_optimization.not_completed',
  statusCode: 409,
});

export const createTooManyPdfOptimizationsError = createErrorFactory({
  message: 'Too many PDF optimizations are running, try again later.',
  code: 'pdf_optimization.too_many_running',
  statusCode: 429,
});

export const createPdfOptimizationUnchangedError = createErrorFactory({
  message: 'The optimized PDF is identical to the original.',
  code: 'pdf_optimization.unchanged',
  statusCode: 409,
});
