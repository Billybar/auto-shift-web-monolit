// src/test/renderWithProviders.tsx
// Renders a page or component inside the providers the app gives it (main.tsx and App.tsx),
// with a fake signed-in user and location instead of the real AuthProvider and LocationProvider
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';
import { vi } from 'vitest';

import { ConfirmProvider } from '@/context/ConfirmProvider';
import { AuthContext } from '@/context/useAuth';
import type { AuthContextType } from '@/context/useAuth';
import { LocationContext } from '@/context/useAppLocation';
import type { LocationData, User } from '@/types';
import { testLocation, testUser } from './fixtures';
import { createQueryWrapper } from './queryWrapper';

export interface ProviderOptions {
    /** The signed-in user (default: a scheduler); null when signed out. */
    user?: User | null;
    /** True while the stored session is still being read. */
    authLoading?: boolean;
    /** The URL the test starts on (default '/'). */
    route?: string;
    /** `location.state` of that URL, e.g. `{ from: { pathname: '/admin' } }` on /login. */
    routeState?: unknown;
    /** The route pattern the UI is mounted at (default: the path of `route`). Any other path shows `CurrentPath`. */
    routePath?: string;
    /** Rendered by the UI's <Outlet />, for layout routes such as ProtectedRoute. */
    outlet?: ReactElement;
    /** The locations the user can reach (default: one, id 1). */
    locations?: LocationData[];
    /** The selected location (default: the first of `locations`). */
    locationId?: number | '';
    /** The query client (default: a fresh one without retries). */
    client?: QueryClient;
}

/**
 * Shown on every path except the one the UI is mounted at, so a test can see where it navigated:
 * `getByTestId('current-path')` has the path as its text and the route state as JSON in `data-state`.
 */
function CurrentPath() {
    const { pathname, state } = useLocation();
    return <p data-testid="current-path" data-state={JSON.stringify(state ?? null)}>{pathname}</p>;
}

function FakeLocationProvider({ locations, initialId, children }: {
    locations: LocationData[];
    initialId: number | '';
    children: ReactNode;
}) {
    const [selectedLocationId, setSelectedLocationId] = useState(initialId);
    return (
        <LocationContext.Provider value={{ selectedLocationId, setSelectedLocationId, availableLocations: locations, isLoadingLocations: false }}>
            {children}
        </LocationContext.Provider>
    );
}

function buildProviders(options: ProviderOptions) {
    const { client, wrapper: QueryWrapper } = createQueryWrapper(options.client);
    const user = options.user === undefined ? testUser() : options.user;
    const auth: AuthContextType = {
        user,
        isAuthenticated: !!user,
        isLoading: options.authLoading ?? false,
        login: vi.fn(),
        logout: vi.fn(),
    };
    const locations = options.locations ?? [testLocation(1)];
    const initialId = options.locationId ?? locations[0]?.id ?? '';
    const route = options.route ?? '/';

    // Everything but the router, which renderWithProviders and createProvidersWrapper set up differently
    const AppProviders = ({ children }: { children: ReactNode }) => (
        <QueryWrapper>
            <AuthContext.Provider value={auth}>
                <FakeLocationProvider locations={locations} initialId={initialId}>
                    <ConfirmProvider>{children}</ConfirmProvider>
                </FakeLocationProvider>
            </AuthContext.Provider>
        </QueryWrapper>
    );
    const [pathname, query] = route.split('?');
    const initialEntries = [{ pathname, search: query ? `?${query}` : '', state: options.routeState }];
    return { client, auth, AppProviders, initialEntries };
}

/**
 * Renders `ui` at `route` with the query client, router, a fake auth and location, and the real confirm dialog.
 * Returns the render result plus `client`, `auth` (to check `login` / `logout`) and `user` (userEvent).
 */
export function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}) {
    const { client, auth, AppProviders, initialEntries } = buildProviders(options);
    const routePath = options.routePath ?? initialEntries[0].pathname;
    const user = userEvent.setup();
    const result = render(
        <AppProviders>
            <MemoryRouter initialEntries={initialEntries}>
                <Routes>
                    <Route path={routePath} element={ui}>
                        {options.outlet && <Route index element={options.outlet} />}
                    </Route>
                    <Route path="*" element={<CurrentPath />} />
                </Routes>
            </MemoryRouter>
        </AppProviders>
    );
    return { ...result, client, auth, user };
}

/** The same providers as a `wrapper` for renderHook. */
export function createProvidersWrapper(options: ProviderOptions = {}) {
    const { client, auth, AppProviders, initialEntries } = buildProviders(options);
    const wrapper = ({ children }: { children: ReactNode }) => (
        <AppProviders>
            <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
        </AppProviders>
    );
    return { client, auth, wrapper };
}
