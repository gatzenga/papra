import type { Database } from '../app/database/database.types';
import type { Logger } from '../shared/logger/logger';
import type { StorageService } from '../storage/drivers/drivers.models';
import type { StoragePatternConfig } from './storage-patterns/storage-pattern.types';
import { safely } from '@corentinth/chisels';
import { eq } from 'drizzle-orm';
import { createLogger } from '../shared/logger/logger';
import { ensureStorageKeyIsAvailable } from '../storage/storage.usecases';
import { documentsTable } from './documents.table';
import { buildStorageKey } from './storage-patterns/storage-pattern.usecases';

// Legacy keys look like `<organization-id>/originals/<document-id>.<ext>`
export function isLegacyStorageKey({
  storageKey,
  documentId,
}: {
  storageKey: string;
  documentId: string;
}) {
  const parts = storageKey.split('/');
  const fileName = parts[parts.length - 1] ?? '';

  return parts.length >= 2 && parts[parts.length - 2] === 'originals' && fileName.startsWith(documentId);
}

// Copies every document that still has a legacy storage key to the key given by the configured
// pattern and points the database at the copy. Old files are never deleted, so the run is safe to
// repeat: migrated documents no longer have a legacy key and are skipped.
export async function migrateLegacyDocumentStorageKeys({
  db,
  documentsStorageService,
  storagePatternConfig,
  logger = createLogger({ namespace: 'migrate-document-storage-keys' }),
}: {
  db: Database;
  documentsStorageService: Pick<StorageService, 'fileExists' | 'copyFile' | 'deleteFile'>;
  storagePatternConfig: StoragePatternConfig;
  logger?: Logger;
}) {
  const documents = await db
    .select({
      id: documentsTable.id,
      organizationId: documentsTable.organizationId,
      name: documentsTable.name,
      documentDate: documentsTable.documentDate,
      createdAt: documentsTable.createdAt,
      originalStorageKey: documentsTable.originalStorageKey,
    })
    .from(documentsTable)
    // Trashed documents keep their file where the trash handling puts it
    .where(eq(documentsTable.isDeleted, false));

  const legacyDocuments = documents.filter((document) =>
    isLegacyStorageKey({ storageKey: document.originalStorageKey, documentId: document.id }),
  );

  if (legacyDocuments.length === 0) {
    return { migrated: 0, failed: 0 };
  }

  logger.info({ count: legacyDocuments.length }, 'Migrating legacy document storage keys');

  let migrated = 0;
  let failed = 0;

  for (const document of legacyDocuments) {
    const sourceStorageKey = document.originalStorageKey;

    const [storageKey, error] = await safely(
      (async () => {
        const { storageKey: initialStorageKey } = buildStorageKey({
          storageKeyPattern: storagePatternConfig.storageKeyPattern,
          documentId: document.id,
          documentName: document.name,
          documentDate: document.documentDate,
          documentCreatedAt: document.createdAt,
          organizationId: document.organizationId,
          now: new Date(),
        });

        const { storageKey } = await ensureStorageKeyIsAvailable({
          initialStorageKey,
          maxIncrementalSuffixAttempts: storagePatternConfig.maxIncrementalSuffixAttempts,
          enableRandomSuffixFallback: storagePatternConfig.enableRandomSuffixFallback,
          storageService: documentsStorageService,
          logger,
        });

        await documentsStorageService.copyFile({
          sourceStorageKey,
          destinationStorageKey: storageKey,
        });

        const [, updateError] = await safely(
          db
            .update(documentsTable)
            .set({ originalStorageKey: storageKey })
            .where(eq(documentsTable.id, document.id)),
        );

        if (updateError) {
          // The copy is ours (the key was free), drop it so nothing is left behind
          await safely(documentsStorageService.deleteFile({ storageKey }));
          throw updateError;
        }

        return storageKey;
      })(),
    );

    if (error) {
      failed++;
      logger.error({ error, documentId: document.id, sourceStorageKey }, 'Failed to migrate document');
      continue;
    }

    migrated++;
    logger.info({ documentId: document.id, sourceStorageKey, storageKey }, 'Document migrated');
  }

  logger.info({ migrated, failed }, 'Legacy document storage key migration done');

  return { migrated, failed };
}
