import React, { createContext, useContext, useState, useEffect } from 'react';
import type {ReactNode} from 'react';
import { jwtDecode } from 'jwt-decode';
import type { User, UserRole } from '../types/index';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Expected structure of the JWT payload from FastAPI
interface JWTPayload {
  sub: string;
  role: string;
  employee_id: number;
  exp: number;
  first_name: string;
  last_name: string;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
          setUser({
            email: decoded.sub,
            first_name: decoded.first_name || '',
            last_name: decoded.last_name || '',
            role: decoded.role as UserRole,
            employee_id: decoded.employee_id,
          });
        }
      } catch (error) {
        console.error('Failed to decode token on load', error);
        logout();
      }
    }
    setIsLoading(false);
  }, []);

  const login = (token: string) => {
    localStorage.setItem('access_token', token);
    const decoded = jwtDecode<JWTPayload>(token);
    setUser({
        email: decoded.sub,
        first_name: decoded.first_name || '',
        last_name: decoded.last_name || '',
        role: decoded.role as UserRole,
        employee_id: decoded.employee_id,
      });
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