// src/components/ui/Label.tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Field label above an Input or Select; link the two with htmlFor / id. */
export default function Label({ className, ...props }: ComponentProps<'label'>) {
    return <label className={cn('mb-1 block text-xs font-medium text-slate-700', className)} {...props} />;
}
