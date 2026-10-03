import type { Component } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { signOut } from '@/modules/auth/auth.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/modules/ui/components/dropdown-menu';
import { authPagesPaths } from '@/modules/auth/auth.constants';

export const UserSettingsDropdown: Component<{ class?: string }> = (props) => {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button}
        class={cn('relative', props.class)}
        variant="outline"
        aria-label={t('user-menu.trigger.label')}
        size="icon"
      >
        <div class="i-tabler-user size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent class="min-w-48">
        <DropdownMenuItem class="flex items-center gap-2 cursor-pointer" as={A} href="/settings">
          <div class="i-tabler-settings size-4 text-muted-foreground" />
          {t('user-menu.account-settings')}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate(authPagesPaths.login);
          }}
          class="flex items-center gap-2 cursor-pointer"
        >
          <div class="i-tabler-logout size-4 text-muted-foreground" />
          {t('user-menu.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
