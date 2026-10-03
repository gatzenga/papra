import type { ConfigDefinition } from 'figue';
import * as v from 'valibot';
import { coercedNumberSchema } from '../../shared/schemas/number.schemas';

export const pdfOptimizationConfig = {
  command: {
    doc: 'The OCRmyPDF executable used to optimize PDFs',
    schema: v.string(),
    default: 'ocrmypdf',
    env: 'PDF_OPTIMIZATION_OCRMYPDF_COMMAND',
  },
  languages: {
    doc: 'Tesseract language codes used by the PDF optimization, joined with a plus sign (e.g. "deu+eng")',
    schema: v.pipe(v.string(), v.regex(/^[a-z_]{3,}(?:\+[a-z_]{3,})*$/i)),
    default: 'deu+eng',
    env: 'PDF_OPTIMIZATION_LANGUAGES',
  },
  timeoutSeconds: {
    doc: 'Maximum duration of one PDF optimization before it is stopped',
    schema: v.pipe(coercedNumberSchema, v.integer(), v.minValue(1)),
    default: 3600,
    env: 'PDF_OPTIMIZATION_TIMEOUT_SECONDS',
  },
  maxConcurrentJobs: {
    doc: 'How many PDF optimizations may run at the same time',
    schema: v.pipe(coercedNumberSchema, v.integer(), v.minValue(1)),
    default: 2,
    env: 'PDF_OPTIMIZATION_MAX_CONCURRENT_JOBS',
  },
} as const satisfies ConfigDefinition;
