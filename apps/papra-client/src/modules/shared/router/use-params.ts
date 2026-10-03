import { useParams as useRouterParams } from '@solidjs/router';
import { useDocumentId } from '@/modules/documents/document.provider';
import { useOrganizationId } from '@/modules/organizations/organization.provider';

// The router params, plus what is no longer part of the URL as an id: the (single) organization and,
// on document pages, the document, which the URL addresses by file name
export function useParams() {
  const params = useRouterParams();
  const getOrganizationId = useOrganizationId();
  const getDocumentId = useDocumentId();

  return new Proxy(params, {
    get: (target, property) => {
      if (property === 'organizationId') {
        return getOrganizationId();
      }

      if (property === 'documentId' && getDocumentId) {
        return getDocumentId();
      }

      return target[property as string];
    },
  }) as typeof params & { organizationId: string; documentId: string };
}
