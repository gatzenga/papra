import type { ConfigDefinition } from 'figue';
import * as v from 'valibot';
import { coercedNumberSchema } from '../shared/schemas/number.schemas';

export const documentsConfig = {
  deletedDocumentsRetentionDays: {
    doc: 'The retention period in days for deleted documents',
    schema: v.pipe(coercedNumberSchema, v.integer(), v.minValue(0)),
    default: 30,
    env: 'DOCUMENTS_DELETED_DOCUMENTS_RETENTION_DAYS',
  },
} as const satisfies ConfigDefinition;
