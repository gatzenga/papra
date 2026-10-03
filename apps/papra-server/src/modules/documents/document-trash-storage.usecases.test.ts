import { Buffer } from 'node:buffer';
import { createNoopLogger } from '@crowlog/logger';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { createReadableStream } from '../shared/streams/readable-stream';
import { inMemoryStorageDriverFactory } from '../storage/drivers/memory/memory.storage-driver';
import { wrapWithEncryptionLayer } from '../storage/encryption/storage-encryption.services';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { buildCreateDocumentStorageKey } from './document-storage.usecases';
import {
  buildSyncDocumentFileWithTrashState,
  syncAllDocumentFilesWithTrashState,
} from './document-trash-storage.usecases';
import { createDocumentsRepository } from './documents.repository';
import { buildResolveStoragePatternContext } from './storage-patterns/storage-pattern.usecases';

const storagePatternConfig = {
  isStorageKeySyncEnabled: false,
  isLegacyMigrationOnStartEnabled: false,
  isTrashFolderEnabled: true,
  useLegacyStorageKeyDefinitionSystem: false,
  storageKeyPattern: '{{document.name}}',
  enableRandomSuffixFallback: true,
  maxIncrementalSuffixAttempts: 9,
};

async function setup() {
  const { db } = await createInMemoryDatabase({
    organizations: [{ id: 'org_1', name: 'Organization' }],
  });
  const documentsRepository = createDocumentsRepository({ db });
  const documentsStorageService = wrapWithEncryptionLayer({
    storageDriver: inMemoryStorageDriverFactory(),
    encryptionOptions: { isEncryptionEnabled: false, keyEncryptionKeys: [{ version: '1', key: Buffer.alloc(32, 1) }] },
  });

  await documentsStorageService.saveFile({
    storageKey: 'invoice.pdf',
    fileName: 'invoice.pdf',
    mimeType: 'application/pdf',
    fileStream: createReadableStream({ content: 'bytes' }),
  });
  await documentsRepository.saveOrganizationDocument({
    id: 'doc_1',
    organizationId: 'org_1',
    name: 'invoice.pdf',
    originalName: 'invoice.pdf',
    originalStorageKey: 'invoice.pdf',
    originalSha256Hash: 'hash',
    mimeType: 'application/pdf',
  });

  const sync = buildSyncDocumentFileWithTrashState({
    storagePatternConfig,
    documentsRepository,
    documentsStorageService,
    createDocumentStorageKey: buildCreateDocumentStorageKey({
      storagePatternConfig,
      documentsStorageService,
      resolveStoragePatternContext: buildResolveStoragePatternContext({
        organizationsRepository: createOrganizationsRepository({ db }),
      }),
    }),
    logger: createNoopLogger(),
  });

  const getDocument = async () => {
    const { document } = await documentsRepository.getDocumentById({ documentId: 'doc_1', organizationId: 'org_1' });
    return document!;
  };

  return { documentsRepository, documentsStorageService, sync, getDocument };
}

describe('document-trash-storage usecases', () => {
  test('a trashed document file moves to the trash and back to its name when restored', async () => {
    const { documentsRepository, documentsStorageService, sync, getDocument } = await setup();

    await documentsRepository.softDeleteDocument({ documentId: 'doc_1', organizationId: 'org_1', userId: undefined as never });
    expect(await sync({ document: await getDocument() })).to.eql({ moved: true });

    expect((await getDocument()).originalStorageKey).to.eql('.trash/invoice.pdf');
    expect(await documentsStorageService.fileExists({ storageKey: '.trash/invoice.pdf' })).to.eql(true);
    expect(await documentsStorageService.fileExists({ storageKey: 'invoice.pdf' })).to.eql(false);

    // Nothing left to do while it stays trashed
    expect(await sync({ document: await getDocument() })).to.eql({ moved: false });

    await documentsRepository.restoreDocument({ documentId: 'doc_1', organizationId: 'org_1' });
    expect(await sync({ document: await getDocument() })).to.eql({ moved: true });

    expect((await getDocument()).originalStorageKey).to.eql('invoice.pdf');
    expect(await documentsStorageService.fileExists({ storageKey: 'invoice.pdf' })).to.eql(true);
    expect(await documentsStorageService.fileExists({ storageKey: '.trash/invoice.pdf' })).to.eql(false);
  });

  test('syncAllDocumentFilesWithTrashState moves documents trashed before the trash folder existed', async () => {
    const { documentsRepository, sync, getDocument } = await setup();

    await documentsRepository.softDeleteDocument({ documentId: 'doc_1', organizationId: 'org_1', userId: undefined as never });

    expect(
      await syncAllDocumentFilesWithTrashState({
        documentsRepository,
        syncDocumentFileWithTrashState: sync,
        logger: createNoopLogger(),
      }),
    ).to.eql({ moved: 1, failed: 0 });
    expect((await getDocument()).originalStorageKey).to.eql('.trash/invoice.pdf');
  });
});
