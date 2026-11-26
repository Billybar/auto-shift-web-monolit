// src/features/auth/PasswordResetPage.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ShieldCheck, ArrowLeft } from 'lucide-react';

import Button from '@/components/ui/Button';
import InlineAlert from '@/components/ui/InlineAlert';
import { AuthInput, PasswordInput } from './components/AuthInput';
import { usePasswordReset } from './hooks/usePasswordReset';

export default function PasswordResetPage() {
    const { step, requestCode, confirm, error, isPending: isLoading } = usePasswordReset();
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');

    const navigate = useNavigate();

    // Step 1: Request OTP
    const handleRequestOtp = (e: FormEvent) => {
        e.preventDefault();
        requestCode(email);
    };

    // Step 2: Confirm Reset
    const handleConfirmReset = (e: FormEvent) => {
        e.preventDefault();
        confirm(email, otp, newPassword);
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans">
            <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-xl shadow-2xl">
                <div className="text-center">
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">AutoShift</h1>
                    <p className="mt-2 text-sm text-gray-500">
                        {step === 'EMAIL_INPUT' && 'איפוס סיסמא'}
                        {step === 'OTP_INPUT' && 'הזן את הקוד שנשלח למייל שלך'}
                        {step === 'SUCCESS' && 'סיסמא אופסה בהצלחה'}
                    </p>
                </div>

                {error && <InlineAlert variant="error">{error}</InlineAlert>}

                {/* STEP 1: Email Form */}
                {step === 'EMAIL_INPUT' && (
                    <form onSubmit={handleRequestOtp} className="space-y-6">
                        <AuthInput
                            id="reset-email"
                            label="כתובת מייל"
                            icon={Mail}
                            type="email"
                            required
                            placeholder="כתובת מייל"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isLoading}
                        />
                        <Button type="submit" size="lg" loading={isLoading} className="w-full font-semibold">
                            שלח קוד
                        </Button>
                        <div className="text-center">
                            <Button variant="link" onClick={() => navigate('/login')}>
                                חזרה להתחברות
                            </Button>
                        </div>
                    </form>
                )}

                {/* STEP 2: OTP & New Password Form */}
                {step === 'OTP_INPUT' && (
                    <form onSubmit={handleConfirmReset} className="space-y-6">
                        <div className="space-y-4">
                            <AuthInput
                                id="reset-code"
                                label="קוד אימות"
                                icon={ShieldCheck}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                                maxLength={6}
                                placeholder="000000"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} // Allow only digits
                                disabled={isLoading}
                                className="text-center text-lg font-bold tracking-[0.5em]"
                            />

                            <PasswordInput
                                id="reset-new-password"
                                label="סיסמא חדשה"
                                autoComplete="new-password"
                                required
                                minLength={8}
                                placeholder="סיסמא חדשה (מינימום 8 תווים)"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>

                        <Button type="submit" size="lg" loading={isLoading} className="w-full font-semibold">
                            איפוס סיסמא
                        </Button>
                    </form>
                )}

                {/* STEP 3: Success State */}
                {step === 'SUCCESS' && (
                    <div className="text-center space-y-6">
                        <div className="flex justify-center">
                            <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
                                <ShieldCheck className="w-8 h-8 text-green-600" />
                            </div>
                        </div>
                        <p className="text-sm text-gray-600">
                            איפסת את הסיסמא בהצלחה
                        </p>
                        <Button size="lg" onClick={() => navigate('/login')} className="w-full font-semibold">
                            להתחברות<ArrowLeft className="w-4 h-4" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
