// src/context/useAuth.ts
// Kept apart from AuthContext.tsx: a file that exports both a component and a hook breaks Fast Refresh
import { createContext, useContext } from 'react';
import type { User } from '@/types/index';

export interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (token: string) => void;
    logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** The signed-in user and the login / logout actions. Must be used within an AuthProvider. */
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
