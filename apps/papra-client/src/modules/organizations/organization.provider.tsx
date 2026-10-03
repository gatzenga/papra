import type { Accessor, ParentComponent } from 'solid-js';
import { useQuery } from '@tanstack/solid-query';
import { createContext, createMemo, Show, useContext } from 'solid-js';
import { fetchOrganizations } from './organizations.services';

const OrganizationContext = createContext<Accessor<string>>();

// There is a single organization holding every document, the server creates it on first access.
// Pages get its id from here instead of from the URL.
export const OrganizationProvider: ParentComponent = (props) => {
  const query = useQuery(() => ({
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
  }));

  const getOrganizationId = createMemo(() => query.data?.organizations[0]?.id);

  return (
    <Show when={getOrganizationId()}>
      {/* Not the Show accessor: reading it after the Show closed would throw */}
      <OrganizationContext.Provider value={() => getOrganizationId() ?? ''}>
        {props.children}
      </OrganizationContext.Provider>
    </Show>
  );
};

export function useOrganizationId() {
  const getOrganizationId = useContext(OrganizationContext);

  if (!getOrganizationId) {
    throw new Error('useOrganizationId must be used inside an OrganizationProvider');
  }

  return getOrganizationId;
}
