// src/features/constraints/components/ConstraintsGrid.tsx
import type { ConstraintType } from '../../../types';
import type { BoardRow } from '../hooks/boardRows';

export interface GridColumn {
    key: string;
    title: string;
    subtitle?: string;
}

interface ConstraintsGridProps {
    columns: GridColumn[];
    rows: BoardRow[];
    isLoading: boolean;
    isLoadingShifts: boolean;
    getType: (columnKey: string, groupId: number) => ConstraintType | undefined;
    onToggle: (columnKey: string, groupId: number) => void;
}

const CELL_DISPLAY: Record<ConstraintType | 'free', { label: string; classes: string }> = {
    free: { label: 'פנוי', classes: 'bg-white text-gray-400 hover:bg-gray-100' },
    cannot_work: { label: 'X לא יכול', classes: 'bg-red-100 text-red-700 border-red-300 font-bold' },
    must_work: { label: 'V חייב', classes: 'bg-green-100 text-green-700 border-green-300 font-bold' },
    prefer_to: { label: '♥ מעדיף', classes: 'bg-blue-100 text-blue-700 border-blue-300 font-bold' },
};

/**
 * The constraints board: one row per board row (group), one column per day. Used for a week
 * (columns are dates) and for the default week (columns are days of the week).
 */
export default function ConstraintsGrid({
    columns,
    rows,
    isLoading,
    isLoadingShifts,
    getType,
    onToggle,
}: ConstraintsGridProps) {
    const isOverlayLoading = isLoading || isLoadingShifts;

    return (
        /* Natural height so rows never collapse; scrolls horizontally on narrow screens */
        <div className="overflow-x-auto border border-gray-300 rounded-xl mb-4 shadow-sm relative">
            {isOverlayLoading && (
                <div className="absolute inset-0 bg-white/70 flex justify-center items-center z-10 backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
            )}

            <table className="w-full text-center table-fixed border-collapse min-w-[700px]">
                <thead className="bg-slate-800 text-white">
                    <tr>
                        <th className="w-24 p-3 border border-slate-700 font-semibold">משמרת</th>
                        {columns.map((column) => (
                            <th key={column.key} className="p-2 border border-slate-700 font-medium">
                                <div className="text-sm">{column.title}</div>
                                {column.subtitle && (
                                    <div className="text-xs text-slate-300 font-light">{column.subtitle}</div>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 && !isLoadingShifts ? (
                        <tr>
                            <td colSpan={columns.length + 1} className="p-8 text-center text-gray-500">
                                לא הוגדרו משמרות לסניף זה.
                            </td>
                        </tr>
                    ) : (
                        rows.map((row) => (
                            <tr key={row.groupId}>
                                <td className="p-2 bg-slate-100 font-bold text-slate-700 border border-gray-300">
                                    <div>{row.label}</div>
                                    <div className="text-xs text-slate-500 font-normal mt-0.5">{row.hours}</div>
                                </td>
                                {columns.map((column) => {
                                    const cell = CELL_DISPLAY[getType(column.key, row.groupId) ?? 'free'];
                                    return (
                                        <td key={`${column.key}-${row.groupId}`} className="border border-gray-300 p-1 bg-gray-50">
                                            <button
                                                onClick={() => onToggle(column.key, row.groupId)}
                                                disabled={isOverlayLoading}
                                                className={`w-full h-12 rounded flex items-center justify-center transition border border-transparent select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${cell.classes}`}
                                            >
                                                {cell.label}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
