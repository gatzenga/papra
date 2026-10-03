import { useParams as useRouterParams } from '@solidjs/router';
import { useOrganizationId } from '@/modules/organizations/organization.provider';

// The router params, plus the id of the (single) organization which is no longer part of the URL
export function useParams() {
  const params = useRouterParams();
  const getOrganizationId = useOrganizationId();

  return new Proxy(params, {
    get: (target, property) =>
      property === 'organizationId' ? getOrganizationId() : target[property as string],
  }) as typeof params & { organizationId: string };
}
