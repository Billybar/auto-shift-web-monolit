import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { jwtDecode } from 'jwt-decode';
import { getToken, setToken, clearToken } from '../../api/tokenStorage';
import { setUnauthorizedHandler } from '../../api/client';
import { refreshToken } from '../../api/auth';
import type { User, UserRole } from '../types';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (token: string) => Promise<void>;
    logout: () => Promise<void>;
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

    const login = async (token: string) => {
        await setToken(token);
        setUser(userFromToken(token));
    };

    const logout = async () => {
        await clearToken();
        setUser(null);
    };

    useEffect(() => {
        // Sliding session: swap a day-old token for a fresh one so active users are never logged out
        const maybeRefresh = async () => {
            if (isRefreshing.current) return;
            isRefreshing.current = true;
            try {
                const current = await getToken();
                if (!current) return;

                const { exp, iat } = jwtDecode<JWTPayload>(current);
                const now = Date.now();
                if (exp * 1000 < now || (iat && now - iat * 1000 < REFRESH_AFTER_MS)) return;

                const { access_token } = await refreshToken();
                // Skip if the user logged out (or in again) while the request was in flight
                if ((await getToken()) === current) {
                    await setToken(access_token);
                    setUser(userFromToken(access_token));
                }
            } catch (error) {
                // Network errors keep the current token; a 401 is handled by the apiClient interceptor
                console.warn('Token refresh failed', error);
            } finally {
                isRefreshing.current = false;
            }
        };

        const loadToken = async () => {
            try {
                const token = await getToken();
                if (token) {
                    const decoded = jwtDecode<JWTPayload>(token);
                    // Check if token is expired
                    if (decoded.exp * 1000 < Date.now()) {
                        await clearToken();
                    } else {
                        setUser(userFromToken(token));
                    }
                }
            } catch (error) {
                console.error('Failed to load token', error);
                await clearToken();
                setUser(null);
            } finally {
                setIsLoading(false);
            }
            // Runs after the app is shown, so a slow network never delays startup
            maybeRefresh();
        };

        loadToken();

        // A 401 anywhere clears the stored token; drop the in-memory session with it
        setUnauthorizedHandler(() => setUser(null));

        // Phones keep the app suspended for days, so also refresh when it returns to the foreground
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') maybeRefresh();
        });

        return () => {
            subscription.remove();
            setUnauthorizedHandler(null);
        };
    }, []);

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
