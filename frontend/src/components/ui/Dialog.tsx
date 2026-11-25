// src/components/ui/Dialog.tsx
import type { ComponentProps } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * Modal dialog on radix Dialog: focus is trapped inside, Esc and a press on the backdrop close it.
 * The backdrop counts only when the press starts there, so a text selection that starts in an input
 * and ends outside the panel does not close it.
 *
 *   <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
 *     <DialogContent size="md">
 *       <DialogHeader><DialogTitle>…</DialogTitle></DialogHeader>
 *       …
 *       <DialogFooter>…buttons…</DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 *
 * Content without a DialogDescription should pass aria-describedby={undefined} (avoids radix's dev warning).
 */
export const Dialog = DialogPrimitive.Root;
export const DialogClose = DialogPrimitive.Close;

// Max width of the panel, named after Tailwind's max-w-* steps
const SIZES = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
} as const;

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
    size?: keyof typeof SIZES;
    /** false: a press on the backdrop does nothing, for dialogs where a misclick would drop unsaved work */
    closeOnBackdrop?: boolean;
}

export function DialogContent({
    size = 'md',
    closeOnBackdrop = true,
    onInteractOutside,
    className,
    children,
    ...props
}: DialogContentProps) {
    return (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm" />
            <DialogPrimitive.Content
                dir="rtl"
                className={cn(
                    'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2',
                    'max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl focus:outline-none',
                    SIZES[size],
                    className,
                )}
                onInteractOutside={(e) => {
                    onInteractOutside?.(e);
                    if (!closeOnBackdrop) e.preventDefault();
                }}
                {...props}
            >
                {children}
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
    return <div className={cn('mb-4 flex flex-col gap-1', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
    return <DialogPrimitive.Title className={cn('text-xl font-bold text-gray-900', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
    return <DialogPrimitive.Description className={cn('text-sm text-gray-600', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
    return <div className={cn('mt-6 flex justify-end gap-3', className)} {...props} />;
}
