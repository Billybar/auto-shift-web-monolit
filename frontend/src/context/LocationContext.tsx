import React, { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { LocationContext } from './useAppLocation';
import type { LocationData } from '../types/index';
import { allowedLocationsQuery } from '../api/queries';

const NO_LOCATIONS: LocationData[] = [];

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    ...allowedLocationsQuery(isAuthenticated ? user : null),
    // Without this the header just shows "no site selected", which looks like a permissions problem
    meta: { errorTitle: 'טעינת רשימת האתרים נכשלה' },
  });
  const availableLocations = (isAuthenticated && data) || NO_LOCATIONS;

  // The user's pick; '' until they choose one
  const [chosenLocationId, setSelectedLocationId] = useState<number | ''>('');
  // The pick while the user can still reach it, otherwise the first location ('' when there is none)
  const selectedLocationId = availableLocations.some((loc) => loc.id === chosenLocationId)
    ? chosenLocationId
    : availableLocations[0]?.id ?? '';

  const reloadLocations = useCallback(() => { void refetch(); }, [refetch]);

  return (
    <LocationContext.Provider value={{
      selectedLocationId,
      setSelectedLocationId,
      availableLocations,
      isLoadingLocations: isLoading,
      reloadLocations
    }}>
      {children}
    </LocationContext.Provider>
  );
};
