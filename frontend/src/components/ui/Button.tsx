// src/components/ui/Button.tsx
import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
                secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus-visible:ring-gray-400',
                success: 'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500',
                danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
                ghost: 'text-gray-600 hover:bg-gray-100 focus-visible:ring-gray-400',
            },
            size: {
                sm: 'px-3 py-1.5 text-sm',
                md: 'px-4 py-2 text-sm',
            },
        },
        defaultVariants: { variant: 'primary', size: 'md' },
    },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
    /** Shows a spinner before the label and disables the button (e.g. while saving) */
    loading?: boolean;
}

/** The app's button. Defaults to type="button", so only an explicit type="submit" submits a form. */
export default function Button({
    variant,
    size,
    loading = false,
    disabled,
    className,
    type = 'button',
    children,
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(buttonVariants({ variant, size }), className)}
            {...props}
        >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {children}
        </button>
    );
}
