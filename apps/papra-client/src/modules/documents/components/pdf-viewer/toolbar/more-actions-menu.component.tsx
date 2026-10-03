import type { Component } from 'solid-js';
import type { PdfViewerStoreProps } from '../pdf-viewer.types';
import { createSignal, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/modules/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/modules/ui/components/tooltip';
import { DocumentPropertiesDialog } from './document-properties-dialog.component';

export const MoreActionsMenu: Component<
  PdfViewerStoreProps & { isCompact: boolean; onSearch: () => void }
> = (props) => {
  const [showDocInfo, setShowDocInfo] = createSignal(false);
  const { t } = useI18n();

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <DropdownMenuTrigger
                as={(menuTriggerProps: Record<string, unknown>) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-8"
                    {...triggerProps}
                    {...menuTriggerProps}
                  >
                    <div class="i-tabler-dots-vertical size-4" />
                  </Button>
                )}
              />
            )}
          />
          <TooltipContent>{t('documents.pdf-viewer.more-actions.label')}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent class="min-w-48">
          {/* The actions of the toolbar, when it has no room left for them */}
          <Show when={props.isCompact}>
            <DropdownMenuItem onSelect={() => props.onSearch()}>
              <div class="i-tabler-search size-4 mr-2" />
              <span>{t('documents.pdf-viewer.toolbar.search')}</span>
            </DropdownMenuItem>

            <DropdownMenuItem onSelect={() => props.store.pdfSlick?.downloadOrSave()}>
              <div class="i-tabler-download size-4 mr-2" />
              <span>{t('documents.pdf-viewer.toolbar.download')}</span>
            </DropdownMenuItem>

            <Show when={props.store.pdfSlick?.supportsPrinting}>
              <DropdownMenuItem onSelect={() => props.store.pdfSlick?.triggerPrinting()}>
                <div class="i-tabler-printer size-4 mr-2" />
                <span>{t('documents.pdf-viewer.toolbar.print')}</span>
              </DropdownMenuItem>
            </Show>

            <DropdownMenuSeparator />
          </Show>

          <DropdownMenuItem
            disabled={props.store.pageNumber === 1}
            onSelect={() => props.store.pdfSlick?.gotoPage(1)}
          >
            <div class="i-tabler-arrow-bar-to-up size-4 mr-2" />
            <span>{t('documents.pdf-viewer.more-actions.go-to-first-page')}</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={props.store.pageNumber === props.store.numPages}
            onSelect={() => props.store.pdfSlick?.gotoPage(props.store.numPages)}
          >
            <div class="i-tabler-arrow-bar-to-down size-4 mr-2" />
            <span>{t('documents.pdf-viewer.more-actions.go-to-last-page')}</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => setShowDocInfo(true)}>
            <div class="i-tabler-info-circle size-4 mr-2" />
            <span>{t('documents.pdf-viewer.more-actions.document-properties')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DocumentPropertiesDialog
        store={props.store}
        isOpen={showDocInfo()}
        onClose={() => setShowDocInfo(false)}
      />
    </>
  );
};
