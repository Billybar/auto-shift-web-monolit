// src/features/location-settings/PositionsManager.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import { createPosition, deletePosition, updatePosition } from '../../api/positions';
import { logError, toAppError } from '../../api/errors';
import InlineAlert from '../../components/ui/InlineAlert';
import { useConfirm } from '../../context/confirmContext';
import { notify } from '../../lib/notify';
import { toCssColor } from '../../lib/color';
import type { Position, PositionUpdate } from '../../types';

const NEW_POSITION_COLOR = '94A3B8';

const withoutKey = (record: Record<number, string>, key: number): Record<number, string> => {
    const next = { ...record };
    delete next[key];
    return next;
};

interface PositionsManagerProps {
    locationId: number;
    // All roles of the location, archived included, in display order
    positions: Position[];
    onChanged: () => Promise<void> | void;
}

// A failed action, shown above the list until the next action
interface ManagerIssue {
    variant: 'error' | 'warning';
    title: string;
    message: string;
    // Offered when a role in use can't be deleted
    archivePosition?: Position;
}

/**
 * Add, rename, recolor, reorder, and archive / restore / delete a location's roles (תפקידים).
 */
export default function PositionsManager({ locationId, positions, onChanged }: PositionsManagerProps) {
    const confirm = useConfirm();
    const [newName, setNewName] = useState<string>('');
    const [newColor, setNewColor] = useState<string>(NEW_POSITION_COLOR);
    const [busyId, setBusyId] = useState<number | 'new' | null>(null);
    const [issue, setIssue] = useState<ManagerIssue | null>(null);
    // Names being edited, keyed by role id (committed on blur / Enter)
    const [draftNames, setDraftNames] = useState<Record<number, string>>({});

    const fail = (error: unknown, title: string) => {
        logError(title, error);
        setIssue({ variant: 'error', title, message: toAppError(error).message });
    };

    const handleAdd = async (e: FormEvent) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) return;
        try {
            setBusyId('new');
            setIssue(null);
            await createPosition({ location_id: locationId, name, color: newColor });
            setNewName('');
            setNewColor(NEW_POSITION_COLOR);
            await onChanged();
            notify.success('התפקיד נוסף');
        } catch (error) {
            fail(error, 'הוספת התפקיד נכשלה');
        } finally {
            setBusyId(null);
        }
    };

    const save = async (position: Position, changes: PositionUpdate, failTitle: string, successTitle?: string) => {
        try {
            setBusyId(position.id);
            setIssue(null);
            await updatePosition(position.id, changes);
            await onChanged();
            if (successTitle) notify.success(successTitle);
            return true;
        } catch (error) {
            fail(error, failTitle);
            return false;
        } finally {
            setBusyId(null);
        }
    };

    const commitName = async (position: Position) => {
        const draft = draftNames[position.id];
        if (draft === undefined) return;
        const name = draft.trim();
        if (!name || name === position.name) {
            setDraftNames(prev => withoutKey(prev, position.id));
            return;
        }
        const saved = await save(position, { name }, 'שינוי שם התפקיד נכשל');
        // On failure the draft stays, so the user can fix it
        if (saved) setDraftNames(prev => withoutKey(prev, position.id));
    };

    // Moves a role one place up or down by renumbering the whole list
    const move = async (index: number, delta: -1 | 1) => {
        const target = index + delta;
        if (target < 0 || target >= positions.length) return;
        const reordered = [...positions];
        [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
        try {
            setBusyId(positions[index].id);
            setIssue(null);
            await Promise.all(
                reordered
                    .map((position, order) => ({ position, order }))
                    .filter(({ position, order }) => position.sort_order !== order)
                    .map(({ position, order }) => updatePosition(position.id, { sort_order: order }))
            );
        } catch (error) {
            fail(error, 'שינוי סדר התפקידים נכשל');
        } finally {
            await onChanged();
            setBusyId(null);
        }
    };

    const handleDelete = async (position: Position) => {
        const confirmed = await confirm({
            title: `למחוק את התפקיד "${position.name}"?`,
            description: 'התפקיד יוסר מכל העובדים ומהתקן. לא ניתן לבטל פעולה זו.',
            confirmText: 'מחיקה',
            tone: 'danger',
        });
        if (!confirmed) return;
        try {
            setBusyId(position.id);
            setIssue(null);
            await deletePosition(position.id);
            await onChanged();
            notify.success('התפקיד נמחק');
        } catch (error) {
            const appError = toAppError(error);
            logError('Failed to delete position:', error);
            if (appError.code === 'position_in_use') {
                setIssue({
                    variant: 'warning',
                    title: 'אי אפשר למחוק את התפקיד',
                    message: 'התפקיד משמש במשמרות קיימות. העברה לארכיון תסתיר אותו מהתקן ומהשיבוץ האוטומטי, וההיסטוריה תישמר.',
                    archivePosition: position,
                });
            } else {
                setIssue({ variant: 'error', title: 'מחיקת התפקיד נכשלה', message: appError.message });
            }
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-4 max-w-2xl">
            <p className="text-sm text-slate-500">
                תפקידים הם העמדות שעובד ממלא במשמרת (למשל אחמ"ש, מאבטח). כל עובד יכול להחזיק כמה תפקידים, וממלא אחד מהם בכל משמרת.
            </p>

            {issue && (
                <InlineAlert
                    variant={issue.variant}
                    title={issue.title}
                    onDismiss={() => setIssue(null)}
                    action={issue.archivePosition ? {
                        label: 'העברה לארכיון',
                        onClick: () => save(issue.archivePosition!, { is_active: false }, 'העברת התפקיד לארכיון נכשלה', 'התפקיד הועבר לארכיון'),
                    } : undefined}
                >
                    {issue.message}
                </InlineAlert>
            )}

            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white">
                {positions.map((position, index) => {
                    const isBusy = busyId === position.id;
                    return (
                        <li key={position.id} className={`flex items-center gap-2 px-3 py-2 ${position.is_active ? '' : 'bg-slate-50'}`}>
                            <div className="flex flex-col">
                                <button
                                    type="button"
                                    onClick={() => move(index, -1)}
                                    disabled={busyId !== null || index === 0}
                                    aria-label={`הזזת ${position.name} למעלה`}
                                    className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                >
                                    <ChevronUp size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => move(index, 1)}
                                    disabled={busyId !== null || index === positions.length - 1}
                                    aria-label={`הזזת ${position.name} למטה`}
                                    className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                >
                                    <ChevronDown size={14} />
                                </button>
                            </div>
                            <input
                                type="color"
                                value={toCssColor(position.color)}
                                disabled={isBusy}
                                onChange={(e) => save(position, { color: e.target.value.substring(1) }, 'שינוי צבע התפקיד נכשל')}
                                aria-label={`צבע ${position.name}`}
                                className="h-7 w-9 cursor-pointer border border-gray-300 rounded"
                            />
                            <input
                                type="text"
                                maxLength={40}
                                value={draftNames[position.id] ?? position.name}
                                disabled={isBusy}
                                onChange={(e) => setDraftNames(prev => ({ ...prev, [position.id]: e.target.value }))}
                                onBlur={() => commitName(position)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); commitName(position); }
                                    if (e.key === 'Escape') setDraftNames(prev => withoutKey(prev, position.id));
                                }}
                                aria-label="שם התפקיד"
                                className="flex-1 min-w-0 border border-transparent hover:border-gray-300 focus:border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            {!position.is_active && (
                                <span className="text-xs text-slate-500 bg-slate-200 rounded-full px-2 py-0.5">בארכיון</span>
                            )}
                            <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => position.is_active
                                    ? save(position, { is_active: false }, 'העברת התפקיד לארכיון נכשלה', 'התפקיד הועבר לארכיון')
                                    : save(position, { is_active: true }, 'שחזור התפקיד נכשל', 'התפקיד שוחזר')}
                                title={position.is_active ? 'העברה לארכיון' : 'שחזור מהארכיון'}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition disabled:opacity-50"
                            >
                                {position.is_active ? <Archive size={16} /> : <ArchiveRestore size={16} />}
                            </button>
                            <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDelete(position)}
                                title="מחיקת התפקיד"
                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition disabled:opacity-50"
                            >
                                <Trash2 size={16} />
                            </button>
                        </li>
                    );
                })}
                {positions.length === 0 && (
                    <li className="px-3 py-4 text-sm text-slate-500 text-center">עדיין לא הוגדרו תפקידים</li>
                )}
            </ul>

            <form onSubmit={handleAdd} className="flex items-center gap-2">
                <input
                    type="color"
                    value={toCssColor(newColor)}
                    onChange={(e) => setNewColor(e.target.value.substring(1))}
                    aria-label="צבע התפקיד החדש"
                    className="h-9 w-10 cursor-pointer border border-gray-300 rounded"
                />
                <input
                    type="text"
                    maxLength={40}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder='שם התפקיד, למשל אחמ"ש'
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
                <button
                    type="submit"
                    disabled={!newName.trim() || busyId === 'new'}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                    <Plus size={16} />
                    הוספה
                </button>
            </form>
        </div>
    );
}
