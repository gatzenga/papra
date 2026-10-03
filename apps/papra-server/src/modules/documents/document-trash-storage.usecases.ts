import type { Logger } from '../shared/logger/logger';
import type { StorageService } from '../storage/drivers/drivers.models';
import type { CreateDocumentStorageKey } from './document-storage.usecases';
import type { DocumentsRepository } from './documents.repository';
import type { StoragePatternConfig } from './storage-patterns/storage-pattern.types';
import { createLogger } from '../shared/logger/logger';
import { TRASH_STORAGE_KEY_PREFIX } from '../storage/storage.constants';
import { ensureStorageKeyIsAvailable } from '../storage/storage.usecases';

export function isTrashStorageKey({ storageKey }: { storageKey: string }) {
  return storageKey.startsWith(TRASH_STORAGE_KEY_PREFIX);
}

type TrashableDocument = {
  id: string;
  name: string;
  organizationId: string;
  documentDate: Date | null;
  createdAt: Date;
  originalStorageKey: string;
  isDeleted: boolean;
};

export type SyncDocumentFileWithTrashState = (args: {
  document: TrashableDocument;
}) => Promise<{ moved: boolean }>;

// Makes the location of a document's file match its trash state: files of trashed documents live
// under the trash prefix, files of restored documents go back to a regular key. The file is copied
// first and the old one only removed once the database points at the new key.
export function buildSyncDocumentFileWithTrashState({
  storagePatternConfig,
  documentsRepository,
  documentsStorageService,
  createDocumentStorageKey,
  logger = createLogger({ namespace: 'document-trash-storage' }),
}: {
  storagePatternConfig: StoragePatternConfig;
  documentsRepository: Pick<DocumentsRepository, 'updateDocumentStorageKeyById'>;
  documentsStorageService: Pick<StorageService, 'fileExists' | 'copyFile' | 'deleteFile'>;
  createDocumentStorageKey: CreateDocumentStorageKey;
  logger?: Logger;
}): SyncDocumentFileWithTrashState {
  return async ({ document }) => {
    if (!storagePatternConfig.isTrashFolderEnabled) {
      return { moved: false };
    }

    const sourceStorageKey = document.originalStorageKey;
    const isInTrash = isTrashStorageKey({ storageKey: sourceStorageKey });

    if (document.isDeleted === isInTrash) {
      return { moved: false };
    }

    const { storageKey } = document.isDeleted
      ? await ensureStorageKeyIsAvailable({
          initialStorageKey: `${TRASH_STORAGE_KEY_PREFIX}${sourceStorageKey}`,
          maxIncrementalSuffixAttempts: storagePatternConfig.maxIncrementalSuffixAttempts,
          enableRandomSuffixFallback: storagePatternConfig.enableRandomSuffixFallback,
          storageService: documentsStorageService,
          logger,
        })
      : await createDocumentStorageKey({
          documentId: document.id,
          documentName: document.name,
          documentDate: document.documentDate,
          documentCreatedAt: document.createdAt,
          organizationId: document.organizationId,
        });

    await documentsStorageService.copyFile({
      sourceStorageKey,
      destinationStorageKey: storageKey,
    });

    try {
      await documentsRepository.updateDocumentStorageKeyById({
        documentId: document.id,
        sourceStorageKey,
        storageKey,
      });
    } catch (error) {
      // The copy is ours (the key was free), drop it so nothing is left behind
      await documentsStorageService.deleteFile({ storageKey }).catch(() => {});
      throw error;
    }

    await documentsStorageService.deleteFile({ storageKey: sourceStorageKey }).catch((error) => {
      logger.error({ error, storageKey: sourceStorageKey }, 'Failed to remove the previous file');
    });

    logger.info(
      { documentId: document.id, sourceStorageKey, storageKey, isDeleted: document.isDeleted },
      'Document file moved',
    );

    return { moved: true };
  };
}
