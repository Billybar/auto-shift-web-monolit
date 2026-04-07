import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Users, CalendarX, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import LoginPage from './features/auth/LoginPage';
import { UserRole } from './types/index';
import { LocationProvider, useAppLocation } from './context/LocationContext';

// Feature page imports
import SchedulePage from './features/schedule/SchedulePage';
import EmployeesPage from './features/employees/EmployeesPage';
import ConstraintsPage from './features/constraints/ConstraintsPage';

/**
 * Layout component that wraps the main application structure.
 * Provides access to the current location for navigation styling.
 */
function AppLayout() {
  const { selectedLocationId, setSelectedLocationId } = useAppLocation();
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

  /**
   * Generates CSS classes for sidebar links based on the active route.
   */
  const getLinkClass = (path: string) => {
    const isActive = location.pathname === path;
    return `flex items-center gap-3 px-4 py-3 rounded-md transition ${
      isActive
        ? 'bg-blue-600 text-white shadow'
        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`;
  };

  return (
    <div className="flex h-screen w-full bg-gray-100 overflow-hidden font-sans">

      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-800 text-white flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-700">
          <h1 className="text-2xl font-bold tracking-wider text-blue-400">AutoShift</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {/* Link components enable SPA navigation without full page refresh */}
          <Link to="/" className={getLinkClass('/')}>
            <CalendarDays size={20} />
            Weekly Schedule
          </Link>

          {/* Only render this link if the user is NOT a regular employee */}
          {user && user.role !== UserRole.EMPLOYEE && (
            <Link to="/employees" className={getLinkClass('/employees')}>
              <Users size={20} />
              Employee Management
            </Link>
          )}

          <Link to="/constraints" className={getLinkClass('/constraints')}>
            <CalendarX size={20} />
            Shift Constraints
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar / Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-800">
            {/* Dynamic page title based on current route */}
            {location.pathname === '/' && 'Weekly Shift Schedule'}
            {location.pathname === '/employees' && 'Location Employees'}
            {location.pathname === '/constraints' && 'Submit Constraints'}
          </h2>

          <div className="flex items-center space-x-4 space-x-reverse">
            {/* Location Selector: Critical for multi-site management */}
            <select 
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(Number(e.target.value))}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2 mr-4"
            >
              <option value="3">Herzliya - Main Branch</option>
              <option value="4">Modien</option>
            </select>

            {/* User Profile & Logout Area */}
            <div className="flex items-center gap-4 pl-4 border-l border-gray-200">
              <div className="flex flex-col text-right">
                <span className="text-sm font-semibold text-gray-900">{user ? `${user.first_name} ${user.last_name}` : 'User'}</span>
                <span className="text-xs text-gray-500 capitalize">{user?.role || 'employee'}</span>
              </div>
              
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200 uppercase">
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
        <main className="flex-1 p-8 overflow-auto">
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
        <BrowserRouter>
          <Routes>
            {/* Public Route - No Sidebar/Topbar */}
            <Route path="/login" element={<LoginPage />} />
            
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