import { Buffer } from 'node:buffer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNoopLogger } from '@crowlog/logger';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createOrganizationsRepository } from '../../organizations/organizations.repository';
import { createReadableStream } from '../../shared/streams/readable-stream';
import { inMemoryStorageDriverFactory } from '../../storage/drivers/memory/memory.storage-driver';
import { wrapWithEncryptionLayer } from '../../storage/encryption/storage-encryption.services';
import { buildCreateDocumentStorageKey } from '../document-storage.usecases';
import { createDocumentsRepository } from '../documents.repository';
import { buildResolveStoragePatternContext } from '../storage-patterns/storage-pattern.usecases';
import { applyPdfOptimization } from './pdf-optimization.usecases';

const storagePatternConfig = {
  isStorageKeySyncEnabled: false,
  isTrashFolderEnabled: true,
  useLegacyStorageKeyDefinitionSystem: false,
  storageKeyPattern: '{{document.name}}',
  enableRandomSuffixFallback: true,
  maxIncrementalSuffixAttempts: 9,
};

async function setup() {
  const { db } = await createInMemoryDatabase({
    organizations: [{ id: 'org_1', name: 'Organization' }],
    users: [{ id: 'usr_1', email: 'user@example.com' }],
  });
  const documentsRepository = createDocumentsRepository({ db });
  const documentsStorageService = wrapWithEncryptionLayer({
    storageDriver: inMemoryStorageDriverFactory(),
    encryptionOptions: {
      isEncryptionEnabled: false,
      keyEncryptionKeys: [{ version: '1', key: Buffer.alloc(32, 1) }],
    },
  });

  await documentsStorageService.saveFile({
    storageKey: 'Akte.pdf',
    fileName: 'Akte.pdf',
    mimeType: 'application/pdf',
    fileStream: createReadableStream({ content: 'scanned pdf' }),
  });
  const { document } = await documentsRepository.saveOrganizationDocument({
    id: 'doc_1',
    organizationId: 'org_1',
    name: 'Akte.pdf',
    originalName: 'Akte.pdf',
    originalSize: 11,
    originalStorageKey: 'Akte.pdf',
    originalSha256Hash: 'hash_original',
    mimeType: 'application/pdf',
    notes: 'keep me',
  });

  const directory = await mkdtemp(join(tmpdir(), 'papra-test-'));
  const optimizedFilePath = join(directory, 'output.pdf');
  await writeFile(optimizedFilePath, 'optimized pdf with text layer');

  const apply = async () =>
    applyPdfOptimization({
      document,
      optimizedFilePath,
      userId: 'usr_1',
      db,
      documentsRepository,
      documentsStorageService,
      createDocumentStorageKey: buildCreateDocumentStorageKey({
        storagePatternConfig,
        documentsStorageService,
        resolveStoragePatternContext: buildResolveStoragePatternContext({
          organizationsRepository: createOrganizationsRepository({ db }),
        }),
      }),
      maxIncrementalSuffixAttempts: 9,
      enableRandomSuffixFallback: true,
      logger: createNoopLogger(),
    });

  return { db, documentsRepository, documentsStorageService, apply, directory, document };
}

describe('pdf-optimization usecases', () => {
  describe('applyPdfOptimization', () => {
    test('the document keeps its identity but points at the optimized file, the previous file is kept as a trashed document', async () => {
      const { documentsRepository, documentsStorageService, apply, directory, document } =
        await setup();

      expect(await apply()).to.eql({ storageKey: 'Akte.pdf' });

      const { document: updated } = await documentsRepository.getDocumentById({
        documentId: 'doc_1',
        organizationId: 'org_1',
      });

      expect(updated).to.include({
        id: 'doc_1',
        name: 'Akte.pdf',
        notes: 'keep me',
        originalStorageKey: 'Akte.pdf',
        isDeleted: false,
      });
      expect(updated?.originalSha256Hash).to.not.eql(document.originalSha256Hash);
      expect(updated?.originalSize).to.eql('optimized pdf with text layer'.length);

      const { documents: trashed } = await documentsRepository.getOrganizationDeletedDocuments({
        organizationId: 'org_1',
        pageIndex: 0,
        pageSize: 10,
      });

      expect(trashed).to.have.length(1);
      expect(trashed[0]).to.include({
        name: 'Akte.pdf',
        originalSha256Hash: 'hash_original',
        originalSize: 11,
        originalStorageKey: '.trash/Akte.pdf',
        isDeleted: true,
      });

      expect(await documentsStorageService.fileExists({ storageKey: '.trash/Akte.pdf' })).to.eql(
        true,
      );
      expect(await documentsStorageService.fileExists({ storageKey: 'Akte.pdf' })).to.eql(true);

      await rm(directory, { recursive: true, force: true });
    });

    test('an optimized file identical to the original is refused and nothing changes', async () => {
      const { documentsStorageService, directory, document, db, documentsRepository } =
        await setup();
      const { createHash } = await import('node:crypto');
      const sameContentPath = join(directory, 'same.pdf');
      await writeFile(sameContentPath, 'same');

      await expect(
        applyPdfOptimization({
          document: {
            ...document,
            originalSha256Hash: createHash('sha256').update('same').digest('hex'),
          },
          optimizedFilePath: sameContentPath,
          userId: 'usr_1',
          db,
          documentsRepository,
          documentsStorageService,
          createDocumentStorageKey: async () => ({ storageKey: 'unused' }),
          maxIncrementalSuffixAttempts: 9,
          enableRandomSuffixFallback: true,
          logger: createNoopLogger(),
        }),
      ).rejects.toMatchObject({ code: 'pdf_optimization.unchanged' });

      expect(await documentsStorageService.fileExists({ storageKey: '.trash/Akte.pdf' })).to.eql(
        false,
      );

      await rm(directory, { recursive: true, force: true });
    });
  });
});
