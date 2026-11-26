import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, KeyRound, ShieldCheck, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import InlineAlert from '@/components/ui/InlineAlert';
import Button from '@/components/ui/Button';
import { usePasswordReset } from './hooks/usePasswordReset';

const PasswordResetPage: React.FC = () => {
  const { step, requestCode, confirm, error, isPending: isLoading } = usePasswordReset();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  // Step 1: Request OTP
  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    requestCode(email);
  };

  // Step 2: Confirm Reset
  const handleConfirmReset = (e: React.FormEvent) => {
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
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Mail className="w-5 h-5 text-gray-400" />
              </div>
              <input
                type="email"
                required
                className="w-full py-2.5 pl-10 pr-3 text-sm text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="כתובת מייל"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Button type="submit" loading={isLoading} className="w-full py-2.5 font-semibold">
              שלח קוד
            </Button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                חזרה להתחברות
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: OTP & New Password Form */}
        {step === 'OTP_INPUT' && (
          <form onSubmit={handleConfirmReset} className="space-y-6">
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <ShieldCheck className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  required
                  maxLength={6}
                  className="w-full py-2.5 pl-10 pr-3 text-center tracking-[0.5em] text-lg font-bold text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} // Allow only digits
                  disabled={isLoading}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <KeyRound className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  className="w-full py-2.5 pl-10 pr-10 text-sm text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="סיסמא חדשה (מינימום 8 תווים)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading}
                />
                {/* Toggle password visibility */}
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'הסתר סיסמא' : 'הצג סיסמא'}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button type="submit" loading={isLoading} className="w-full py-2.5 font-semibold">
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
            <Button onClick={() => navigate('/login')} className="w-full py-2.5 font-semibold">
              להתחברות<ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PasswordResetPage;