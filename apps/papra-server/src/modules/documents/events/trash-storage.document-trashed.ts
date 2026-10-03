import type { Database } from '../../app/database/database.types';
import type { EventServices } from '../../app/events/events.services';
import type { Config } from '../../config/config.types';
import type { StorageService } from '../../storage/storage.services';
import { createOrganizationsRepository } from '../../organizations/organizations.repository';
import { buildCreateDocumentStorageKey } from '../document-storage.usecases';
import { buildSyncDocumentFileWithTrashState } from '../document-trash-storage.usecases';
import { createDocumentsRepository } from '../documents.repository';
import { buildResolveStoragePatternContext } from '../storage-patterns/storage-pattern.usecases';

export function registerSyncDocumentFileWithTrashHandlers({
  eventServices,
  documentsStorageService,
  config,
  db,
}: {
  eventServices: EventServices;
  documentsStorageService: StorageService;
  config: Config;
  db: Database;
}) {
  if (!config.documentsStorage.pattern.isTrashFolderEnabled) {
    return;
  }

  const documentsRepository = createDocumentsRepository({ db });
  const syncDocumentFileWithTrashState = buildSyncDocumentFileWithTrashState({
    storagePatternConfig: config.documentsStorage.pattern,
    documentsRepository,
    documentsStorageService,
    createDocumentStorageKey: buildCreateDocumentStorageKey({
      storagePatternConfig: config.documentsStorage.pattern,
      documentsStorageService,
      resolveStoragePatternContext: buildResolveStoragePatternContext({
        organizationsRepository: createOrganizationsRepository({ db }),
      }),
    }),
  });

  async function syncDocuments({
    documentIds,
    organizationId,
  }: {
    documentIds: string[];
    organizationId: string;
  }) {
    for (const documentId of documentIds) {
      const { document } = await documentsRepository.getDocumentById({ documentId, organizationId });

      if (document) {
        await syncDocumentFileWithTrashState({ document });
      }
    }
  }

  eventServices.onEvent({
    eventName: 'documents.trashed',
    handlerName: 'move-files-to-trash',
    handler: async ({ documentIds, organizationId }) =>
      syncDocuments({ documentIds, organizationId }),
  });

  eventServices.onEvent({
    eventName: 'document.restored',
    handlerName: 'move-files-from-trash',
    handler: async ({ documentId, organizationId }) =>
      syncDocuments({ documentIds: [documentId], organizationId }),
  });
}
