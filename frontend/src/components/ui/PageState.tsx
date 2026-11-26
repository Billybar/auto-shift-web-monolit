// src/components/ui/PageState.tsx
import type { ReactNode } from 'react';

import Spinner from './Spinner';

/** A page's loading state: the large spinner, centered in the page area. */
export function PageSpinner() {
    return (
        <div className="flex justify-center items-center h-full">
            <Spinner />
        </div>
    );
}

export interface PageEmptyProps {
    /** Shown above the title */
    icon?: ReactNode;
    title: string;
    children?: ReactNode;
}

/** A page with nothing to show yet (e.g. no location picked): an optional icon over a title. */
export function PageEmpty({ icon, title, children }: PageEmptyProps) {
    return (
        <div className="flex justify-center items-center h-full flex-col gap-4 text-slate-500">
            {icon}
            <h2 className="text-xl font-medium">{title}</h2>
            {children}
        </div>
    );
}
