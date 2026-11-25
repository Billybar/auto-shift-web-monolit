import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';
import { UserRole } from '@/types/index';
import Spinner from '@/components/ui/Spinner';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  // Show a loading spinner while checking auth state on initial load
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-50">
        <Spinner />
      </div>
    );
  }

  // If not authenticated, redirect to login page and save the attempted URL
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If roles are specified, check if the user has the required role
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirect to home/dashboard if they don't have permission
    return <Navigate to="/" replace />;
  }

  // If everything is okay, render the child routes (Outlet renders the nested routes)
  return <Outlet />;
};