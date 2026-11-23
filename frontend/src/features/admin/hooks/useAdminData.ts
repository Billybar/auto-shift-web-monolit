// src/features/admin/hooks/useAdminData.ts
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminLocationsQuery, clientsQuery, organizationsQuery } from '../../../api/queries';
import { loadStatus } from '../../../api/query';
import type { Client, LocationData, Organization } from '../../../types';

const NO_ORGANIZATIONS: Organization[] = [];
const NO_CLIENTS: Client[] = [];
const NO_LOCATIONS: LocationData[] = [];

/**
 * The organization → client → location hierarchy, shared by every tab of the admin dashboard.
 */
export function useAdminData() {
    const organizations = useQuery(organizationsQuery());
    const clients = useQuery(clientsQuery());
    const locations = useQuery(adminLocationsQuery());

    const refetchOrganizations = organizations.refetch;
    const refetchClients = clients.refetch;
    const refetchLocations = locations.refetch;
    const reload = useCallback(async () => {
        await Promise.all([refetchOrganizations(), refetchClients(), refetchLocations()]);
    }, [refetchOrganizations, refetchClients, refetchLocations]);

    return {
        organizations: organizations.data ?? NO_ORGANIZATIONS,
        clients: clients.data ?? NO_CLIENTS,
        locations: locations.data ?? NO_LOCATIONS,
        ...loadStatus(organizations, clients, locations),
        reload,
    };
}
