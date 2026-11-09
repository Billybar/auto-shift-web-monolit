// src/features/admin/hooks/useAdminData.ts
import { useCallback, useEffect, useState } from 'react';
import { getAllLocations, getClients, getOrganizations } from '../../../api/admin';
import { logError, toAppError } from '../../../api/errors';
import type { AppError } from '../../../api/errors';
import type { Client, LocationData, Organization } from '../../../types';

/**
 * The organization → client → location hierarchy, shared by every tab of the admin dashboard.
 */
export function useAdminData() {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [locations, setLocations] = useState<LocationData[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [loadError, setLoadError] = useState<AppError | null>(null);

    const reload = useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            const [loadedOrganizations, loadedClients, loadedLocations] = await Promise.all([
                getOrganizations(),
                getClients(),
                getAllLocations(),
            ]);
            setOrganizations(loadedOrganizations);
            setClients(loadedClients);
            setLocations(loadedLocations);
        } catch (error) {
            logError('Failed to load the organization hierarchy:', error);
            setLoadError(toAppError(error));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    return { organizations, clients, locations, isLoading, loadError, reload };
}
