// src/components/ui/IconButton.tsx
import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const iconButtonVariants = cva(
    'inline-flex shrink-0 items-center justify-center rounded transition-colors ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
    {
        variants: {
            tone: {
                neutral: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                primary: 'text-blue-600 hover:bg-blue-50 hover:text-blue-800',
                danger: 'text-red-500 hover:bg-red-50 hover:text-red-700',
                /** Grey until hovered, then red: removals that shouldn't draw the eye */
                subtleDanger: 'text-slate-400 hover:bg-red-50 hover:text-red-600',
            },
            size: {
                sm: 'p-1',
                md: 'p-1.5',
            },
        },
        defaultVariants: { tone: 'neutral', size: 'md' },
    },
);

export interface IconButtonProps
    extends Omit<ComponentProps<'button'>, 'aria-label' | 'title'>, VariantProps<typeof iconButtonVariants> {
    /** What the button does. Screen readers read it, and it shows as the hover tooltip */
    label: string;
}

/**
 * A button that shows only an icon (its children). The required label gives it an accessible name.
 * Defaults to type="button"; takes a ref, so it can be a radix `asChild` trigger.
 */
export default function IconButton({ label, tone, size, className, type = 'button', ...props }: IconButtonProps) {
    return (
        <button
            type={type}
            aria-label={label}
            title={label}
            className={cn(iconButtonVariants({ tone, size }), className)}
            {...props}
        />
    );
}
