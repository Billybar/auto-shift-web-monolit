// src/features/admin/hooks/useStaffUserForm.ts
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createStaffUser, updateStaffUser } from '@/api/admin';
import { logError, toAppError } from '@/api/errors';
import { staffUsersQuery } from '@/api/queries';
import { notify } from '@/lib/notify';
import { UserRole } from '@/types';
import type { Client, LocationData, StaffRole, StaffUser, StaffUserUpdate } from '@/types';

export const MIN_PASSWORD_LENGTH = 8;

export interface StaffUserFormValues {
    firstName: string;
    lastName: string;
    email: string;
    // Set only when creating; an existing user's password isn't edited here
    password: string;
    role: StaffRole;
    organizationId: number | '';
    clientIds: number[];
    locationIds: number[];
}

const toFormValues = (user: StaffUser | undefined): StaffUserFormValues => ({
    firstName: user?.first_name ?? '',
    lastName: user?.last_name ?? '',
    email: user?.email ?? '',
    password: '',
    // This form edits staff only, so a user's role is always a StaffRole
    role: (user?.role as StaffRole | undefined) ?? UserRole.MANAGER,
    organizationId: user?.organization_id ?? '',
    clientIds: user?.clients.map((client) => client.id) ?? [],
    locationIds: user?.locations.map((location) => location.id) ?? [],
});

const toggleId = (ids: number[], id: number): number[] =>
    ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id];

interface SaveRequest {
    fields: StaffUserUpdate;
    password: string;
}

/**
 * The add / edit staff login form. Managers and schedulers need an organization and a client or
 * location scope; an admin has global access, so the scope is sent empty. Mount it once per user
 * (a `key`), since the values start from the user it is given.
 */
export function useStaffUserForm(user: StaffUser | undefined, clients: Client[], locations: LocationData[]) {
    const queryClient = useQueryClient();
    const isEditMode = user !== undefined;
    const [values, setValues] = useState<StaffUserFormValues>(() => toFormValues(user));
    // Errors found before sending; the server's errors come from the mutation
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [scopeError, setScopeError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: ({ fields, password }: SaveRequest) => isEditMode
            ? updateStaffUser(user.id, fields)
            : createStaffUser({ ...fields, password }),
        onSuccess: () => {
            notify.success(isEditMode ? 'המשתמש עודכן' : 'המשתמש נוסף');
            return queryClient.invalidateQueries({ queryKey: staffUsersQuery().queryKey });
        },
        onError: (error) => logError('Failed to save user:', error),
    });

    const isAdminRole = values.role === UserRole.ADMIN;

    const organizationClients = useMemo(
        () => clients.filter((client) => client.organization_id === values.organizationId),
        [clients, values.organizationId]
    );
    const organizationLocations = useMemo(() => {
        const clientIdsInOrganization = new Set(organizationClients.map((client) => client.id));
        return locations.filter((location) => clientIdsInOrganization.has(location.client_id));
    }, [locations, organizationClients]);

    const serverError = mutation.error ? toAppError(mutation.error) : null;
    const isEmailTaken = serverError?.code === 'email_taken';
    const errors = {
        email: isEmailTaken ? serverError.message : null,
        password: passwordError,
        // Why the last save failed, when it isn't about a single field
        form: scopeError ?? (serverError && !isEmailTaken ? serverError.message : null),
    };

    const setField = <K extends 'firstName' | 'lastName' | 'email' | 'password' | 'role'>(key: K, value: StaffUserFormValues[K]) => {
        setValues(prev => ({ ...prev, [key]: value }));
        // Typing in a field clears its own error
        if (key === 'email' && isEmailTaken) mutation.reset();
        if (key === 'password') setPasswordError(null);
    };

    const changeOrganization = (organizationId: number | '') => {
        // Selections from the previous organization would be refused by the server
        setValues(prev => ({ ...prev, organizationId, clientIds: [], locationIds: [] }));
    };

    const toggleClient = (clientId: number) => {
        setValues(prev => ({ ...prev, clientIds: toggleId(prev.clientIds, clientId) }));
    };

    const toggleLocation = (locationId: number) => {
        setValues(prev => ({ ...prev, locationIds: toggleId(prev.locationIds, locationId) }));
    };

    /** Validates and saves. Returns true when saved, so the modal can close. */
    const submit = async (): Promise<boolean> => {
        if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim()) return false;
        setScopeError(null);
        if (!isEditMode && values.password.length < MIN_PASSWORD_LENGTH) {
            setPasswordError(`הסיסמא חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים`);
            return false;
        }
        if (!isAdminRole && (values.organizationId === '' || (values.clientIds.length === 0 && values.locationIds.length === 0))) {
            setScopeError('יש לבחור ארגון ולפחות לקוח או אתר אחד');
            return false;
        }

        const fields: StaffUserUpdate = {
            first_name: values.firstName.trim(),
            last_name: values.lastName.trim(),
            email: values.email.trim(),
            role: values.role,
            organization_id: isAdminRole || values.organizationId === '' ? null : values.organizationId,
            client_ids: isAdminRole ? [] : values.clientIds,
            location_ids: isAdminRole ? [] : values.locationIds,
        };
        try {
            await mutation.mutateAsync({ fields, password: values.password });
            return true;
        } catch {
            return false;
        }
    };

    return {
        values,
        isEditMode,
        isAdminRole,
        setField,
        changeOrganization,
        toggleClient,
        toggleLocation,
        organizationClients,
        organizationLocations,
        errors,
        submit,
        isSubmitting: mutation.isPending,
    };
}
