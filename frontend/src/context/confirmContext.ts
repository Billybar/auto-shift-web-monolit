// src/context/confirmContext.ts
// Kept apart from ConfirmProvider.tsx: a file that exports both a component and a hook breaks Fast Refresh
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ConfirmTone } from '../components/ui/ConfirmDialog';

export interface ConfirmOptions {
    title: string;
    // What happens if the user confirms (e.g. "העובדים יראו את המשמרות באופן מיידי")
    description?: ReactNode;
    // A verb naming the action (e.g. 'פרסום', 'מחיקה'), not a generic 'אישור'
    confirmText?: string;
    cancelText?: string;
    tone?: ConfirmTone;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Returns `confirm(options)`, which opens the confirm dialog and resolves to true on confirm,
 * false on cancel or Esc. Usage: `if (!(await confirm({ title, description, confirmText }))) return;`
 */
export function useConfirm(): ConfirmFn {
    const confirm = useContext(ConfirmContext);
    if (!confirm) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return confirm;
}
