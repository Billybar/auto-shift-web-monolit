// src/features/location-settings/hooks/useConstraintGroupsManager.ts
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mergeConstraintGroups, renameConstraintGroup, splitConstraintGroup } from '@/api/constraintGroups';
import { invalidateLocationShifts } from '@/api/queries';
import { invalidateConstraintViews } from '@/features/constraints/hooks/constraintCaches';
import { notify } from '@/lib/notify';
import type { ShiftDefinition } from '@/types';
import { failureIssue } from './managerIssue';
import type { ManagerIssue } from './managerIssue';
import type { ConstraintGroupRow } from './useConstraintGroups';
import { useDraftNames } from './useDraftNames';

interface MergeRequest {
    target: ConstraintGroupRow;
    source: ConstraintGroupRow;
}

interface SplitRequest {
    row: ConstraintGroupRow;
    shift: ShiftDefinition;
}

/**
 * Renames, merges and splits the rows of a location's constraints board. Each change refreshes the
 * location's shifts and rows; merging and splitting also move submitted constraints, so every cached
 * view of constraints is refreshed too. A failure, or a merge that left constraints behind, shows as
 * `issue` above the list until the next action.
 */
export function useConstraintGroupsManager(locationId: number) {
    const queryClient = useQueryClient();
    const names = useDraftNames();
    const [issue, setIssue] = useState<ManagerIssue | null>(null);

    const refreshRows = () => invalidateLocationShifts(queryClient, locationId);
    const refreshRowsAndConstraints = () => Promise.all([refreshRows(), invalidateConstraintViews(queryClient)]);

    const renameMutation = useMutation({
        mutationFn: ({ groupId, name }: { groupId: number; name: string }) => renameConstraintGroup(groupId, name),
        onSuccess: refreshRows,
    });
    const mergeMutation = useMutation({
        mutationFn: ({ target, source }: MergeRequest) => mergeConstraintGroups(target.groupId, source.groupId),
        onSuccess: refreshRowsAndConstraints,
    });
    const splitMutation = useMutation({
        mutationFn: ({ row, shift }: SplitRequest) => splitConstraintGroup(row.groupId, shift.id),
        onSuccess: refreshRowsAndConstraints,
    });

    /** Saves the row's edited name; an empty name clears it, so the board shows the shift names. */
    const rename = (row: ConstraintGroupRow) =>
        names.commit(row.groupId, row.group.name ?? '', async (name) => {
            setIssue(null);
            try {
                await renameMutation.mutateAsync({ groupId: row.groupId, name });
                return true;
            } catch (error) {
                setIssue(failureIssue('שינוי שם השורה נכשל', error));
                return false;
            }
        }, { allowEmpty: true });

    /** Moves the source row's shifts and constraints into the target row. The caller confirms first. */
    const merge = async (target: ConstraintGroupRow, source: ConstraintGroupRow) => {
        setIssue(null);
        try {
            const result = await mergeMutation.mutateAsync({ target, source });
            if (result.conflicts > 0) {
                setIssue({
                    variant: 'warning',
                    title: 'השורות אוחדו, אך חלק מהאילוצים לא הועברו',
                    message:
                        `${result.conflicts} אילוצים מהשורה "${source.label}" לא הועברו, כי לאותו עובד כבר היה אילוץ ` +
                        `באותו יום בשורה "${target.label}". הם נשמרים כהיסטוריה ואינם משפיעים על השיבוץ.`,
                });
            } else {
                notify.success('השורות אוחדו');
            }
        } catch (error) {
            setIssue(failureIssue('איחוד השורות נכשל', error));
        }
    };

    /** Moves one shift out into a new row. The caller confirms first. */
    const split = async (row: ConstraintGroupRow, shift: ShiftDefinition) => {
        setIssue(null);
        try {
            await splitMutation.mutateAsync({ row, shift });
            notify.success('המשמרת הופרדה לשורה נפרדת');
        } catch (error) {
            setIssue(failureIssue('הפרדת המשמרת נכשלה', error));
        }
    };

    // The row an action is running on
    const busyId: number | null =
        renameMutation.isPending ? renameMutation.variables.groupId
        : mergeMutation.isPending ? mergeMutation.variables.target.groupId
        : splitMutation.isPending ? splitMutation.variables.row.groupId
        : null;

    return {
        issue,
        dismissIssue: () => setIssue(null),
        busyId,
        nameOf: names.nameOf,
        editName: names.edit,
        dropName: names.drop,
        rename,
        merge,
        split,
    };
}
