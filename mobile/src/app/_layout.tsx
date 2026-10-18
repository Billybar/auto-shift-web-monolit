import React, { useEffect } from 'react';
import { Slot } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AuthProvider } from '../hooks/useAuth';
import { LocationProvider } from '../hooks/useLocation';
import { Toaster } from '../components/ui/toaster';
import { logError, toAppError } from '../../api/errors';
import '../../global.css';

// Catches render errors anywhere in the app (tab screens have their own, so the tab bar survives)
export { ErrorFallback as ErrorBoundary } from '../components/error-fallback';

// Initialize the query client outside the component to prevent re-renders.
// Screens show failed queries themselves; this only logs them (without the request headers).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One quick retry (after 1 s) for a dropped connection or a server error, instead of the default three
      // (~7 s before an error shows). A timeout already waited 30 s and a 4xx won't change, so neither is retried.
      retry: (failureCount, error) => failureCount < 1 && ['network', 'server'].includes(toAppError(error).kind),
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => logError(`Query failed: ${JSON.stringify(query.queryKey)}`, error),
  }),
});

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
              {/* Toasts from `notify`, drawn above every screen */}
              <Toaster />
            </LocationProvider>
          </AuthProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}