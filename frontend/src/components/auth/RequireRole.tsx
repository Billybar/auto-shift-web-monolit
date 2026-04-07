import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/index';

interface RequireRoleProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

/**
 * A wrapper component that only renders its children if the current user
 * has one of the allowed roles.
 */
export const RequireRole: React.FC<RequireRoleProps> = ({ allowedRoles, children }) => {
  const { user } = useAuth();

  // If there is no user, or the user's role is not in the allowed list, render nothing
  if (!user || !allowedRoles.includes(user.role)) {
    return null;
  }

  // Otherwise, render the protected content
  return <>{children}</>;
};