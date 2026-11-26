// src/context/useAppLocation.ts
// Kept apart from LocationContext.tsx: a file that exports both a component and a hook breaks Fast Refresh
import { createContext, useContext } from 'react';
import type { LocationData } from '@/types/index';

export interface LocationContextType {
  selectedLocationId: number | '';
  setSelectedLocationId: (id: number | '') => void;
  availableLocations: LocationData[];
  isLoadingLocations: boolean;
}

export const LocationContext = createContext<LocationContextType | undefined>(undefined);

/** The selected location and the locations the user can reach. Must be used within a LocationProvider. */
export const useAppLocation = (): LocationContextType => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useAppLocation must be used within a LocationProvider');
  }
  return context;
};
