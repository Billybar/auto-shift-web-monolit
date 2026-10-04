import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Users, CalendarX, LogOut, Menu, Check, type LucideIcon } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Toaster } from 'sonner';
import LoginPage from './features/auth/LoginPage';
import PasswordResetPage from './features/auth/PasswordResetPage';
import PrivacyPolicyPage from './features/legal/PrivacyPolicyPage';
import SupportPage from './features/legal/SupportPage';
import { UserRole } from './types/index';
import { LocationProvider, useAppLocation } from './context/LocationContext';

// Feature page imports
import SchedulePage from './features/schedule/SchedulePage';
import EmployeesPage from './features/employees/EmployeesPage';
import ConstraintsPage from './features/constraints/ConstraintsPage';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  hidden?: boolean;
}

/**
 * Layout component that wraps the main application structure.
 * Provides access to the current location for navigation styling.
 */
function AppLayout() {
  const { 
    selectedLocationId, 
    setSelectedLocationId, 
    availableLocations, 
    isLoadingLocations 
  } = useAppLocation();

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth(); // Extract user data and logout function

  /**
   * Handles user logout and redirects to the login screen.
   */
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Navigation entries shared by the menu dropdown and the page title
  const navItems: NavItem[] = [
    { path: '/', label: 'סידור שבועי', icon: CalendarDays },
    // Employee management is hidden from regular employees
    { path: '/employees', label: 'ניהול עובדים', icon: Users, hidden: !user || user.role === UserRole.EMPLOYEE },
    { path: '/constraints', label: 'אילוצים', icon: CalendarX },
  ];
  const visibleNavItems = navItems.filter((item) => !item.hidden);
  const currentNavItem = navItems.find((item) => item.path === location.pathname);

  // Nav menu opens on hover; the close is delayed so the pointer can move from the trigger to the menu
  const [isNavMenuOpen, setIsNavMenuOpen] = React.useState(false);
  const navCloseTimerRef = React.useRef<number | undefined>(undefined);

  const openNavMenu = () => {
    window.clearTimeout(navCloseTimerRef.current);
    setIsNavMenuOpen(true);
  };

  const scheduleNavMenuClose = () => {
    window.clearTimeout(navCloseTimerRef.current);
    navCloseTimerRef.current = window.setTimeout(() => setIsNavMenuOpen(false), 150);
  };

  React.useEffect(() => () => window.clearTimeout(navCloseTimerRef.current), []);

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden font-sans">

      {/* Topbar / Header */}
      <header className="h-14 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {/* Menu button: opens the page switcher dropdown */}
          {/* Non-modal so the page behind stays hoverable and mouse-leave events still fire */}
          <DropdownMenu.Root dir="rtl" modal={false} open={isNavMenuOpen} onOpenChange={setIsNavMenuOpen}>
            <DropdownMenu.Trigger asChild>
              <button
                onMouseEnter={openNavMenu}
                onMouseLeave={scheduleNavMenuClose}
                onPointerDown={(e) => {
                  // Mouse users get the menu via hover, so a click shouldn't toggle it closed.
                  // Touch and keyboard keep Radix's default toggle behavior.
                  if (e.pointerType === 'mouse') e.preventDefault();
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="תפריט ניווט"
              >
                <Menu size={20} className="text-gray-600" />
                <span className="text-lg font-bold tracking-wider text-blue-600">AutoShift</span>
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={6}
                onMouseEnter={openNavMenu}
                onMouseLeave={scheduleNavMenuClose}
                // Don't pull focus back to the trigger when the menu closes on mouse-leave
                onCloseAutoFocus={(e) => e.preventDefault()}
                className="z-50 min-w-52 bg-white rounded-lg border border-gray-200 shadow-lg p-1"
              >
                {visibleNavItems.map(({ path, label, icon: Icon }) => {
                  const isActive = location.pathname === path;
                  return (
                    <DropdownMenu.Item key={path} asChild>
                      {/* Link components enable SPA navigation without full page refresh */}
                      <Link
                        to={path}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm outline-none cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-gray-700 data-[highlighted]:bg-gray-100'
                        }`}
                      >
                        <Icon size={18} />
                        <span className="flex-1">{label}</span>
                        {isActive && <Check size={16} />}
                      </Link>
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* Dynamic page title based on current route */}
          {currentNavItem && (
            <>
              <span className="text-gray-300">·</span>
              <h2 className="text-base font-semibold text-gray-800 truncate">{currentNavItem.label}</h2>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Location Selector: Critical for multi-site management */}
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(Number(e.target.value))}
            disabled={isLoadingLocations || availableLocations.length === 0}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-56 px-2 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
              {isLoadingLocations ? (
                <option value="">טוען אתר...</option>
              ) : availableLocations.length === 0 ? (
                <option value="">לא נבחר אתר</option>
              ) : (
                availableLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))
              )}
          </select>

          {/* User Profile & Logout Area */}
          <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
            <div className="flex flex-col text-right leading-tight">
              <span className="text-sm font-semibold text-gray-900">{user ? `${user.first_name} ${user.last_name}` : 'User'}</span>
              <span className="text-xs text-gray-500 capitalize">{user?.role || 'employee'}</span>
            </div>

            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold border border-blue-200 uppercase">
              {/* Generate 2-letter initials from username */}
              {user?.first_name ? user.first_name.substring(0, 2) : 'US'}
            </div>

            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Route rendering: Replaces content based on the URL path */}
      <main className="flex-1 min-h-0 p-4 overflow-auto">
        <Routes>
          <Route path="/" element={<SchedulePage />} />

          {/* Wrap the employees route with role-based protection */}
          <Route element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.MANAGER, UserRole.SCHEDULER]} />}>
            <Route path="/employees" element={<EmployeesPage />} />
          </Route>

          <Route path="/constraints" element={<ConstraintsPage />} />
        </Routes>
      </main>
    </div>
  );
}


/**
 * Root App component wrapped in BrowserRouter and AuthProvider.
 * Defines the top-level routing (Public vs. Protected routes).
 */
export default function App() {
  return (
    <AuthProvider>
      <LocationProvider>
        <Toaster richColors position="top-center" />
        <BrowserRouter>
          <Routes>
            {/* Public Route - No Sidebar/Topbar */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<PasswordResetPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/support" element={<SupportPage />} />

            {/* Protected Routes - Everything inside will require authentication */}
            <Route element={<ProtectedRoute />}>
              {/* The '/*' wildcard means AppLayout will handle all sub-routes */}
              <Route path="/*" element={<AppLayout />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LocationProvider>
    </AuthProvider>
  );
}