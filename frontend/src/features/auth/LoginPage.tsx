// src/features/auth/LoginPage.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { User as UserIcon } from 'lucide-react';

import Button from '@/components/ui/Button';
import InlineAlert from '@/components/ui/InlineAlert';
import { useDemo } from '@/features/demo/hooks/useDemo';
import { AuthInput, PasswordInput } from './components/AuthInput';
import { useLogin } from './hooks/useLogin';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const { submit, error, isPending: isLoading } = useLogin();
    const { isEnabled: isDemoEnabled, isStatusLoaded: isDemoStatusLoaded } = useDemo();
    const navigate = useNavigate();
    const location = useLocation();

    // Determine where to send the user after a successful login
    const from = location.state?.from?.pathname || '/';

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        // Back to the page the user was trying to reach
        if (await submit(username, password)) navigate(from, { replace: true });
    };

    // The demo instance has no accounts: a visitor who lands here goes straight into a sandbox
    if (isDemoEnabled) return <Navigate to="/demo" replace />;
    // Blank until the status answers, so demo visitors never see the form flash by
    if (!isDemoStatusLoaded) return <div className="min-h-screen bg-slate-900" />;

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans">
            <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-xl shadow-2xl">
                <div className="text-center">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">AutoShift</h1>
                    <p className="mt-2 text-sm text-slate-500">התחבר לחשבון</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && <InlineAlert variant="error">{error}</InlineAlert>}

                    <div className="space-y-4">
                        <AuthInput
                            id="username"
                            name="username"
                            label="מייל"
                            icon={UserIcon}
                            type="text"
                            autoComplete="username"
                            required
                            placeholder="מייל"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={isLoading}
                        />

                        <PasswordInput
                            id="password"
                            name="password"
                            label="סיסמא"
                            autoComplete="current-password"
                            required
                            placeholder="סיסמא"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isLoading}
                        />

                        <div className="flex items-center justify-start mt-2">
                            <Button variant="link" onClick={() => navigate('/reset-password')}>
                                שכחתי סיסמא
                            </Button>
                        </div>
                    </div>

                    <Button type="submit" size="lg" loading={isLoading} className="w-full font-semibold">
                        כניסה
                    </Button>
                </form>

                <div className="flex justify-center gap-4">
                    <Link to="/support" className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
                        תמיכה
                    </Link>
                    <Link to="/privacy" className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
                        מדיניות פרטיות
                    </Link>
                </div>
            </div>
        </div>
    );
}
