import React, { createContext, useContext, useState } from 'react';
import type {ReactNode } from 'react';
interface LocationContextType {
  selectedLocationId: number;
  setSelectedLocationId: (id: number) => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // נניח ש-1 זה ה-ID של סניף הרצליה כברירת מחדל
  const [selectedLocationId, setSelectedLocationId] = useState<number>(3);

  return (
    <LocationContext.Provider value={{ selectedLocationId, setSelectedLocationId }}>
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