import type { RouteDefinition } from '@solidjs/router';
import { Navigate, useParams as useRouterParams } from '@solidjs/router';
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
import { OrganizationProvider } from './modules/organizations/organization.provider';
import { OrganizationPage } from './modules/organizations/pages/organization.page';
import { NotFoundPage } from './modules/shared/pages/not-found.page';
import { TagsPage } from './modules/tags/pages/tags.page';
import { OrganizationLayout } from './modules/ui/layouts/organization.layout';
import { SettingsLayout } from './modules/ui/layouts/settings.layout';
import { CurrentUserProvider } from './modules/users/composables/useCurrentUser';
import { UserSettingsPage } from './modules/users/pages/user-settings.page';

// There is a single organization that holds every document: it is not part of the URLs, pages get
// its id from the OrganizationProvider.
export const routes: RouteDefinition[] = [
  {
    path: '/',
    component: CurrentUserProvider,
    children: [
      {
        path: '/',
        component: () => <Navigate href="/home" />,
      },
      {
        // Links from before the organization left the URLs
        path: '/organizations/:organizationId/*rest',
        component: () => {
          const params = useRouterParams();

          return <Navigate href={`/${params.rest ?? ''}`.replace(/\/$/, '') || '/home'} />;
        },
      },
      {
        path: '/organizations/:organizationId',
        component: () => <Navigate href="/home" />,
      },
      {
        path: '/',
        component: OrganizationProvider,
        children: [
          {
            // Routes with the organization layout
            path: '/',
            component: OrganizationLayout,
            children: [
              {
                path: '/home',
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
