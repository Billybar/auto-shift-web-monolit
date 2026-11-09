// src/features/demo/DemoStartPage.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { logError, toAppError } from '../../api/errors';
import InlineAlert from '../../components/ui/InlineAlert';
import { useDemo } from './hooks/useDemo';

/**
 * Public entry to the demo (the link to share): creates a private sandbox, logs the visitor in
 * as its manager and opens the schedule. A visitor who is already logged in goes straight in.
 */
export default function DemoStartPage() {
    const { isAuthenticated, isLoading } = useAuth();
    const { isEnabled, start } = useDemo();
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);
    // Decides once per visit, even when StrictMode runs the effect twice
    const startedRef = useRef(false);

    const goToSchedule = useCallback(() => navigate('/', { replace: true }), [navigate]);

    const handleFailure = useCallback((err: unknown) => {
        logError('Demo start failed:', err);
        setError(toAppError(err, { byStatus: { 404: 'סביבת ההדגמה אינה זמינה באתר זה.' } }).message);
    }, []);

    useEffect(() => {
        // Wait until AuthContext has read the stored token
        if (isLoading || startedRef.current) return;
        startedRef.current = true;
        // Already logged in: reuse that session instead of creating another sandbox
        if (isAuthenticated) {
            goToSchedule();
            return;
        }
        start().then(goToSchedule, handleFailure);
    }, [isLoading, isAuthenticated, start, goToSchedule, handleFailure]);

    const retry = () => {
        setError(null);
        start().then(goToSchedule, handleFailure);
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans px-4">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-2xl text-center">
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">AutoShift</h1>
                {error ? (
                    <>
                        <InlineAlert variant="error" action={{ label: 'נסה שוב', onClick: retry }} className="text-right">
                            {error}
                        </InlineAlert>
                        {/* The demo instance has no login screen to go back to */}
                        {!isEnabled && (
                            <Link to="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                                חזרה למסך הכניסה
                            </Link>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-gray-600">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        <p className="text-sm">מכין עבורך סביבת הדגמה עם עובדים, משמרות ואילוצים…</p>
                    </div>
                )}
            </div>
        </div>
    );
}
