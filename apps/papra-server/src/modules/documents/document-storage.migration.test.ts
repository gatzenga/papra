import { Buffer } from 'node:buffer';
import { createNoopLogger } from '@crowlog/logger';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { createReadableStream } from '../shared/streams/readable-stream';
import { inMemoryStorageDriverFactory } from '../storage/drivers/memory/memory.storage-driver';
import { wrapWithEncryptionLayer } from '../storage/encryption/storage-encryption.services';
import { isLegacyStorageKey, migrateLegacyDocumentStorageKeys } from './document-storage.migration';
import { createDocumentsRepository } from './documents.repository';

const storagePatternConfig = {
  isStorageKeySyncEnabled: false,
  isLegacyMigrationOnStartEnabled: true,
  isTrashFolderEnabled: false,
  useLegacyStorageKeyDefinitionSystem: false,
  storageKeyPattern: '{{document.name}}',
  enableRandomSuffixFallback: true,
  maxIncrementalSuffixAttempts: 9,
};

describe('document-storage migration', () => {
  describe('isLegacyStorageKey', () => {
    test('detects the legacy <org>/originals/<doc-id>.<ext> format only', () => {
      expect(isLegacyStorageKey({ storageKey: 'org_1/originals/doc_1.pdf', documentId: 'doc_1' })).to.eql(true);
      expect(isLegacyStorageKey({ storageKey: 'invoice.pdf', documentId: 'doc_1' })).to.eql(false);
      expect(isLegacyStorageKey({ storageKey: 'org_1/invoice.pdf', documentId: 'doc_1' })).to.eql(false);
    });
  });

  test('copies legacy documents to their name, keeps the old files and is idempotent', async () => {
    const { db } = await createInMemoryDatabase({
      organizations: [{ id: 'org_1', name: 'Organization' }],
    });
    const documentsRepository = createDocumentsRepository({ db });
    const documentsStorageService = wrapWithEncryptionLayer({
      storageDriver: inMemoryStorageDriverFactory(),
      encryptionOptions: { isEncryptionEnabled: false, keyEncryptionKeys: [{ version: '1', key: Buffer.alloc(32, 1) }] },
    });

    for (const id of ['doc_1', 'doc_2']) {
      const storageKey = `org_1/originals/${id}.pdf`;
      const encryptionContext = await documentsStorageService.saveFile({
        storageKey,
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        fileStream: createReadableStream({ content: `bytes of ${id}` }),
      });
      await documentsRepository.saveOrganizationDocument({
        id,
        organizationId: 'org_1',
        name: 'invoice.pdf', // same name twice, must not overwrite
        originalName: 'invoice.pdf',
        originalStorageKey: storageKey,
        originalSha256Hash: `hash_${id}`,
        mimeType: 'application/pdf',
        ...encryptionContext,
      });
    }

    const run = () =>
      migrateLegacyDocumentStorageKeys({ db, documentsStorageService, storagePatternConfig, logger: createNoopLogger() });

    expect(await run()).to.eql({ migrated: 2, failed: 0 });

    const { document: first } = await documentsRepository.getDocumentById({ documentId: 'doc_1', organizationId: 'org_1' });
    const { document: second } = await documentsRepository.getDocumentById({ documentId: 'doc_2', organizationId: 'org_1' });

    expect(first?.originalStorageKey).to.eql('invoice.pdf');
    expect(second?.originalStorageKey).to.eql('invoice_1.pdf');
    expect(await documentsStorageService.fileExists({ storageKey: 'org_1/originals/doc_1.pdf' })).to.eql(true);
    expect(await documentsStorageService.fileExists({ storageKey: 'invoice_1.pdf' })).to.eql(true);

    expect(await run()).to.eql({ migrated: 0, failed: 0 });
  });
});
