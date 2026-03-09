import React , { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { CalendarDays, Users, CalendarX } from 'lucide-react';
import { loginAsAdmin } from './api/auth';

// Feature page imports
import SchedulePage from './features/schedule/SchedulePage';
import EmployeesPage from './features/employees/EmployeesPage';
import ConstraintsPage from './features/constraints/ConstraintsPage';

/**
 * Layout component that wraps the main application structure.
 * Provides access to the current location for navigation styling.
 */
function AppLayout() {
  const location = useLocation();

  /**
   * Temporary MVP Auto-Login:
   * Authenticates as the seeded admin user when the app loads.
   */
  useEffect(() => {
    loginAsAdmin().catch(console.error);
  }, []);

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
          <Link to="/employees" className={getLinkClass('/employees')}>
            <Users size={20} />
            Employee Management
          </Link>
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
            <select className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2 mr-4">
              <option value="1">Herzliya - Main Branch</option>
              <option value="2">Tel Aviv</option>
            </select>

            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
              AD
            </div>
          </div>
        </header>

        {/* Route rendering: Replaces content based on the URL path */}
        <main className="flex-1 p-8 overflow-auto">
          <Routes>
            <Route path="/" element={<SchedulePage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/constraints" element={<ConstraintsPage />} />
          </Routes>
        </main>

      </div>
    </div>
  );
}

/**
 * Root App component wrapped in BrowserRouter for navigation state management.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}