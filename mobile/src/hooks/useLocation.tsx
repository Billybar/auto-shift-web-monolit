import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';
import { UserRole } from '../types';
import type { LocationData } from '../types';
import { apiClient } from '../../api/client';
import { logError, toAppError } from '../../api/errors';
import type { AppError } from '../../api/errors';

interface LocationContextType {
    selectedLocationId: number | '';
    setSelectedLocationId: (id: number | '') => void;
    availableLocations: LocationData[];
    isLoadingLocations: boolean;
    // Set when the list couldn't be loaded, so screens can say so (and retry) instead of
    // asking the user to pick a location they don't have
    locationsError: AppError | null;
    reloadLocations: () => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('');
    const [availableLocations, setAvailableLocations] = useState<LocationData[]>([]);
    const [isLoadingLocations, setIsLoadingLocations] = useState<boolean>(true);
    const [locationsError, setLocationsError] = useState<AppError | null>(null);
    // Bumped by reloadLocations() to fetch the list again
    const [reloadCount, setReloadCount] = useState(0);

    useEffect(() => {
        let isMounted = true;

        const fetchAllowedLocations = async () => {
            if (!isAuthenticated || !user) {
                setAvailableLocations([]);
                setSelectedLocationId('');
                setLocationsError(null);
                setIsLoadingLocations(false);
                return;
            }

            setIsLoadingLocations(true);
            setLocationsError(null);
            try {
                let fetchedLocations: LocationData[] = [];

                // Admins may have no linked locations but can access all of them (same as the web LocationContext)
                if (user.role === UserRole.ADMIN) {
                    const response = await apiClient.get<LocationData[]>('/api/locations/');
                    fetchedLocations = response.data;
                } else {
                    // Fetch user profile which contains the locations array
                    const response = await apiClient.get<{ locations?: LocationData[] }>('/api/users/me');
                    fetchedLocations = response.data.locations || [];
                }

                if (isMounted) {
                    setAvailableLocations(fetchedLocations);

                    // Auto-select the first location if available and current selection is empty/invalid
                    if (fetchedLocations.length > 0) {
                        const isCurrentValid = fetchedLocations.some(loc => loc.id === selectedLocationId);
                        if (!isCurrentValid) {
                            setSelectedLocationId(fetchedLocations[0].id);
                        }
                    } else {
                        setSelectedLocationId('');
                    }
                }
            } catch (error) {
                logError('Failed to fetch user locations:', error);
                if (isMounted) setLocationsError(toAppError(error));
            } finally {
                if (isMounted) setIsLoadingLocations(false);
            }
        };

        fetchAllowedLocations();

        return () => { isMounted = false; };
    }, [isAuthenticated, user, reloadCount]);

    const reloadLocations = useCallback(() => setReloadCount(count => count + 1), []);

    return (
        <LocationContext.Provider value={{
            selectedLocationId,
            setSelectedLocationId,
            availableLocations,
            isLoadingLocations,
            locationsError,
            reloadLocations
        }}>
            {children}
        </LocationContext.Provider>
    );
};

export const useAppLocation = (): LocationContextType => {
    const context = useContext(LocationContext);
    if (!context) {
        throw new Error('useAppLocation must be used within a LocationProvider');
    }
    return context;
};
