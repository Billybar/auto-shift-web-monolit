import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { loginUser } from '../../api/auth';
import { logError, toAppError } from '../../api/errors';
import InlineAlert from '../../components/ui/InlineAlert';
import { KeyRound, User as UserIcon, Loader2, Eye, EyeOff } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Determine where to send the user after a successful login
  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic client-side validation
    if (!username.trim() || !password.trim()) {
      setError('יש להזין אימייל וסיסמא.');
      return;
    }

    try {
      setIsLoading(true);
      // Call the FastAPI backend
      const response = await loginUser(username, password);
      
      // Update the global auth state using the AuthContext
      login(response.access_token);
      
      // Redirect the user to the page they were trying to access (or dashboard)
      navigate(from, { replace: true });
    } catch (err) {
      logError('Login failed:', err);
      // On this endpoint 401 means wrong credentials; a request that never reached the server
      // gets the connection message, so the password isn't blamed for a network problem
      setError(toAppError(err, { byStatus: { 401: 'אימייל או סיסמה אינם נכונים.' } }).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-xl shadow-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">AutoShift</h1>
          <p className="mt-2 text-sm text-gray-500">התחבר לחשבון</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Message Alert */}
          {error && <InlineAlert variant="error">{error}</InlineAlert>}

          <div className="space-y-4">
            {/* Username Field */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <UserIcon className="w-5 h-5 text-gray-400" />
              </div>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="w-full py-2.5 pl-10 pr-3 text-sm text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="מייל"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Password Field */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <KeyRound className="w-5 h-5 text-gray-400" />
              </div>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className="w-full py-2.5 pl-10 pr-10 text-sm text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="סיסמא"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

            {/* Link to the password reset page */}
            <div className="flex items-center justify-start mt-2">
              <button
                type="button"
                onClick={() => navigate('/reset-password')}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                שכחתי סיסמא
              </button>
            </div>

          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="flex justify-center w-full px-4 py-2.5 text-sm font-semibold text-white transition-colors bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'כניסה'
            )}
          </button>
        </form>

        <div className="flex justify-center gap-4">
          <Link to="/support" className="text-xs text-gray-500 hover:text-gray-700 hover:underline">
            תמיכה
          </Link>
          <Link to="/privacy" className="text-xs text-gray-500 hover:text-gray-700 hover:underline">
            מדיניות פרטיות
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;