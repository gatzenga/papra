import type { Accessor, ParentComponent } from 'solid-js';
import { safely } from '@corentinth/chisels';
import { useNavigate } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { fetchOrganizations } from '../organizations/organizations.services';
import {
  createContext,
  createEffect,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
  useContext,
} from 'solid-js';
import {
  getDocumentIcon,
  getDocumentPath,
  makeDocumentSearchPermalink,
} from '../documents/document.models';
import { fetchOrganizationDocuments } from '../documents/documents.services';
import { useI18n } from '../i18n/i18n.provider';
import { cn } from '../shared/style/cn';
import { toArrayIf } from '../shared/utils/array';
import { debounce } from '../shared/utils/timing';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
} from '../ui/components/command';

const CommandPaletteContext = createContext<{
  getIsCommandPaletteOpen: Accessor<boolean>;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
}>();

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);

  if (!context) {
    throw new Error('CommandPalette context not found');
  }

  return context;
}

export const CommandPaletteProvider: ParentComponent = (props) => {
  const [getIsCommandPaletteOpen, setIsCommandPaletteOpen] = createSignal(false);
  const [getMatchingDocuments, setMatchingDocuments] = createSignal<
    { id: string; name: string; slug?: string; isDeleted?: boolean }[]
  >([]);
  const [getSearchQuery, setSearchQuery] = createSignal('');
  const [getIsLoading, setIsLoading] = createSignal(false);
  const [getMatchingDocumentsTotalCount, setMatchingDocumentsTotalCount] = createSignal(0);

  // The provider lives above the routes, so it looks the organization up itself
  // Only once opened: the palette is also mounted on public pages, where this request would fail
  const organizationsQuery = useQuery(() => ({
    enabled: getIsCommandPaletteOpen(),
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
  }));
  const getOrganizationId = () => organizationsQuery.data?.organizations[0]?.id ?? '';
  const { t } = useI18n();

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setIsCommandPaletteOpen(true);
    }
  };

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  // oxlint-disable-next-line no-unassigned-vars -- assigned via Solid ref binding in JSX
  let inputRef: HTMLInputElement | undefined;

  createEffect(
    on(getIsCommandPaletteOpen, (isOpen) => {
      if (isOpen && getSearchQuery().length > 0) {
        setTimeout(() => inputRef?.select(), 0);
      }
    }),
  );

  const navigate = useNavigate();

  const searchDocs = debounce(async ({ searchQuery }: { searchQuery: string }) => {
    const [result] = await safely(
      fetchOrganizationDocuments({
        searchQuery,
        organizationId: getOrganizationId(),
        pageIndex: 0,
        pageSize: 5,
      }),
    );

    setMatchingDocuments(result?.documents ?? []);
    setMatchingDocumentsTotalCount(result?.documentsCount ?? 0);
    setIsLoading(false);
  }, 300);

  createEffect(
    on(getSearchQuery, (searchQuery) => {
      setMatchingDocuments([]);
      setMatchingDocumentsTotalCount(0);
      if (searchQuery.length > 1) {
        setIsLoading(true);
        searchDocs({ searchQuery });
      }
    }),
  );

  const getCommandData = (): {
    label: string;
    forceMatch?: boolean;
    options: { label: string; icon: string; action: () => void; forceMatch?: boolean }[];
  }[] => [
    {
      label: t('command-palette.sections.documents'),
      forceMatch: true,
      options: [
        ...getMatchingDocuments().map((document) => ({
          label: document.name,
          icon: getDocumentIcon({ document }),
          action: () => navigate(getDocumentPath({ document })),
          forceMatch: true,
        })),

        ...toArrayIf(getMatchingDocumentsTotalCount() > getMatchingDocuments().length, {
          label: t('command-palette.show-more-results', {
            count: getMatchingDocumentsTotalCount() - getMatchingDocuments().length,
            query: getSearchQuery(),
          }),
          icon: 'i-tabler-search',
          action: () =>
            navigate(
              makeDocumentSearchPermalink({
                search: { query: getSearchQuery() },
              }),
            ),
          forceMatch: true,
        }),
      ],
    },
  ];

  const onCommandSelect = ({ action }: { action: () => void }) => {
    action();
    setIsCommandPaletteOpen(false);
  };

  return (
    <CommandPaletteContext.Provider
      value={{
        getIsCommandPaletteOpen,
        openCommandPalette: () => setIsCommandPaletteOpen(true),
        closeCommandPalette: () => setIsCommandPaletteOpen(false),
      }}
    >
      <CommandDialog
        class="rounded-lg border shadow-md"
        open={getIsCommandPaletteOpen()}
        onOpenChange={setIsCommandPaletteOpen}
      >
        <CommandInput
          ref={inputRef}
          value={getSearchQuery()}
          onValueChange={setSearchQuery}
          placeholder={t('command-palette.search.placeholder')}
        />
        <CommandList>
          <Show when={getIsLoading()}>
            <CommandLoading>
              <div class="i-tabler-loader-2 size-6 animate-spin text-muted-foreground mx-auto" />
            </CommandLoading>
          </Show>
          <Show when={!getIsLoading()}>
            <Show when={getMatchingDocuments().length === 0}>
              <CommandEmpty>{t('command-palette.no-results')}</CommandEmpty>
            </Show>

            <For each={getCommandData().filter((section) => section.options.length > 0)}>
              {(section) => (
                <CommandGroup heading={section.label} forceMount={section.forceMatch ?? false}>
                  <For each={section.options}>
                    {(item) => (
                      <CommandItem
                        onSelect={() => onCommandSelect(item)}
                        forceMount={item.forceMatch ?? false}
                      >
                        <span class={cn('mr-2 ml-2 size-4 text-primary', item.icon)} />
                        <span>{item.label}</span>
                      </CommandItem>
                    )}
                  </For>
                </CommandGroup>
              )}
            </For>
          </Show>
        </CommandList>
      </CommandDialog>

      {props.children}
    </CommandPaletteContext.Provider>
  );
};
