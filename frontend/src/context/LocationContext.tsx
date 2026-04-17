import React, { createContext, useContext, useState, useEffect } from 'react';
import type {ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { UserRole } from '../types/index';
import type { LocationData } from '../types/index';
import { apiClient } from '../api/client';

interface LocationContextType {
  selectedLocationId: number | '';
  setSelectedLocationId: (id: number | '') => void;
  availableLocations: LocationData[];
  isLoadingLocations: boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  // Start with an empty string to represent "no selection yet"
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
        let fetchedLocations: LocationData[] = [];

        // apiClient automatically attaches the Bearer token via interceptors!
        if (user.role === UserRole.ADMIN) {
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
            // If current selection is invalid (or empty), pick the first available
            const isCurrentValid = fetchedLocations.some(loc => loc.id === selectedLocationId);
            if (!isCurrentValid) {
              setSelectedLocationId(fetchedLocations[0].id);
            }
          } else {
            setSelectedLocationId(''); // Reset if user has no locations assigned
          }
        }
      } catch (error) {
        console.error('Failed to fetch user locations:', error);
      } finally {
        if (isMounted) setIsLoadingLocations(false);
      }
    };

    fetchAllowedLocations();

    // Cleanup function to prevent memory leaks if component unmounts mid-fetch
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