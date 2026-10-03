import type { RouteDefinitionContext } from '../app/server.types';
import { safely } from '@corentinth/chisels';
import * as v from 'valibot';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { getPermissionsForRoles } from '../roles/roles.methods';
import { createRolesRepository } from '../roles/roles.repository';
import { pick } from '../shared/objects';
import { validateJsonBody } from '../shared/validation/validation';
import {
  createUserEmailAlreadyUsedError,
  createUserInvalidPasswordError,
  createUsersNotFoundError,
} from './users.errors';
import { createUsersRepository } from './users.repository';

export function registerUsersRoutes(context: RouteDefinitionContext) {
  setupGetCurrentUserRoute(context);
  setupUpdateUserRoute(context);
  setupUpdateUserEmailRoute(context);
}

function setupGetCurrentUserRoute({ app, db }: RouteDefinitionContext) {
  app.get('/api/users/me', requireAuthentication(), async (context) => {
    const { userId } = getUser({ context });

    const usersRepository = createUsersRepository({ db });
    const rolesRepository = createRolesRepository({ db });

    const [{ user }, { roles }] = await Promise.all([
      usersRepository.getUserByIdOrThrow({ userId }),
      rolesRepository.getUserRoles({ userId }),
    ]);

    const { permissions } = getPermissionsForRoles({ roles });

    return context.json({
      user: {
        ...pick(user, ['id', 'email', 'name', 'createdAt', 'updatedAt', 'twoFactorEnabled']),

        permissions,
      },
    });
  });
}

function setupUpdateUserRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/users/me',
    requireAuthentication(),
    validateJsonBody(
      v.strictObject({
        name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(50)),
      }),
    ),
    async (context) => {
      const { userId } = getUser({ context });

      const { name } = context.req.valid('json');

      const usersRepository = createUsersRepository({ db });

      const { user } = await usersRepository.updateUser({ userId, name });

      return context.json({ user });
    },
  );
}

// Without an email service there is no confirmation mail to send, so the current password confirms the change
function setupUpdateUserEmailRoute({ app, db, auth }: RouteDefinitionContext) {
  app.put(
    '/api/users/me/email',
    requireAuthentication(),
    validateJsonBody(
      v.strictObject({
        email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email(), v.maxLength(254)),
        password: v.pipe(v.string(), v.minLength(1)),
      }),
    ),
    async (context) => {
      const { userId } = getUser({ context });
      const { email, password } = context.req.valid('json');

      const [, passwordError] = await safely(
        auth.api.verifyPassword({ headers: context.req.raw.headers, body: { password } }),
      );

      if (passwordError) {
        throw createUserInvalidPasswordError();
      }

      const usersRepository = createUsersRepository({ db });
      const { user: existingUser } = await usersRepository.getUserByEmail({ email });

      if (existingUser && existingUser.id !== userId) {
        throw createUserEmailAlreadyUsedError();
      }

      const { user } = await usersRepository.updateUserEmail({ userId, email });

      if (!user) {
        throw createUsersNotFoundError();
      }

      return context.json({ user: pick(user, ['id', 'email', 'name']) });
    },
  );
}
