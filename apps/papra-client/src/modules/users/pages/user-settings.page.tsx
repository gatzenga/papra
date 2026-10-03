import type { Component } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import * as v from 'valibot';
import { getValue, reset } from '@modular-forms/solid';
import { changePassword, signOut } from '@/modules/auth/auth.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createForm } from '@/modules/shared/form/form';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { TwoFactorCard } from '../components/two-factor-card';
import { useUpdateCurrentUser } from '../users.composables';
import { nameSchema } from '../users.schemas';
import { fetchCurrentUser, updateUserEmail } from '../users.services';
import { authPagesPaths } from '@/modules/auth/auth.constants';

const LogoutCard: Component = () => {
  const [getIsLoading, setIsLoading] = createSignal(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleLogout = async () => {
    setIsLoading(true);
    await signOut();
    navigate(authPagesPaths.login);
  };

  return (
    <Card class="flex flex-row justify-between items-center p-6 border-destructive">
      <div class="flex flex-col gap-1.5">
        <CardTitle>{t('user.settings.logout.title')}</CardTitle>
        <CardDescription>{t('user.settings.logout.description')}</CardDescription>
      </div>
      <Button onClick={handleLogout} variant="destructive" isLoading={getIsLoading()}>
        {t('user.settings.logout.button')}
      </Button>
    </Card>
  );
};

const UserEmailCard: Component<{ email: string }> = (props) => {
  const { t } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();

  const { form, Form, Field } = createForm({
    schema: v.object({
      email: v.pipe(v.string(), v.trim(), v.email(t('user.settings.email.invalid'))),
      password: v.string(),
    }),
    initialValues: {
      email: props.email,
      password: '',
    },
    onSubmit: async ({ email, password }) => {
      try {
        await updateUserEmail({ email: email.trim(), password });
      } catch (error) {
        createToast({ type: 'error', message: getErrorMessage({ error }) });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['users'], refetchType: 'all' });
      reset(form, { initialValues: { email: email.trim().toLowerCase(), password: '' } });
      createToast({ type: 'success', message: t('user.settings.email.updated') });
    },
  });

  const getHasChanged = () =>
    (getValue(form, 'email') ?? '').trim().toLowerCase() !== props.email.toLowerCase();

  return (
    <Card>
      <CardHeader class="border-b">
        <CardTitle>{t('user.settings.email.title')}</CardTitle>
        <CardDescription>{t('user.settings.email.description')}</CardDescription>
      </CardHeader>

      <Form>
        <CardContent class="pt-6 flex flex-col gap-3">
          <Field name="email">
            {(field, inputProps) => (
              <TextFieldRoot class="flex flex-col gap-1">
                <TextFieldLabel for="email" class="sr-only">
                  {t('user.settings.email.label')}
                </TextFieldLabel>
                <TextField
                  type="email"
                  id="email"
                  autocomplete="email"
                  {...inputProps}
                  value={field.value}
                  aria-invalid={Boolean(field.error)}
                />
                {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
              </TextFieldRoot>
            )}
          </Field>

          <Show when={getHasChanged()}>
            <Field name="password">
              {(field, inputProps) => (
                <TextFieldRoot class="flex flex-col gap-1">
                  <TextFieldLabel for="email-password">
                    {t('user.settings.email.password.label')}
                  </TextFieldLabel>
                  <TextField
                    type="password"
                    id="email-password"
                    autocomplete="current-password"
                    placeholder={t('user.settings.email.password.placeholder')}
                    {...inputProps}
                    value={field.value}
                    aria-invalid={Boolean(field.error)}
                  />
                </TextFieldRoot>
              )}
            </Field>

            <div class="flex justify-end">
              <Button
                type="submit"
                isLoading={form.submitting}
                disabled={(getValue(form, 'password') ?? '').length === 0}
              >
                {t('user.settings.email.update')}
              </Button>
            </div>
          </Show>
        </CardContent>
      </Form>
    </Card>
  );
};

const ChangePasswordCard: Component = () => {
  const { t } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();

  const { form, Form, Field, createFormError } = createForm({
    schema: v.object({
      currentPassword: v.pipe(v.string(), v.nonEmpty(t('user.settings.password.current.required'))),
      newPassword: v.pipe(
        v.string(),
        v.minLength(8, t('user.settings.password.new.min-length', { minLength: 8 })),
        v.maxLength(128, t('user.settings.password.new.max-length', { maxLength: 128 })),
      ),
      confirmPassword: v.string(),
    }),
    initialValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    onSubmit: async ({ currentPassword, newPassword, confirmPassword }) => {
      if (newPassword !== confirmPassword) {
        throw createFormError({
          message: t('user.settings.password.confirm.mismatch'),
          fields: { confirmPassword: t('user.settings.password.confirm.mismatch') },
        });
      }

      const { error } = await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (error) {
        createToast({ type: 'error', message: getErrorMessage({ error }) });
        return;
      }

      reset(form);
      createToast({ type: 'success', message: t('user.settings.password.updated') });
    },
  });

  const passwordFields = [
    {
      name: 'currentPassword',
      id: 'current-password',
      label: 'user.settings.password.current.label',
      autocomplete: 'current-password',
    },
    {
      name: 'newPassword',
      id: 'new-password',
      label: 'user.settings.password.new.label',
      autocomplete: 'new-password',
    },
    {
      name: 'confirmPassword',
      id: 'confirm-password',
      label: 'user.settings.password.confirm.label',
      autocomplete: 'new-password',
    },
  ] as const;

  return (
    <Card>
      <CardHeader class="border-b">
        <CardTitle>{t('user.settings.password.title')}</CardTitle>
        <CardDescription>{t('user.settings.password.description')}</CardDescription>
      </CardHeader>

      <Form>
        <CardContent class="pt-6 flex flex-col gap-3">
          <For each={passwordFields}>
            {(passwordField) => (
              <Field name={passwordField.name}>
                {(field, inputProps) => (
                  <TextFieldRoot class="flex flex-col gap-1">
                    <TextFieldLabel for={passwordField.id}>{t(passwordField.label)}</TextFieldLabel>
                    <TextField
                      type="password"
                      id={passwordField.id}
                      autocomplete={passwordField.autocomplete}
                      {...inputProps}
                      value={field.value}
                      aria-invalid={Boolean(field.error)}
                    />
                    {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
                  </TextFieldRoot>
                )}
              </Field>
            )}
          </For>

          <div class="flex justify-end">
            <Button type="submit" isLoading={form.submitting}>
              {t('user.settings.password.update')}
            </Button>
          </div>
        </CardContent>
      </Form>
    </Card>
  );
};

const UpdateFullNameCard: Component<{ name: string }> = (props) => {
  const { updateCurrentUser } = useUpdateCurrentUser();
  const { t } = useI18n();

  const { form, Form, Field } = createForm({
    schema: v.object({
      name: nameSchema,
    }),
    initialValues: {
      name: props.name,
    },
    onSubmit: async ({ name }) => {
      await updateCurrentUser({
        name: name.trim(),
      });

      createToast({ type: 'success', message: t('user.settings.name.updated') });
    },
  });

  return (
    <Card>
      <CardHeader class="border-b">
        <CardTitle>{t('user.settings.name.title')}</CardTitle>
        <CardDescription>{t('user.settings.name.description')}</CardDescription>
      </CardHeader>

      <Form>
        <CardContent class="pt-6">
          <Field name="name">
            {(field, inputProps) => (
              <TextFieldRoot class="flex flex-col gap-1">
                <TextFieldLabel for="name" class="sr-only">
                  {t('user.settings.name.label')}
                </TextFieldLabel>
                <div class="flex gap-2 flex-col sm:flex-row">
                  <TextField
                    type="text"
                    id="name"
                    placeholder={t('user.settings.name.placeholder')}
                    {...inputProps}
                    value={field.value}
                    aria-invalid={Boolean(field.error)}
                  />
                  <Button
                    type="submit"
                    isLoading={form.submitting}
                    class="flex-shrink-0"
                    disabled={field.value?.trim() === props.name}
                  >
                    {t('user.settings.name.update')}
                  </Button>
                </div>
                {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
              </TextFieldRoot>
            )}
          </Field>

          <div class="text-red-500 text-sm">{form.response.message}</div>
        </CardContent>
      </Form>
    </Card>
  );
};

export const UserSettingsPage: Component = () => {
  const { t } = useI18n();
  const query = useQuery(() => ({
    queryKey: ['users', 'me'],
    queryFn: fetchCurrentUser,
  }));

  return (
    <div class="p-6 mt-12 pb-32 mx-auto max-w-xl">
      <Suspense>
        <Show when={query.data?.user}>
          {(getUser) => (
            <>
              <div class="border-b pb-4">
                <h1 class="text-2xl font-semibold mb-1">{t('user.settings.title')}</h1>
                <p class="text-muted-foreground">{t('user.settings.description')}</p>
              </div>

              <div class="mt-6 flex flex-col gap-6">
                <UserEmailCard email={getUser().email} />
                <ChangePasswordCard />
                <UpdateFullNameCard name={getUser().name} />
                <TwoFactorCard
                  twoFactorEnabled={getUser().twoFactorEnabled}
                  onUpdate={async () => query.refetch()}
                />
                <LogoutCard />
              </div>
            </>
          )}
        </Show>
      </Suspense>
    </div>
  );
};
