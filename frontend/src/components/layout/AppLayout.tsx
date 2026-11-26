// src/components/layout/AppLayout.tsx
import { Outlet, useLocation } from 'react-router-dom';

import ErrorBoundary from '@/components/ErrorBoundary';
import DemoBanner from '@/features/demo/components/DemoBanner';
import LocationSelect from './LocationSelect';
import NavMenu from './NavMenu';
import UserArea from './UserArea';
import { navItemAt } from './navItems';

/** The signed-in app's frame: the header (menu, page title, location, user) around the routed page. */
export default function AppLayout() {
    const { pathname } = useLocation();
    const page = navItemAt(pathname);

    return (
        <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden font-sans">
            {/* Demo instance only: temporary-data notice, view switch and start over */}
            <DemoBanner />

            <header className="h-14 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                    <NavMenu />
                    {page && (
                        <>
                            <span className="text-gray-300" aria-hidden="true">·</span>
                            <h2 className="text-base font-semibold text-gray-800 truncate">{page.label}</h2>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <LocationSelect />
                    <UserArea />
                </div>
            </header>

            <main className="flex-1 min-h-0 p-4 overflow-auto">
                {/* A page crash keeps the header usable; the key resets the boundary when navigating away */}
                <ErrorBoundary key={pathname}>
                    <Outlet />
                </ErrorBoundary>
            </main>
        </div>
    );
}
