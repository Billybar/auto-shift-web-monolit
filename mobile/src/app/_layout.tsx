import React, { useEffect } from 'react';
import { Slot } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AuthProvider } from '../hooks/useAuth';
import { LocationProvider } from '../hooks/useLocation';
import '../../global.css';

// Initialize the query client outside the component to prevent re-renders
const queryClient = new QueryClient();

export default function RootLayout() {
  // Keep the whole app in portrait; only the schedule screen unlocks landscape on demand.
  // The iOS config plugin sets the launch orientation, this call covers Android.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <LocationProvider>
              {/* Slot renders the current route based on the file system */}
              <Slot />
            </LocationProvider>
          </AuthProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}