// src/features/schedule/components/ShiftEditMenu.tsx
import { DropdownMenu } from 'radix-ui';
import { Minus, Plus, Pencil } from 'lucide-react';

import IconButton from '@/components/ui/IconButton';

// The edit menu of one shift + role group (add / remove an extra row)
export default function ShiftEditMenu({
    canRemove,
    onAddRow,
    onRemoveRow
}: {
    // The group has an extra empty row that can be removed
    canRemove: boolean,
    onAddRow: () => void,
    onRemoveRow: () => void
}) {
    // Portaled to <body>: inside the sticky label cell the menu was trapped in the cell's stacking
    // context, so the next rows' sticky cells painted over it and the scroll container clipped it
    return (
        <DropdownMenu.Root dir="rtl" modal={false}>
            <DropdownMenu.Trigger asChild>
                <IconButton
                    label="עריכת משמרת"
                    size="sm"
                    className="data-[state=open]:bg-slate-200 data-[state=open]:text-slate-700"
                >
                    <Pencil size={14} />
                </IconButton>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="start"
                    sideOffset={4}
                    collisionPadding={8}
                    className="z-50 min-w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
                >
                    <DropdownMenu.Item
                        onSelect={onAddRow}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 outline-none cursor-pointer data-[highlighted]:bg-slate-100 transition-colors whitespace-nowrap"
                    >
                        <Plus size={14} /> הוסף שורה
                    </DropdownMenu.Item>
                    {canRemove && (
                        <DropdownMenu.Item
                            onSelect={onRemoveRow}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 outline-none cursor-pointer data-[highlighted]:bg-red-50 transition-colors whitespace-nowrap"
                        >
                            <Minus size={14} /> הסר שורה ריקה
                        </DropdownMenu.Item>
                    )}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
