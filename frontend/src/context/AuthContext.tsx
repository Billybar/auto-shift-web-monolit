import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type {ReactNode} from 'react';
import { jwtDecode } from 'jwt-decode';
import type { User, UserRole } from '../types/index';
import { refreshToken } from '../api/auth';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Renew the token once it is older than this. The token lifetime itself is the inactivity window.
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

// Expected structure of the JWT payload from FastAPI
interface JWTPayload {
  sub: string;
  role: string;
  employee_id: number;
  exp: number;
  iat?: number; // Missing on tokens issued before refresh support
  first_name: string;
  last_name: string;
}

// Maps the JWT claims to the user shape used across the app
const userFromToken = (token: string): User => {
  const decoded = jwtDecode<JWTPayload>(token);
  return {
    email: decoded.sub,
    first_name: decoded.first_name || '',
    last_name: decoded.last_name || '',
    role: decoded.role as UserRole,
    employee_id: decoded.employee_id,
  };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const isRefreshing = useRef(false);

  useEffect(() => {
    // Check for existing token on app load
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const decoded = jwtDecode<JWTPayload>(token);
        // Check if token is expired
        if (decoded.exp * 1000 < Date.now()) {
          logout();
        } else {
          setUser(userFromToken(token));
        }
      } catch (error) {
        console.error('Failed to decode token on load', error);
        logout();
      }
    }
    setIsLoading(false);

    // Sliding session: swap a day-old token for a fresh one so active users are never logged out
    const maybeRefresh = async () => {
      const current = localStorage.getItem('access_token');
      if (!current || isRefreshing.current) return;
      try {
        const { exp, iat } = jwtDecode<JWTPayload>(current);
        const now = Date.now();
        if (exp * 1000 < now || (iat && now - iat * 1000 < REFRESH_AFTER_MS)) return;

        isRefreshing.current = true;
        const { access_token } = await refreshToken();
        // Skip if the user logged out (or in again) while the request was in flight
        if (localStorage.getItem('access_token') === current) {
          localStorage.setItem('access_token', access_token);
          setUser(userFromToken(access_token));
        }
      } catch (error) {
        // Network errors keep the current token; a 401 is handled by the apiClient interceptor
        console.warn('Token refresh failed', error);
      } finally {
        isRefreshing.current = false;
      }
    };

    // Desktop tabs stay open for days, so also refresh when the tab comes back into view
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') maybeRefresh();
    };

    maybeRefresh();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const login = (token: string) => {
    localStorage.setItem('access_token', token);
    setUser(userFromToken(token));
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setUser(null);
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook for easy access to AuthContext
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
