// src/features/location-settings/ConstraintGroupsManager.tsx
import { Unlink } from 'lucide-react';

import InlineAlert from '@/components/ui/InlineAlert';
import Spinner from '@/components/ui/Spinner';
import { useConfirm } from '@/context/confirmContext';
import type { ShiftDefinition } from '@/types';
import { useConstraintGroups } from './hooks/useConstraintGroups';
import type { ConstraintGroupRow } from './hooks/useConstraintGroups';
import { useConstraintGroupsManager } from './hooks/useConstraintGroupsManager';

interface ConstraintGroupsManagerProps {
    locationId: number;
}

/**
 * The rows of the constraints board (שורות בלוח האילוצים): merge shifts that employees should
 * mark together into one row, split them apart again, and name the rows.
 */
export default function ConstraintGroupsManager({ locationId }: ConstraintGroupsManagerProps) {
    const confirm = useConfirm();
    const { rows, isLoading, loadError, reload } = useConstraintGroups(locationId);
    const manager = useConstraintGroupsManager(locationId);
    const { issue, busyId } = manager;

    const handleMerge = async (target: ConstraintGroupRow, sourceGroupId: number) => {
        const source = rows.find(r => r.groupId === sourceGroupId);
        if (!source) return;
        const confirmed = await confirm({
            title: `לאחד את "${source.label}" לתוך "${target.label}"?`,
            description:
                `העובדים יסמנו את המשמרות של שתי השורות בשורה אחת. אילוצים שכבר הוגשו בשורה "${source.label}" ` +
                `יעברו לשורה המאוחדת. ביום שבו לעובד יש אילוץ בשתי השורות, יישמר האילוץ של "${target.label}".`,
            confirmText: 'איחוד',
        });
        if (confirmed) await manager.merge(target, source);
    };

    const handleSplit = async (row: ConstraintGroupRow, shift: ShiftDefinition) => {
        const confirmed = await confirm({
            title: `להפריד את "${shift.name}" לשורה נפרדת?`,
            description: 'השורה החדשה תקבל עותק של האילוצים שכבר הוגשו בשורה הזו, כך שאף אילוץ לא יאבד.',
            confirmText: 'הפרדה',
        });
        if (confirmed) await manager.split(row, shift);
    };

    if (isLoading && rows.length === 0) {
        return (
            <div className="flex justify-center py-8">
                <Spinner size="sm" />
            </div>
        );
    }

    if (loadError) {
        return (
            <InlineAlert variant="error" title="טעינת שורות הלוח נכשלה" action={{ label: 'נסה שוב', onClick: reload }}>
                {loadError.message}
            </InlineAlert>
        );
    }

    return (
        <div className="space-y-4 max-w-2xl">
            <p className="text-sm text-slate-500">
                כל שורה בלוח האילוצים מייצגת משמרת אחת או יותר. אחדו משמרות שהעובדים צריכים לסמן יחד (למשל שתי משמרות בוקר
                באותן שעות): "לא יכול" בשורה חוסם את כל המשמרות שבה, ו"חייב" משבץ את העובד באחת מהן.
            </p>

            {issue && (
                <InlineAlert variant={issue.variant} title={issue.title} onDismiss={manager.dismissIssue}>
                    {issue.message}
                </InlineAlert>
            )}

            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white">
                {rows.map(row => {
                    const isBusy = busyId === row.groupId;
                    const others = rows.filter(r => r.groupId !== row.groupId);
                    return (
                        <li key={row.groupId} className="px-3 py-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    maxLength={40}
                                    value={manager.nameOf(row.groupId, row.group.name ?? '')}
                                    placeholder={row.shifts.map(s => s.name).join(' / ')}
                                    disabled={isBusy}
                                    onChange={(e) => manager.editName(row.groupId, e.target.value)}
                                    onBlur={() => manager.rename(row)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); manager.rename(row); }
                                        if (e.key === 'Escape') manager.dropName(row.groupId);
                                    }}
                                    aria-label="שם השורה"
                                    className="flex-1 min-w-0 border border-transparent hover:border-gray-300 focus:border-gray-300 rounded px-2 py-1 text-sm font-medium focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-xs text-slate-500 shrink-0">{row.hours}</span>
                                {others.length > 0 && (
                                    <select
                                        value=""
                                        disabled={busyId !== null}
                                        onChange={(e) => { if (e.target.value) handleMerge(row, Number(e.target.value)); }}
                                        aria-label={`איחוד שורה אחרת לתוך ${row.label}`}
                                        className="shrink-0 border border-gray-300 rounded-lg px-2 py-1 text-sm text-slate-600 bg-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                    >
                                        <option value="">איחוד עם…</option>
                                        {others.map(other => (
                                            <option key={other.groupId} value={other.groupId}>
                                                {other.label} ({other.hours})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 ps-2">
                                {row.shifts.map(shift => (
                                    <span
                                        key={shift.id}
                                        className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded-full px-2.5 py-1"
                                    >
                                        {shift.name} · {shift.start_time} - {shift.end_time}
                                        {row.shifts.length > 1 && (
                                            <button
                                                type="button"
                                                disabled={busyId !== null}
                                                onClick={() => handleSplit(row, shift)}
                                                title="הפרדה לשורה נפרדת"
                                                aria-label={`הפרדת ${shift.name} לשורה נפרדת`}
                                                className="p-0.5 text-slate-500 hover:text-slate-800 rounded transition disabled:opacity-50"
                                            >
                                                <Unlink size={12} />
                                            </button>
                                        )}
                                    </span>
                                ))}
                            </div>
                        </li>
                    );
                })}
                {rows.length === 0 && (
                    <li className="px-3 py-4 text-sm text-slate-500 text-center">עדיין לא הוגדרו משמרות לאתר זה</li>
                )}
            </ul>
        </div>
    );
}
