import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';
import type { LocationData } from '../types';
import { apiClient } from '../../api/client';

interface LocationContextType {
    selectedLocationId: number | '';
    setSelectedLocationId: (id: number | '') => void;
    availableLocations: LocationData[];
    isLoadingLocations: boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('');
    const [availableLocations, setAvailableLocations] = useState<LocationData[]>([]);
    const [isLoadingLocations, setIsLoadingLocations] = useState<boolean>(true);
    
    useEffect(() => {
        let isMounted = true;

        const fetchAllowedLocations = async () => {
            if (!isAuthenticated || !user) {
                setAvailableLocations([]);
                setSelectedLocationId('');
                setIsLoadingLocations(false);
                return;
            }

            setIsLoadingLocations(true);
            try {
                // Fetch user profile which contains the locations array
                const response = await apiClient.get<{ locations?: LocationData[] }>('/api/users/me');
                const fetchedLocations = response.data.locations || [];

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
                console.error('Failed to fetch user locations:', error);
            } finally {
                if (isMounted) setIsLoadingLocations(false);
            }
        };

        fetchAllowedLocations();

        return () => { isMounted = false; };
    }, [isAuthenticated, user]);

    return (
        <LocationContext.Provider value={{ 
            selectedLocationId, 
            setSelectedLocationId, 
            availableLocations, 
            isLoadingLocations 
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