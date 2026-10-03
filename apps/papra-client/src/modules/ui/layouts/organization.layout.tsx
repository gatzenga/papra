import type { Component, ParentComponent } from 'solid-js';

import { A, useNavigate, useParams } from '@solidjs/router';
import { AppLogo } from '@/modules/ui/components/app-logo';
import { useQuery } from '@tanstack/solid-query';
import { createEffect, on, Show } from 'solid-js';
import {
  DocumentUploadProvider,
  useDocumentUpload,
} from '@/modules/documents/components/document-import-status.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { fetchOrganization } from '@/modules/organizations/organizations.services';
import { queryClient } from '@/modules/shared/query/query-client';
import { getErrorStatus } from '@/modules/shared/utils/errors';
import { SideNav } from '@/modules/ui/components/sidenav';
import { Button } from '../components/button';
import { SidenavLayout } from './sidenav.layout';
import { useCommandPalette } from '@/modules/command-palette/command-palette.provider';
import { GlobalDropArea } from '@/modules/documents/components/global-drop-area.component';
import { UserSettingsDropdown } from '@/modules/users/components/user-settings.component';

const OrganizationLayoutSideNav: Component = () => {
  const navigate = useNavigate();
  const params = useParams();
  const { t } = useI18n();

  const getMainMenuItems = () => [
    {
      items: [
        {
          label: t('layout.menu.home'),
          icon: 'i-tabler-home',
          href: `/organizations/${params.organizationId}`,
        },
        {
          label: t('layout.menu.documents'),
          icon: 'i-tabler-file-text',
          href: `/organizations/${params.organizationId}/documents`,
        },
        {
          label: t('layout.menu.tags'),
          icon: 'i-tabler-tag',
          href: `/organizations/${params.organizationId}/tags`,
        },
      ],
    },
  ];

  const getFooterMenuItems = () => [
    {
      label: t('layout.menu.deleted-documents'),
      icon: 'i-tabler-trash',
      href: `/organizations/${params.organizationId}/deleted`,
    },
  ];

  const organizationQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId],
    queryFn: async () => fetchOrganization({ organizationId: params.organizationId }),
  }));

  createEffect(
    on(
      () => organizationQuery.error,
      (error) => {
        if (error) {
          const status = getErrorStatus(error);

          if (
            status &&
            [
              400, // when the id of the organization is not valid
              403, // when the user does not have access to the organization or the organization does not exist
            ].includes(status)
          ) {
            navigate('/');
          }
        }
      },
    ),
  );

  return (
    <SideNav
      mainMenu={getMainMenuItems()}
      footerMenu={getFooterMenuItems()}
      header={() => (
        <div class="p-4 pb-0 min-w-0 max-w-full">
          <AppLogo as={A} href="/" />
        </div>
      )}
    />
  );
};

export const OrganizationLayout: ParentComponent = (props) => {
  const params = useParams();
  const navigate = useNavigate();
  const { openCommandPalette } = useCommandPalette();
  const { t } = useI18n();

  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId],
    queryFn: async () => fetchOrganization({ organizationId: params.organizationId }),
  }));

  createEffect(
    on(
      () => query.error,
      (error) => {
        if (error) {
          const status = getErrorStatus(error);

          if (status && [401, 403].includes(status)) {
            void queryClient.invalidateQueries({ queryKey: ['organizations'] });
            navigate('/');
          }
        }
      },
    ),
  );

  return (
    <DocumentUploadProvider organizationId={params.organizationId}>
      <SidenavLayout
        children={props.children}
        sideNav={OrganizationLayoutSideNav}
        header={() => (
          <div class="flex justify-between w-full">
            <div class="flex items-center">
              <Button
                variant="outline"
                class="lg:min-w-64 justify-start gap-2 px-2.5 sm:px-4"
                onClick={openCommandPalette}
              >
                <div class="i-tabler-search size-4" />
                <span class="hidden sm:inline">{t('layout.search.placeholder')}</span>
              </Button>
            </div>

            <div class="flex items-center gap-2">
              <OrganizationLayoutImportButton />

              <UserSettingsDropdown />
            </div>
          </div>
        )}
      />
    </DocumentUploadProvider>
  );
};

const OrganizationLayoutImportButton: Component = () => {
  const { uploadDocuments, promptImport } = useDocumentUpload();
  const { t } = useI18n();

  return (
    <>
      <GlobalDropArea onFilesDrop={uploadDocuments} />
      <Button onClick={promptImport} class="px-2.5 sm:px-4">
        <div class="i-tabler-upload size-4" />
        <span class="hidden sm:inline ml-2">{t('layout.menu.import-document')}</span>
      </Button>
    </>
  );
};
