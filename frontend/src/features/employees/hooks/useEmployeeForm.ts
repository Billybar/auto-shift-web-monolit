// src/features/employees/hooks/useEmployeeForm.ts
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { createEmployee, updateEmployee, updateEmployeeSettings } from '@/api/employees';
import { logError, toAppError } from '@/api/errors';
import { employeesKey } from '@/api/queries';
import { notify } from '@/lib/notify';
import type { Employee, Position } from '@/types';
import { useEmployeeSettingsForm } from './useEmployeeSettingsForm';

export interface EmployeeFormValues {
    firstName: string;
    lastName: string;
    email: string;
    // Set only when creating; an existing employee's password isn't edited here
    password: string;
    notes: string;
    // Hex without '#'
    color: string;
    isActive: boolean;
    yalamId: string;
    mishmarotId: string;
    shiftorgId: string;
    // Active roles only; archived links stay on the server
    positionIds: number[];
    primaryPositionId: number | null;
}

const DEFAULT_COLOR = '3B82F6';

/** The form's values for an employee, or for a new one when `employee` is null. */
export const toFormValues = (employee: Employee | null, activePositions: Position[]): EmployeeFormValues => {
    if (!employee) {
        // A site with one role: the new employee holds it, as they would without roles
        const onlyPosition = activePositions.length === 1 ? activePositions[0].id : null;
        return {
            firstName: '', lastName: '', email: '', password: '', notes: '',
            color: DEFAULT_COLOR, isActive: true,
            yalamId: '', mishmarotId: '', shiftorgId: '',
            positionIds: onlyPosition !== null ? [onlyPosition] : [],
            primaryPositionId: onlyPosition,
        };
    }
    const activeIds = new Set(activePositions.map(p => p.id));
    return {
        firstName: employee.user?.first_name || '',
        lastName: employee.user?.last_name || '',
        email: employee.user?.email || '',
        password: '',
        notes: employee.notes || '',
        color: employee.color,
        isActive: employee.is_active,
        yalamId: employee.yalam_id || '',
        mishmarotId: employee.mishmarot_id || '',
        shiftorgId: employee.shiftorg_id || '',
        positionIds: employee.position_ids.filter(id => activeIds.has(id)),
        primaryPositionId: employee.primary_position_id !== null && activeIds.has(employee.primary_position_id)
            ? employee.primary_position_id
            : null,
    };
};

const optionalId = (value: string) => (value.trim() !== '' ? value.trim() : null);

interface FormErrors {
    // The server rejected the email as already registered (409)
    email: string | null;
    password: string | null;
    // Why the last save failed, when it isn't about a single field
    form: string | null;
}

const NO_ERRORS: FormErrors = { email: null, password: null, form: null };

/**
 * The add / edit employee form: the employee's details and roles, plus (when editing) their shift
 * limits. Re-populated whenever the modal opens or switches employee, so Cancel drops the edits.
 */
export function useEmployeeForm(employee: Employee | null, isOpen: boolean, activePositions: Position[], locationId: number) {
    const queryClient = useQueryClient();
    const [values, setValues] = useState(() => toFormValues(employee, activePositions));
    const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const settings = useEmployeeSettingsForm(employee, isOpen);

    // Done during render (not in an effect) so the previous employee's values never flash on screen
    const [loadedFor, setLoadedFor] = useState({ employee, isOpen, activePositions });
    if (loadedFor.employee !== employee || loadedFor.isOpen !== isOpen || loadedFor.activePositions !== activePositions) {
        setLoadedFor({ employee, isOpen, activePositions });
        setValues(toFormValues(employee, activePositions));
        setErrors(NO_ERRORS);
    }

    const setField = <K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) => {
        setValues(prev => ({ ...prev, [key]: value }));
        // Typing in a field clears its own error
        if (key === 'email' || key === 'password') setErrors(prev => ({ ...prev, [key]: null }));
    };

    /** Validates and saves. Returns true when saved, so the modal can close. */
    const submit = async (): Promise<boolean> => {
        if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim()) return false;
        // Block invalid shift limits before any request is sent, so the employee is never half-updated
        if (employee && settings.validationError) return false;
        if (!employee && !values.password) {
            setErrors(prev => ({ ...prev, password: 'יש להזין סיסמא לעובד חדש' }));
            return false;
        }

        const details = {
            first_name: values.firstName,
            last_name: values.lastName,
            email: values.email,
            notes: values.notes,
            location_id: locationId,
            color: values.color.replace('#', ''),
            is_active: values.isActive,
            yalam_id: optionalId(values.yalamId),
            mishmarot_id: optionalId(values.mishmarotId),
            shiftorg_id: optionalId(values.shiftorgId),
            position_ids: values.positionIds,
            primary_position_id: values.primaryPositionId,
        };

        try {
            setIsSubmitting(true);
            setErrors(prev => ({ ...prev, form: null }));
            if (employee) {
                await updateEmployee(employee.id, details);
                await updateEmployeeSettings(employee.id, settings.values);
            } else {
                await createEmployee({ ...details, password: values.password });
            }
            notify.success(employee ? 'פרטי העובד עודכנו' : 'העובד נוסף');
            void queryClient.invalidateQueries({ queryKey: employeesKey });
            return true;
        } catch (err) {
            logError('Failed to save employee:', err);
            const appError = toAppError(err);
            // The only 409 without a code is the email check; any coded error has its own message
            setErrors(prev => (appError.status === 409 && !appError.code
                ? { ...prev, email: 'כתובת המייל כבר קיימת במערכת' }
                : { ...prev, form: appError.message }));
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    return { values, setField, errors, settings, submit, isSubmitting };
}
