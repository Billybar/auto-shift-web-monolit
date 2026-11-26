// src/features/demo/DemoStartPage.tsx
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import InlineAlert from '@/components/ui/InlineAlert';
import { useDemo } from './hooks/useDemo';
import { useDemoStart } from './hooks/useDemoStart';

/**
 * Public entry to the demo (the link to share): creates a private sandbox, logs the visitor in
 * as its manager and opens the schedule. A visitor who is already logged in goes straight in.
 */
export default function DemoStartPage() {
    const { isEnabled } = useDemo();
    const { error, retry } = useDemoStart();

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
