// src/features/location-settings/hooks/useDraftNames.ts
import { useState } from 'react';

const withoutKey = (record: Record<number, string>, key: number): Record<number, string> => {
    const next = { ...record };
    delete next[key];
    return next;
};

interface CommitOptions {
    // An empty name is sent (it clears the name) instead of dropping the edit
    allowEmpty?: boolean;
}

/**
 * Names being edited in a list, keyed by item id, until they are committed (blur / Enter) or dropped
 * (Escape). A failed save keeps the draft, so the user can fix it.
 */
export function useDraftNames() {
    const [drafts, setDrafts] = useState<Record<number, string>>({});

    /** What the name field shows: the draft, or the saved name. */
    const nameOf = (id: number, savedName: string): string => drafts[id] ?? savedName;

    const edit = (id: number, value: string) => setDrafts(prev => ({ ...prev, [id]: value }));

    const drop = (id: number) => setDrafts(prev => withoutKey(prev, id));

    /**
     * Sends the trimmed draft through `save`, unless it is unchanged (or empty, unless allowed).
     * The draft is dropped once saved; `save` returns false on failure.
     */
    const commit = async (
        id: number,
        savedName: string,
        save: (name: string) => Promise<boolean>,
        { allowEmpty = false }: CommitOptions = {},
    ) => {
        const draft = drafts[id];
        if (draft === undefined) return;
        const name = draft.trim();
        if (name === savedName || (!name && !allowEmpty)) {
            drop(id);
            return;
        }
        if (await save(name)) drop(id);
    };

    return { nameOf, edit, drop, commit };
}
