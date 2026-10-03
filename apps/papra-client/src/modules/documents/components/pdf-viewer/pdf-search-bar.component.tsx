import type { Component } from 'solid-js';
import type { PdfSearchApi } from './pdf-search.provider';
import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';

// Header search for the PDF on screen: highlights matches and steps through them like Cmd+F
export const PdfSearchBar: Component<{
  api: PdfSearchApi;
  autofocus?: boolean;
  onClose?: () => void;
}> = (props) => {
  const { t } = useI18n();
  // Kept in a constant: the cleanup runs after the parent <Show> stopped serving its props
  const { api } = props;
  const [getQuery, setQuery] = createSignal('');
  let inputRef: HTMLInputElement | undefined;

  const getCounter = () => {
    const { current, total } = api.getMatches();

    if (getQuery().trim().length === 0) {
      return '';
    }

    return total === 0
      ? t('layout.search.in-pdf.no-results')
      : t('layout.search.in-pdf.counter', { current, total });
  };

  onMount(() => {
    if (props.autofocus) {
      inputRef?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        inputRef?.focus();
        inputRef?.select();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown);
      api.clear();
    });
  });

  return (
    <div class="flex items-center gap-1">
      <TextFieldRoot class="w-48 sm:w-64">
        <TextField
          ref={inputRef}
          type="search"
          value={getQuery()}
          placeholder={t('layout.search.in-pdf')}
          aria-label={t('layout.search.in-pdf')}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            api.search(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();

              if (event.shiftKey) {
                api.previous();
              } else {
                api.next();
              }
            }

            if (event.key === 'Escape') {
              setQuery('');
              api.clear();
              props.onClose?.();
            }
          }}
        />
      </TextFieldRoot>

      {/* The result counter and the stepping buttons only show once something is searched */}
      <Show when={getQuery().trim().length > 0}>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('layout.search.in-pdf.previous')}
          disabled={api.getMatches().total === 0}
          onClick={() => api.previous()}
        >
          <div class="i-tabler-chevron-left size-4" />
        </Button>

        <span class="min-w-16 px-1 text-center text-sm text-muted-foreground whitespace-nowrap">
          {getCounter()}
        </span>

        <Button
          variant="outline"
          size="icon"
          aria-label={t('layout.search.in-pdf.next')}
          disabled={api.getMatches().total === 0}
          onClick={() => api.next()}
        >
          <div class="i-tabler-chevron-right size-4" />
        </Button>
      </Show>

      <Show when={props.onClose}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('documents.pdf-viewer.toolbar.search-close')}
          onClick={() => props.onClose?.()}
        >
          <div class="i-tabler-x size-4" />
        </Button>
      </Show>
    </div>
  );
};
