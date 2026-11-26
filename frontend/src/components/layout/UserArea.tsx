// src/components/layout/UserArea.tsx
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';

import IconButton from '@/components/ui/IconButton';
import { useAuth } from '@/context/useAuth';
import { useDemo } from '@/features/demo/hooks/useDemo';
import { ROLE_LABELS } from '@/lib/roleLabels';

/** The signed-in user's name and role, and the logout button. */
export default function UserArea() {
    const { user, logout } = useAuth();
    const { isEnabled: isDemo } = useDemo();
    const navigate = useNavigate();

    if (!user) return null;

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
            <div className="flex flex-col text-right leading-tight">
                <span className="text-sm font-semibold text-gray-900">{user.first_name} {user.last_name}</span>
                <span className="text-xs text-gray-500">{ROLE_LABELS[user.role]}</span>
            </div>

            {/* The demo has no accounts: leaving would only open a new sandbox (the banner's "start over" does that) */}
            {!isDemo && (
                <IconButton label="יציאה מהמערכת" tone="subtleDanger" onClick={handleLogout} className="rounded-full p-2">
                    <LogOut size={20} />
                </IconButton>
            )}
        </div>
    );
}
