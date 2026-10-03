import type { Accessor, ParentComponent } from 'solid-js';
import type { PDFSlickState } from './pdf-viewer.types';
import { createContext, createEffect, createSignal, onCleanup, useContext } from 'solid-js';

export type PdfSearchApi = {
  search: (query: string) => void;
  next: () => void;
  previous: () => void;
  clear: () => void;
  getMatches: Accessor<{ current: number; total: number }>;
};

type PdfSearchRegistry = {
  getApi: Accessor<PdfSearchApi | undefined>;
  setApi: (api: PdfSearchApi | undefined) => void;
};

const PdfSearchContext = createContext<PdfSearchRegistry>();

// Lets the page header search inside the PDF that is currently displayed
export const PdfSearchProvider: ParentComponent = (props) => {
  const [getApi, setApi] = createSignal<PdfSearchApi>();

  return (
    <PdfSearchContext.Provider value={{ getApi, setApi }}>
      {props.children}
    </PdfSearchContext.Provider>
  );
};

export function usePdfSearch() {
  return { getApi: useContext(PdfSearchContext)?.getApi };
}

// The search API of one viewer: highlights matches in the document and steps through them
export function usePdfSearchApi({ store }: { store: PDFSlickState }) {
  const [getApi, setApi] = createSignal<PdfSearchApi>();
  const [getMatches, setMatches] = createSignal({ current: 0, total: 0 });

  createEffect(() => {
    const { pdfSlick } = store;

    if (!pdfSlick) {
      return;
    }

    const { eventBus } = pdfSlick;

    const dispatchFind = ({
      query,
      type = '',
      findPrevious = false,
    }: {
      query: string;
      type?: '' | 'again';
      findPrevious?: boolean;
    }) =>
      eventBus.dispatch('find', {
        source: pdfSlick,
        type,
        query,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious,
        matchDiacritics: false,
      });

    let currentQuery = '';

    const onMatchesCount = ({
      matchesCount,
    }: {
      matchesCount: { current: number; total: number };
    }) => setMatches({ current: matchesCount.current, total: matchesCount.total });

    eventBus.on('updatefindmatchescount', onMatchesCount);
    eventBus.on('updatefindcontrolstate', onMatchesCount);

    setApi({
      getMatches,
      search: (query) => {
        currentQuery = query;

        if (query.trim().length === 0) {
          eventBus.dispatch('findbarclose', { source: pdfSlick });
          setMatches({ current: 0, total: 0 });
          return;
        }

        dispatchFind({ query });
      },
      next: () => dispatchFind({ query: currentQuery, type: 'again' }),
      previous: () => dispatchFind({ query: currentQuery, type: 'again', findPrevious: true }),
      clear: () => {
        currentQuery = '';
        eventBus.dispatch('findbarclose', { source: pdfSlick });
        setMatches({ current: 0, total: 0 });
      },
    });

    onCleanup(() => {
      eventBus.off('updatefindmatchescount', onMatchesCount);
      eventBus.off('updatefindcontrolstate', onMatchesCount);
      setApi(undefined);
    });
  });

  return getApi;
}

// Called by a viewer: registers its search API in the header for as long as the viewer lives
export function usePdfSearchRegistration({ store }: { store: PDFSlickState }) {
  const registry = useContext(PdfSearchContext);
  const getApi = usePdfSearchApi({ store });

  if (!registry) {
    return;
  }

  createEffect(() => {
    registry.setApi(getApi());
  });

  onCleanup(() => registry.setApi(undefined));
}
