// src/features/admin/hooks/useAddToHierarchy.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createClient, createLocation, createOrganization } from '@/api/admin';
import { logError, toAppError } from '@/api/errors';
import { adminLocationsQuery, allowedLocationsKey, clientsQuery, organizationsQuery } from '@/api/queries';
import { notify } from '@/lib/notify';

/** What is being added: a new organization, or a child of the given parent. */
export type AddTarget =
    | { kind: 'organization' }
    | { kind: 'client'; organizationId: number }
    | { kind: 'location'; clientId: number };

export const ADD_COPY: Record<AddTarget['kind'], { placeholder: string; success: string; failure: string }> = {
    organization: { placeholder: 'שם הארגון', success: 'הארגון נוסף', failure: 'הוספת הארגון נכשלה' },
    client: { placeholder: 'שם הלקוח', success: 'הלקוח נוסף', failure: 'הוספת הלקוח נכשלה' },
    location: { placeholder: 'שם האתר', success: 'האתר נוסף', failure: 'הוספת האתר נכשלה' },
};

// Organization names are unique, and a duplicate is the only 400 that endpoint sends
const ORGANIZATION_ERRORS = { byStatus: { 400: 'כבר קיים ארגון בשם הזה. בחר שם אחר.' } };

interface AddRequest {
    target: AddTarget;
    name: string;
}

const addToHierarchy = async ({ target, name }: AddRequest): Promise<void> => {
    if (target.kind === 'organization') await createOrganization({ name });
    else if (target.kind === 'client') await createClient({ name, organization_id: target.organizationId });
    else await createLocation({ name, client_id: target.clientId });
};

/**
 * Adds an organization, client or location, and refreshes the lists that show it. A new location
 * also refreshes the header's location picker. `error` is the last failure, in Hebrew.
 */
export function useAddToHierarchy() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: addToHierarchy,
        onSuccess: (_result, { target }) => {
            notify.success(ADD_COPY[target.kind].success);
            if (target.kind === 'organization') {
                return queryClient.invalidateQueries({ queryKey: organizationsQuery().queryKey });
            }
            if (target.kind === 'client') {
                return queryClient.invalidateQueries({ queryKey: clientsQuery().queryKey });
            }
            return Promise.all([
                queryClient.invalidateQueries({ queryKey: adminLocationsQuery().queryKey }),
                queryClient.invalidateQueries({ queryKey: allowedLocationsKey }),
            ]);
        },
        onError: (error, { target }) => logError(ADD_COPY[target.kind].failure, error),
    });

    /** Returns true when added, so the form can close. A blank name is ignored. */
    const add = async (target: AddTarget, name: string): Promise<boolean> => {
        const trimmedName = name.trim();
        if (!trimmedName) return false;
        try {
            await mutation.mutateAsync({ target, name: trimmedName });
            return true;
        } catch {
            return false;
        }
    };

    const error = mutation.error
        ? toAppError(mutation.error, mutation.variables?.target.kind === 'organization' ? ORGANIZATION_ERRORS : {}).message
        : null;

    return { add, isAdding: mutation.isPending, error, resetError: mutation.reset };
}
