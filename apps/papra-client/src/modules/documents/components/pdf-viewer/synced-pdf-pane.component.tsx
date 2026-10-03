import type { Component } from 'solid-js';
import { createEffect } from 'solid-js';
import { usePdfViewer } from './use-pdf-viewer';

// A PDF viewer that hands over its scrollable element once the document is loaded
export const SyncedPdfPane: Component<{
  url: string;
  onScrollContainer: (container: HTMLElement) => void;
}> = (props) => {
  const { viewerRef, pdfSlickStore: store, PDFSlickViewer } = usePdfViewer({ url: props.url });

  createEffect(() => {
    const container = store.pdfSlick?.viewer?.container;

    if (container) {
      props.onScrollContainer(container);
    }
  });

  return (
    <div class="pdfSlick relative w-full h-full">
      <PDFSlickViewer {...{ store, viewerRef }} />
    </div>
  );
};

// Keeps two scroll containers at the same relative position, whichever one the user scrolls
export function linkScrollContainers({
  first,
  second,
}: {
  first: HTMLElement;
  second: HTMLElement;
}) {
  let isSyncing = false;

  const syncFrom = (source: HTMLElement, target: HTMLElement) => () => {
    if (isSyncing) {
      return;
    }

    isSyncing = true;
    const sourceRange = Math.max(1, source.scrollHeight - source.clientHeight);
    const targetRange = Math.max(0, target.scrollHeight - target.clientHeight);
    target.scrollTop = (source.scrollTop / sourceRange) * targetRange;

    requestAnimationFrame(() => {
      isSyncing = false;
    });
  };

  const onFirstScroll = syncFrom(first, second);
  const onSecondScroll = syncFrom(second, first);

  first.addEventListener('scroll', onFirstScroll, { passive: true });
  second.addEventListener('scroll', onSecondScroll, { passive: true });

  return () => {
    first.removeEventListener('scroll', onFirstScroll);
    second.removeEventListener('scroll', onSecondScroll);
  };
}
