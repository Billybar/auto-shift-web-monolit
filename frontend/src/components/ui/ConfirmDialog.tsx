// src/components/ui/ConfirmDialog.tsx
import type { ReactNode } from 'react';
import { AlertDialog } from 'radix-ui';

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: ReactNode;
    confirmText?: string;
    cancelText?: string;
    tone?: ConfirmTone;
    onConfirm: () => void;
    onCancel: () => void;
}

const CONFIRM_BUTTON_STYLES: Record<ConfirmTone, string> = {
    default: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500',
    danger: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500',
};

/**
 * Presentational confirm dialog on radix AlertDialog: focus is trapped and starts on Cancel, Esc cancels.
 * Screens don't render it themselves; they call useConfirm() and ConfirmProvider renders this.
 */
export default function ConfirmDialog({
    open,
    title,
    description,
    confirmText = 'אישור',
    cancelText = 'ביטול',
    tone = 'default',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        // Esc and Cancel close through onOpenChange; Action calls onConfirm first, so its close is a no-op
        <AlertDialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
                <AlertDialog.Content
                    dir="rtl"
                    // Without a description, tell radix there is none on purpose (avoids its dev warning)
                    {...(description ? {} : { 'aria-describedby': undefined })}
                    className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl focus:outline-none"
                >
                    <AlertDialog.Title className="text-lg font-bold text-gray-900">{title}</AlertDialog.Title>
                    {description && (
                        <AlertDialog.Description asChild>
                            <div className="mt-2 text-sm text-gray-600">{description}</div>
                        </AlertDialog.Description>
                    )}

                    <div className="mt-6 flex justify-end gap-3">
                        <AlertDialog.Cancel className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2">
                            {cancelText}
                        </AlertDialog.Cancel>
                        <AlertDialog.Action
                            onClick={onConfirm}
                            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${CONFIRM_BUTTON_STYLES[tone]}`}
                        >
                            {confirmText}
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}
