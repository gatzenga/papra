import type { RouteDefinition } from '@solidjs/router';
import { Navigate, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { Show } from 'solid-js';
import { authPagesPaths } from './modules/auth/auth.constants';
import { PublicOnlyPage } from './modules/auth/middleware/protected-page.middleware';
import { EmailValidationRequiredPage } from './modules/auth/pages/email-validation-required.page';
import { EmailVerificationPage } from './modules/auth/pages/email-verification.page';
import { LoginPage } from './modules/auth/pages/login.page';
import { RegisterPage } from './modules/auth/pages/register.page';
import { RequestPasswordResetPage } from './modules/auth/pages/request-password-reset.page';
import { ResetPasswordPage } from './modules/auth/pages/reset-password.page';
import { DeletedDocumentsPage } from './modules/documents/pages/deleted-documents.page';
import { DocumentPdfViewerPage } from './modules/documents/pages/document-pdf-viewer.page';
import { DocumentPage } from './modules/documents/pages/document.page';
import { DocumentsPage } from './modules/documents/pages/documents.page';
import { PdfOptimizationPage } from './modules/documents/pages/pdf-optimization.page';
import { useLastOrganization } from './modules/organizations/composables/use-last-organization';
import { fetchOrganizations } from './modules/organizations/organizations.services';
import { OrganizationPage } from './modules/organizations/pages/organization.page';
import { NotFoundPage } from './modules/shared/pages/not-found.page';
import { TagsPage } from './modules/tags/pages/tags.page';
import { OrganizationLayout } from './modules/ui/layouts/organization.layout';
import { SettingsLayout } from './modules/ui/layouts/settings.layout';
import { CurrentUserProvider } from './modules/users/composables/useCurrentUser';
import { UserSettingsPage } from './modules/users/pages/user-settings.page';

// There is a single organization that holds every document. The server creates it on first
// access, so the root simply forwards to it.
export const routes: RouteDefinition[] = [
  {
    path: '/',
    component: CurrentUserProvider,
    children: [
      {
        path: '/',
        component: () => {
          const query = useQuery(() => ({
            queryKey: ['organizations'],
            queryFn: fetchOrganizations,
          }));

          return (
            <Show when={query.data?.organizations[0]}>
              {(getOrganization) => <Navigate href={`/organizations/${getOrganization().id}`} />}
            </Show>
          );
        },
      },
      {
        path: '/organizations/:organizationId',
        matchFilters: {
          organizationId: /^org_[a-zA-Z0-9]+$/,
        },
        component: (props) => {
          const params = useParams();
          const { setLatestOrganizationId } = useLastOrganization();

          setLatestOrganizationId(params.organizationId);

          return <>{props.children}</>;
        },
        children: [
          {
            path: '/',
            component: OrganizationLayout,
            children: [
              {
                path: '/',
                component: OrganizationPage,
              },
              {
                path: '/documents',
                component: DocumentsPage,
              },
              {
                path: '/documents/:documentId',
                component: DocumentPage,
              },
              {
                path: '/deleted',
                component: DeletedDocumentsPage,
              },
              {
                path: '/tags',
                component: TagsPage,
              },
            ],
          },
          {
            path: '/documents/:documentId/pdf-viewer',
            component: DocumentPdfViewerPage,
          },
          {
            path: '/documents/:documentId/optimize',
            component: PdfOptimizationPage,
          },
        ],
      },
    ],
  },
  {
    path: '/',
    component: SettingsLayout,
    children: [
      {
        path: '/settings',
        component: UserSettingsPage,
      },
    ],
  },
  {
    path: authPagesPaths.login,
    component: () => <PublicOnlyPage children={<LoginPage />} />,
  },
  {
    path: authPagesPaths.register,
    component: () => <PublicOnlyPage children={<RegisterPage />} />,
  },
  {
    path: authPagesPaths.resetPassword,
    component: () => <PublicOnlyPage children={<ResetPasswordPage />} />,
  },
  {
    path: authPagesPaths.requestPasswordReset,
    component: () => <PublicOnlyPage children={<RequestPasswordResetPage />} />,
  },
  {
    path: authPagesPaths.emailValidationRequired,
    component: () => <PublicOnlyPage children={<EmailValidationRequiredPage />} />,
  },
  {
    path: authPagesPaths.emailVerification,
    component: () => <PublicOnlyPage children={<EmailVerificationPage />} />,
  },
  {
    path: '*404',
    component: NotFoundPage,
  },
];
