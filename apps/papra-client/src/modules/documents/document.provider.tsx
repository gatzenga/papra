import type { Accessor, ParentComponent } from 'solid-js';
import { useNavigate, useParams as useRouterParams, useSearchParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  on,
  Show,
  useContext,
} from 'solid-js';
import { useOrganizationId } from '../organizations/organization.provider';
import { getDocumentPath } from './document.models';
import { fetchDocument, fetchDocumentBySlug } from './documents.services';

const DocumentContext = createContext<Accessor<string>>();

const DOCUMENT_ID_REGEX = /^doc_[a-z0-9]+$/;

function safelyDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Documents are addressed by the name of their file in the URL, pages work with their id. This resolves
// one into the other (links with an id keep working) and follows renames, which change the file name.
export const DocumentProvider: ParentComponent = (props) => {
  const params = useRouterParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const getOrganizationId = useOrganizationId();

  // The router hands out the segment as it is in the address, still encoded
  const getSlug = () => safelyDecode(params.documentSlug ?? '');
  const getIsDeleted = () => searchParams.deleted === '1';

  const [getResolved, setResolved] = createSignal<{ id: string; slug: string }>();

  const lookupQuery = useQuery(() => ({
    // Not needed when the URL carries the id, or once the document is known under this name
    enabled: !DOCUMENT_ID_REGEX.test(getSlug()) && getResolved()?.slug !== getSlug(),
    queryKey: ['organizations', getOrganizationId(), 'document-lookup', getSlug(), getIsDeleted()],
    queryFn: async () =>
      fetchDocumentBySlug({
        slug: getSlug(),
        isDeleted: getIsDeleted(),
        organizationId: getOrganizationId(),
      }),
    retry: false,
  }));

  createEffect(() => {
    const document = lookupQuery.data?.document;

    if (document) {
      setResolved({ id: document.id, slug: document.slug ?? getSlug() });
    }
  });

  const getDocumentId = createMemo(() => {
    const slug = getSlug();

    if (DOCUMENT_ID_REGEX.test(slug)) {
      return slug;
    }

    return getResolved()?.slug === slug ? getResolved()?.id : undefined;
  });

  // The document as the pages see it (same cache entry), to notice when its file name changes
  const documentQuery = useQuery(() => ({
    enabled: getDocumentId() !== undefined,
    queryKey: ['organizations', getOrganizationId(), 'documents', getDocumentId()],
    queryFn: async () =>
      fetchDocument({ documentId: getDocumentId() as string, organizationId: getOrganizationId() }),
  }));

  createEffect(
    on(
      () => documentQuery.data?.document,
      (document) => {
        if (!document || document.slug === undefined) {
          return;
        }

        const isOtherName = document.slug !== getSlug();

        // Rename, or a link with an id: show the address of the file name
        if (isOtherName) {
          setResolved({ id: document.id, slug: document.slug });

          // Keep what follows the document in the address (pdf-viewer, optimize) and the other parameters
          const [, , , ...rest] = window.location.pathname.split('/');
          const search = new URLSearchParams(window.location.search);
          search.delete('deleted');

          const [path] = getDocumentPath({
            document: { ...document, isDeleted: false },
            suffix: rest.length > 0 ? `/${rest.join('/')}` : '',
          }).split('?');
          if (document.isDeleted) {
            search.set('deleted', '1');
          }

          navigate(`${path}${search.size > 0 ? `?${search}` : ''}`, { replace: true });
        }
      },
    ),
  );

  return (
    <Show
      when={getDocumentId()}
      fallback={
        <Show when={lookupQuery.isError}>
          <div class="p-6 text-muted-foreground text-sm">Document not found</div>
        </Show>
      }
    >
      {(getId) => (
        <DocumentContext.Provider value={getId}>{props.children}</DocumentContext.Provider>
      )}
    </Show>
  );
};

export function useDocumentId() {
  return useContext(DocumentContext);
}
