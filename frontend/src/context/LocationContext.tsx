import React, { useCallback, useState, useEffect } from 'react';
import type {ReactNode } from 'react';
import { useAuth } from './useAuth';
import { LocationContext } from './useAppLocation';
import { UserRole } from '../types/index';
import type { LocationData } from '../types/index';
import { apiClient } from '../api/client';
import { notify } from '../lib/notify';

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  // Start with an empty string to represent "no selection yet"
  const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('');
  const [availableLocations, setAvailableLocations] = useState<LocationData[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState<boolean>(true);
  const [reloadCount, setReloadCount] = useState<number>(0);

  const reloadLocations = useCallback(() => setReloadCount((count) => count + 1), []);

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
        let fetchedLocations: LocationData[] = [];

        // apiClient automatically attaches the Bearer token via interceptors!
        // Staff get the server's scoped list, which includes the locations of their linked clients
        if (user.role !== UserRole.EMPLOYEE) {
          const response = await apiClient.get<LocationData[]>('/api/locations/');
          fetchedLocations = response.data;
        } else {
          // Explicitly typing the expected response helps avoid TS errors
          const response = await apiClient.get<{ locations?: LocationData[] }>('/api/users/me');
          fetchedLocations = response.data.locations || [];
        }

        if (isMounted) {
          setAvailableLocations(fetchedLocations);
          
          // Smart Auto-Selection Logic
          if (fetchedLocations.length > 0) {
            // If current selection is invalid (or empty), pick the first available.
            // Reads the current selection through the updater, so the effect doesn't depend on it
            setSelectedLocationId((current) =>
              fetchedLocations.some(loc => loc.id === current) ? current : fetchedLocations[0].id
            );
          } else {
            setSelectedLocationId(''); // Reset if user has no locations assigned
          }
        }
      } catch (error) {
        // Without this the header just shows "no site selected", which looks like a permissions problem
        notify.error(error, 'טעינת רשימת האתרים נכשלה');
      } finally {
        if (isMounted) setIsLoadingLocations(false);
      }
    };

    fetchAllowedLocations();

    // Cleanup function to prevent memory leaks if component unmounts mid-fetch
    return () => { isMounted = false; };
  }, [isAuthenticated, user, reloadCount]);

  return (
    <LocationContext.Provider value={{ 
      selectedLocationId, 
      setSelectedLocationId, 
      availableLocations,
      isLoadingLocations,
      reloadLocations
    }}>
      {children}
    </LocationContext.Provider>
  );
};