// src/components/ui/InlineAlert.tsx
import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';

export type AlertVariant = 'error' | 'warning' | 'info' | 'success';

const VARIANT_STYLES: Record<AlertVariant, { box: string; icon: LucideIcon }> = {
    error: { box: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle },
    warning: { box: 'bg-amber-50 text-amber-800 border-amber-200', icon: AlertTriangle },
    info: { box: 'bg-blue-50 text-blue-800 border-blue-200', icon: Info },
    success: { box: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
};

export interface InlineAlertProps {
    variant: AlertVariant;
    title?: string;
    children?: ReactNode;
    // Rendered as a bulleted list under the text (e.g. unlinked employee IDs)
    items?: string[];
    // e.g. { label: 'נסה שוב', onClick: reload }
    action?: { label: string; onClick: () => void };
    onDismiss?: () => void;
    className?: string;
}

/**
 * A message that belongs to a specific form, dialog or screen region, and stays until it's resolved.
 * Transient feedback goes through `notify` (toasts) instead; decisions go through `useConfirm`.
 */
export default function InlineAlert({ variant, title, children, items, action, onDismiss, className = '' }: InlineAlertProps) {
    const { box, icon: Icon } = VARIANT_STYLES[variant];
    // Errors and warnings are announced right away; info and success wait for the screen reader
    const role = variant === 'error' || variant === 'warning' ? 'alert' : 'status';

    return (
        <div role={role} className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${box} ${className}`}>
            <Icon size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
                {title && <p className="font-semibold">{title}</p>}
                {children && <div>{children}</div>}
                {items && items.length > 0 && (
                    <ul className="list-disc ps-5 space-y-0.5">
                        {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                    </ul>
                )}
                {action && (
                    <button
                        type="button"
                        onClick={action.onClick}
                        className="mt-2 px-3 py-1 rounded-md border border-current text-xs font-semibold hover:bg-white/60 transition-colors"
                    >
                        {action.label}
                    </button>
                )}
            </div>
            {onDismiss && (
                <button type="button" onClick={onDismiss} aria-label="סגירה" className="shrink-0 opacity-70 hover:opacity-100 transition-opacity">
                    <X size={16} />
                </button>
            )}
        </div>
    );
}
