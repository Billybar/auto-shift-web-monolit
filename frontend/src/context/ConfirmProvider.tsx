// src/context/ConfirmProvider.tsx
import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { ConfirmContext } from './confirmContext';
import type { ConfirmOptions } from './confirmContext';

/**
 * Renders the app's single confirm dialog and provides useConfirm() to everything inside it.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    // Resolver of the pending confirm() promise. Cleared once settled, so a second close is a no-op.
    const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

    const confirm = useCallback((nextOptions: ConfirmOptions) => {
        // A new request replaces a pending one, which counts as cancelled
        resolveRef.current?.(false);
        setOptions(nextOptions);
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
        });
    }, []);

    const settle = (confirmed: boolean) => {
        resolveRef.current?.(confirmed);
        resolveRef.current = null;
        setOptions(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <ConfirmDialog
                open={options !== null}
                title={options?.title ?? ''}
                description={options?.description}
                confirmText={options?.confirmText}
                cancelText={options?.cancelText}
                tone={options?.tone}
                onConfirm={() => settle(true)}
                onCancel={() => settle(false)}
            />
        </ConfirmContext.Provider>
    );
}
