// src/features/location-settings/hooks/usePositionsManager.ts
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { logError, toAppError } from '@/api/errors';
import { createPosition, deletePosition, updatePosition } from '@/api/positions';
import { demandTemplateQuery, employeesKey, positionsQuery } from '@/api/queries';
import { notify } from '@/lib/notify';
import type { Position, PositionUpdate } from '@/types';
import { failureIssue } from './managerIssue';
import type { ManagerIssue } from './managerIssue';
import { reorderUpdates } from './positionOrder';
import type { SortOrderUpdate } from './positionOrder';
import { useDraftNames } from './useDraftNames';

interface UpdateRequest {
    position: Position;
    changes: PositionUpdate;
}

interface ReorderRequest {
    // The role the user moved, shown as busy
    movedId: number;
    updates: SortOrderUpdate[];
}

/**
 * Adds, renames, recolors, reorders, archives / restores and deletes a location's roles.
 * Every change refreshes the roles; a delete also refreshes the employees and the demand template,
 * since the role is removed from both. A failure shows as `issue` above the list until the next action.
 */
export function usePositionsManager(locationId: number, positions: Position[]) {
    const queryClient = useQueryClient();
    const names = useDraftNames();
    const [issue, setIssue] = useState<ManagerIssue | null>(null);

    const refreshPositions = () => queryClient.invalidateQueries({ queryKey: positionsQuery(locationId).queryKey });

    const addMutation = useMutation({
        mutationFn: (fields: { name: string; color: string }) => createPosition({ location_id: locationId, ...fields }),
        onSuccess: refreshPositions,
    });
    const updateMutation = useMutation({
        mutationFn: ({ position, changes }: UpdateRequest) => updatePosition(position.id, changes),
        onSuccess: refreshPositions,
    });
    const reorderMutation = useMutation({
        mutationFn: ({ updates }: ReorderRequest) =>
            Promise.all(updates.map(({ positionId, sortOrder }) => updatePosition(positionId, { sort_order: sortOrder }))),
        // Some updates may have landed before one failed, so refresh either way
        onSettled: refreshPositions,
    });
    const deleteMutation = useMutation({
        mutationFn: (position: Position) => deletePosition(position.id),
        onSuccess: () => Promise.all([
            refreshPositions(),
            queryClient.invalidateQueries({ queryKey: employeesKey }),
            queryClient.invalidateQueries({ queryKey: demandTemplateQuery(locationId).queryKey }),
        ]),
    });

    /** Runs an action; on failure logs it and shows it as the issue. Returns true when it succeeded. */
    const attempt = async (failTitle: string, action: () => Promise<unknown>): Promise<boolean> => {
        setIssue(null);
        try {
            await action();
            return true;
        } catch (error) {
            setIssue(failureIssue(failTitle, error));
            return false;
        }
    };

    const update = (position: Position, changes: PositionUpdate, failTitle: string, successTitle?: string) =>
        attempt(failTitle, async () => {
            await updateMutation.mutateAsync({ position, changes });
            if (successTitle) notify.success(successTitle);
        });

    /** Returns true when added, so the add form can clear. A blank name is ignored. */
    const add = (name: string, color: string): Promise<boolean> => {
        const trimmedName = name.trim();
        if (!trimmedName) return Promise.resolve(false);
        return attempt('הוספת התפקיד נכשלה', async () => {
            await addMutation.mutateAsync({ name: trimmedName, color });
            notify.success('התפקיד נוסף');
        });
    };

    const rename = (position: Position) =>
        names.commit(position.id, position.name, (name) => update(position, { name }, 'שינוי שם התפקיד נכשל'));

    /** `color` is hex without '#'. */
    const recolor = (position: Position, color: string) =>
        update(position, { color }, 'שינוי צבע התפקיד נכשל');

    const setArchived = (position: Position, archived: boolean) => archived
        ? update(position, { is_active: false }, 'העברת התפקיד לארכיון נכשלה', 'התפקיד הועבר לארכיון')
        : update(position, { is_active: true }, 'שחזור התפקיד נכשל', 'התפקיד שוחזר');

    /** Moves the role at `index` one place up (-1) or down (1). */
    const move = async (index: number, delta: -1 | 1) => {
        const updates = reorderUpdates(positions, index, delta);
        if (!updates) return;
        await attempt('שינוי סדר התפקידים נכשל', () => reorderMutation.mutateAsync({ movedId: positions[index].id, updates }));
    };

    /** The caller confirms first. A role in use can't be deleted: the issue then offers to archive it. */
    const remove = async (position: Position) => {
        setIssue(null);
        try {
            await deleteMutation.mutateAsync(position);
            notify.success('התפקיד נמחק');
        } catch (error) {
            logError('Failed to delete position:', error);
            const appError = toAppError(error);
            setIssue(appError.code === 'position_in_use'
                ? {
                    variant: 'warning',
                    title: 'אי אפשר למחוק את התפקיד',
                    message: 'התפקיד משמש במשמרות קיימות. העברה לארכיון תסתיר אותו מהתקן ומהשיבוץ האוטומטי, וההיסטוריה תישמר.',
                    archivePosition: position,
                }
                : { variant: 'error', title: 'מחיקת התפקיד נכשלה', message: appError.message });
        }
    };

    // The row an action is running on ('new' for the add form)
    const busyId: number | 'new' | null =
        addMutation.isPending ? 'new'
        : updateMutation.isPending ? updateMutation.variables.position.id
        : reorderMutation.isPending ? reorderMutation.variables.movedId
        : deleteMutation.isPending ? deleteMutation.variables.id
        : null;

    return {
        issue,
        dismissIssue: () => setIssue(null),
        busyId,
        nameOf: names.nameOf,
        editName: names.edit,
        dropName: names.drop,
        add,
        rename,
        recolor,
        setArchived,
        move,
        remove,
    };
}
