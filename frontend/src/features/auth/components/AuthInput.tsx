// src/features/auth/components/AuthInput.tsx
import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Eye, EyeOff, KeyRound, type LucideIcon } from 'lucide-react';

import IconButton from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

interface AuthInputProps extends Omit<ComponentProps<'input'>, 'id'> {
    id: string;
    /** Read by screen readers; the placeholder shows the same text on screen */
    label: string;
    icon: LucideIcon;
    /** Drawn inside the field on the right, e.g. a button */
    trailing?: ReactNode;
}

/** The sign-in pages' large field, with an icon on the left. */
export function AuthInput({ id, label, icon: Icon, trailing, className, ...props }: AuthInputProps) {
    return (
        <div className="relative">
            <label htmlFor={id} className="sr-only">{label}</label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Icon className="h-5 w-5 text-slate-400" aria-hidden="true" />
            </div>
            <Input
                id={id}
                className={cn('rounded-lg bg-slate-50 py-2.5 pl-10 pr-3 text-slate-900', trailing !== undefined && 'pr-10', className)}
                {...props}
            />
            {trailing}
        </div>
    );
}

/** A password AuthInput with a button that shows or hides what was typed. */
export function PasswordInput(props: Omit<AuthInputProps, 'icon' | 'type' | 'trailing'>) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <AuthInput
            {...props}
            icon={KeyRound}
            type={isVisible ? 'text' : 'password'}
            trailing={
                <IconButton
                    label={isVisible ? 'הסתר סיסמא' : 'הצג סיסמא'}
                    onClick={() => setIsVisible((visible) => !visible)}
                    disabled={props.disabled}
                    className="absolute inset-y-0 right-0 px-3 hover:bg-transparent"
                >
                    {isVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </IconButton>
            }
        />
    );
}
