import type { Database } from '../../app/database/database.types';
import type { Logger } from '../../shared/logger/logger';
import type { StorageService } from '../../storage/drivers/drivers.models';
import type { CreateDocumentStorageKey } from '../document-storage.usecases';
import type { Document } from '../documents.types';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../shared/logger/logger';
import { TRASH_STORAGE_KEY_PREFIX } from '../../storage/storage.constants';
import { ensureStorageKeyIsAvailable } from '../../storage/storage.usecases';
import { createDocumentAlreadyExistsError } from '../documents.errors';
import { generateDocumentId } from '../documents.models';
import { documentsTable } from '../documents.table';
import { createPdfOptimizationUnchangedError } from './pdf-optimization.errors';
import type { DocumentsRepository } from '../documents.repository';

async function computeFileSha256({ filePath }: { filePath: string }) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);

  return hash.digest('hex');
}

// Replaces the file of a document by its optimized version. The document keeps its id, name, tags
// and notes; the previous file is kept as a trashed document so nothing is lost.
export async function applyPdfOptimization({
  document,
  optimizedFilePath,
  userId,
  db,
  documentsRepository,
  documentsStorageService,
  createDocumentStorageKey,
  maxIncrementalSuffixAttempts,
  enableRandomSuffixFallback,
  logger = createLogger({ namespace: 'pdf-optimization' }),
}: {
  document: Document;
  optimizedFilePath: string;
  userId: string;
  db: Database;
  documentsRepository: Pick<
    DocumentsRepository,
    'getOrganizationDocumentBySha256Hash' | 'updateDocumentStorageKeyById'
  >;
  documentsStorageService: StorageService;
  createDocumentStorageKey: CreateDocumentStorageKey;
  maxIncrementalSuffixAttempts: number;
  enableRandomSuffixFallback: boolean;
  logger?: Logger;
}) {
  const [sha256Hash, { size }] = await Promise.all([
    computeFileSha256({ filePath: optimizedFilePath }),
    stat(optimizedFilePath),
  ]);

  if (sha256Hash === document.originalSha256Hash) {
    throw createPdfOptimizationUnchangedError();
  }

  const { document: sameContentDocument } =
    await documentsRepository.getOrganizationDocumentBySha256Hash({
      sha256Hash,
      organizationId: document.organizationId,
    });

  if (sameContentDocument) {
    throw createDocumentAlreadyExistsError();
  }

  const previousStorageKey = document.originalStorageKey;

  // 1. The new file goes next to the old one, under a free key
  const { storageKey: newStorageKey } = await createDocumentStorageKey({
    documentId: document.id,
    documentName: document.name,
    documentDate: document.documentDate,
    documentCreatedAt: document.createdAt,
    organizationId: document.organizationId,
  });

  const encryptionContext = await documentsStorageService.saveFile({
    fileStream: createReadStream(optimizedFilePath),
    fileName: document.name,
    mimeType: document.mimeType,
    storageKey: newStorageKey,
  });

  // 2. The old file is copied to the trash
  const { storageKey: trashStorageKey } = await ensureStorageKeyIsAvailable({
    initialStorageKey: `${TRASH_STORAGE_KEY_PREFIX}${previousStorageKey}`,
    maxIncrementalSuffixAttempts,
    enableRandomSuffixFallback,
    storageService: documentsStorageService,
    logger,
  });

  try {
    await documentsStorageService.copyFile({
      sourceStorageKey: previousStorageKey,
      destinationStorageKey: trashStorageKey,
    });
  } catch (error) {
    await documentsStorageService.deleteFile({ storageKey: newStorageKey }).catch(() => {});
    throw error;
  }

  // 3. Both records change atomically: the document points at the new file, a trashed copy keeps the old one
  const now = new Date();

  try {
    await db.batch([
      db
        .update(documentsTable)
        .set({
          originalStorageKey: newStorageKey,
          originalSize: size,
          originalSha256Hash: sha256Hash,
          fileEncryptionKeyWrapped: encryptionContext.fileEncryptionKeyWrapped ?? null,
          fileEncryptionKekVersion: encryptionContext.fileEncryptionKekVersion ?? null,
          fileEncryptionAlgorithm: encryptionContext.fileEncryptionAlgorithm ?? null,
          updatedAt: now,
        })
        .where(eq(documentsTable.id, document.id)),
      db.insert(documentsTable).values({
        id: generateDocumentId(),
        organizationId: document.organizationId,
        createdBy: document.createdBy,
        originalName: document.originalName,
        originalSize: document.originalSize,
        originalStorageKey: trashStorageKey,
        originalSha256Hash: document.originalSha256Hash,
        name: document.name,
        mimeType: document.mimeType,
        content: document.content,
        documentDate: document.documentDate,
        notes: document.notes,
        fileEncryptionKeyWrapped: document.fileEncryptionKeyWrapped,
        fileEncryptionKekVersion: document.fileEncryptionKekVersion,
        fileEncryptionAlgorithm: document.fileEncryptionAlgorithm,
        isDeleted: true,
        deletedAt: now,
        deletedBy: userId,
      }),
    ]);
  } catch (error) {
    await Promise.all([
      documentsStorageService.deleteFile({ storageKey: newStorageKey }).catch(() => {}),
      documentsStorageService.deleteFile({ storageKey: trashStorageKey }).catch(() => {}),
    ]);
    throw error;
  }

  // 4. The old file is no longer referenced by the document, drop it and take its (clean) place
  await documentsStorageService.deleteFile({ storageKey: previousStorageKey }).catch((error) => {
    logger.error({ error, storageKey: previousStorageKey }, 'Failed to remove the replaced file');
  });

  let finalStorageKey = newStorageKey;

  if (
    newStorageKey !== previousStorageKey &&
    !(await documentsStorageService.fileExists({ storageKey: previousStorageKey }))
  ) {
    try {
      await documentsStorageService.copyFile({
        sourceStorageKey: newStorageKey,
        destinationStorageKey: previousStorageKey,
      });
      await documentsRepository.updateDocumentStorageKeyById({
        documentId: document.id,
        sourceStorageKey: newStorageKey,
        storageKey: previousStorageKey,
      });
      await documentsStorageService.deleteFile({ storageKey: newStorageKey });
      finalStorageKey = previousStorageKey;
    } catch (error) {
      // Not critical: the document works with the suffixed key
      logger.warn({ error, newStorageKey }, 'Could not move the optimized file to its usual key');
    }
  }

  logger.info(
    { documentId: document.id, previousStorageKey, storageKey: finalStorageKey, trashStorageKey },
    'PDF optimization applied',
  );

  return { storageKey: finalStorageKey };
}
