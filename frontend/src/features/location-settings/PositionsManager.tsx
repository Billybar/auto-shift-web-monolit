// src/features/location-settings/PositionsManager.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import InlineAlert from '@/components/ui/InlineAlert';
import { Input } from '@/components/ui/Input';
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
                                <IconButton
                                    label={`הזזת ${position.name} למעלה`}
                                    onClick={() => manager.move(index, -1)}
                                    disabled={busyId !== null || index === 0}
                                    className="p-0"
                                >
                                    <ChevronUp size={14} />
                                </IconButton>
                                <IconButton
                                    label={`הזזת ${position.name} למטה`}
                                    onClick={() => manager.move(index, 1)}
                                    disabled={busyId !== null || index === positions.length - 1}
                                    className="p-0"
                                >
                                    <ChevronDown size={14} />
                                </IconButton>
                            </div>
                            <input
                                type="color"
                                value={toCssColor(position.color)}
                                disabled={isBusy}
                                onChange={(e) => manager.recolor(position, e.target.value.substring(1))}
                                aria-label={`צבע ${position.name}`}
                                className="h-7 w-9 cursor-pointer border border-gray-300 rounded"
                            />
                            <Input
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
                                className="w-auto flex-1 min-w-0 border-transparent bg-transparent px-2 py-1 hover:border-gray-300 focus:border-gray-300"
                            />
                            {!position.is_active && (
                                <span className="text-xs text-slate-500 bg-slate-200 rounded-full px-2 py-0.5">בארכיון</span>
                            )}
                            <IconButton
                                label={position.is_active ? 'העברה לארכיון' : 'שחזור מהארכיון'}
                                disabled={isBusy}
                                onClick={() => manager.setArchived(position, position.is_active)}
                            >
                                {position.is_active ? <Archive size={16} /> : <ArchiveRestore size={16} />}
                            </IconButton>
                            <IconButton tone="danger" label="מחיקת התפקיד" disabled={isBusy} onClick={() => handleDelete(position)}>
                                <Trash2 size={16} />
                            </IconButton>
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
                <Input
                    type="text"
                    maxLength={40}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder='שם התפקיד, למשל אחמ"ש'
                    aria-label="שם התפקיד החדש"
                    className="w-auto flex-1 rounded-lg px-3"
                />
                <Button type="submit" loading={busyId === 'new'} disabled={!newName.trim()} className="gap-1">
                    {busyId !== 'new' && <Plus size={16} />}
                    הוספה
                </Button>
            </form>
        </div>
    );
}
