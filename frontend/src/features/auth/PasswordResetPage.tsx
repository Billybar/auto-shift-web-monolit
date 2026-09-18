import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, KeyRound, Loader2, ArrowRight, ShieldCheck, ArrowLeft } from 'lucide-react';
import { requestPasswordReset, confirmPasswordReset } from '../../api/auth';

type ResetStep = 'EMAIL_INPUT' | 'OTP_INPUT' | 'SUCCESS';

const PasswordResetPage: React.FC = () => {
  const [step, setStep] = useState<ResetStep>('EMAIL_INPUT');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  // Step 1: Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    try {
      setIsLoading(true);
      await requestPasswordReset({ email });
      // We always move to the next step, due to security parity on the backend
      setStep('OTP_INPUT');
    } catch (err: any) {
      console.error('Failed to request reset:', err);
      setError('A server error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Confirm Reset
  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (otp.length !== 6) {
      setError('OTP must be exactly 6 digits.');
      return;
    }
    if (newPassword.length < 8) {
      setError('הסיסמא חייבת להכיל לפחות 8 תווים');
      return;
    }

    try {
      setIsLoading(true);
      await confirmPasswordReset({ email, otp, new_password: newPassword });
      setStep('SUCCESS');
    } catch (err: any) {
      console.error('Reset failed:', err);
      // Display specific error if available from backend
      if (err.response?.status === 400) {
        setError(err.response.data?.detail || 'Invalid or expired OTP.');
      } else {
        setError('Failed to reset password. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
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

        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
            {error}
          </div>
        )}

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
            <button
              type="submit"
              disabled={isLoading}
              className="flex justify-center w-full px-4 py-2.5 text-sm font-semibold text-white transition-colors bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'שלח קוד'}
            </button>
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
                  type="password"
                  required
                  minLength={8}
                  className="w-full py-2.5 pl-10 pr-3 text-sm text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="סיסמא חדשה (מינימום 8 תווים)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex justify-center w-full px-4 py-2.5 text-sm font-semibold text-white transition-colors bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'איפוס סיסמא'}
            </button>
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
            <button
              onClick={() => navigate('/login')}
              className="flex items-center justify-center w-full px-4 py-2.5 text-sm font-semibold text-white transition-colors bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700"
            >
               להתחברות<ArrowLeft className="w-4 h-4 ml-2" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PasswordResetPage;