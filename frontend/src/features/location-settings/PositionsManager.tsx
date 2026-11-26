// src/features/location-settings/PositionsManager.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import Button from '@/components/ui/Button';
import InlineAlert from '@/components/ui/InlineAlert';
import { useConfirm } from '@/context/confirmContext';
import { toCssColor } from '@/lib/color';
import type { Position } from '@/types';
import { usePositionsManager } from './hooks/usePositionsManager';

const NEW_POSITION_COLOR = '94A3B8';

interface PositionsManagerProps {
    locationId: number;
    // All roles of the location, archived included, in display order
    positions: Position[];
}

/**
 * Add, rename, recolor, reorder, and archive / restore / delete a location's roles (תפקידים).
 */
export default function PositionsManager({ locationId, positions }: PositionsManagerProps) {
    const confirm = useConfirm();
    const manager = usePositionsManager(locationId, positions);
    const { issue, busyId } = manager;
    const [newName, setNewName] = useState<string>('');
    const [newColor, setNewColor] = useState<string>(NEW_POSITION_COLOR);

    const handleAdd = async (e: FormEvent) => {
        e.preventDefault();
        if (await manager.add(newName, newColor)) {
            setNewName('');
            setNewColor(NEW_POSITION_COLOR);
        }
    };

    const handleDelete = async (position: Position) => {
        const confirmed = await confirm({
            title: `למחוק את התפקיד "${position.name}"?`,
            description: 'התפקיד יוסר מכל העובדים ומהתקן. לא ניתן לבטל פעולה זו.',
            confirmText: 'מחיקה',
            tone: 'danger',
        });
        if (confirmed) await manager.remove(position);
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
                    onDismiss={manager.dismissIssue}
                    action={issue.archivePosition ? {
                        label: 'העברה לארכיון',
                        onClick: () => manager.setArchived(issue.archivePosition!, true),
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
                                    onClick={() => manager.move(index, -1)}
                                    disabled={busyId !== null || index === 0}
                                    aria-label={`הזזת ${position.name} למעלה`}
                                    className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                >
                                    <ChevronUp size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => manager.move(index, 1)}
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
                                onChange={(e) => manager.recolor(position, e.target.value.substring(1))}
                                aria-label={`צבע ${position.name}`}
                                className="h-7 w-9 cursor-pointer border border-gray-300 rounded"
                            />
                            <input
                                type="text"
                                maxLength={40}
                                value={manager.nameOf(position.id, position.name)}
                                disabled={isBusy}
                                onChange={(e) => manager.editName(position.id, e.target.value)}
                                onBlur={() => manager.rename(position)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); manager.rename(position); }
                                    if (e.key === 'Escape') manager.dropName(position.id);
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
                                onClick={() => manager.setArchived(position, position.is_active)}
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
                <Button type="submit" loading={busyId === 'new'} disabled={!newName.trim()} className="gap-1">
                    {busyId !== 'new' && <Plus size={16} />}
                    הוספה
                </Button>
            </form>
        </div>
    );
}
