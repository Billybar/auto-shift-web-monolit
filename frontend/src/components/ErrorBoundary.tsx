// src/components/ErrorBoundary.tsx
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './ui/Button';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

/**
 * Catches render errors below it and shows a recovery screen instead of a blank page.
 * React has no hook for this, so it stays a class component.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Unhandled render error:', error, info.componentStack);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div role="alert" className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center" dir="rtl">
                <AlertTriangle size={48} className="text-amber-500" />
                <h2 className="text-xl font-semibold text-gray-800">משהו השתבש</h2>
                <p className="max-w-sm text-sm text-gray-500">אירעה שגיאה לא צפויה בתצוגה. רענון הדף בדרך כלל פותר את הבעיה.</p>
                <Button onClick={() => window.location.reload()}>
                    רענון הדף
                </Button>
            </div>
        );
    }
}
