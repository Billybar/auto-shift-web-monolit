// src/features/schedule/components/HoursBox.tsx
import { useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';

// The hours strip of a board chip: shows the hours (custom ones highlighted) and edits them on click
export default function HoursBox({
    assignmentStartTime,
    assignmentEndTime,
    defaultStartTime,
    defaultEndTime,
    onSave
}: {
    assignmentStartTime?: string | null,
    assignmentEndTime?: string | null,
    defaultStartTime: string,
    defaultEndTime: string,
    onSave: (start: string, end: string) => void
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [startInput, setStartInput] = useState(assignmentStartTime || defaultStartTime);
    const [endInput, setEndInput] = useState(assignmentEndTime || defaultEndTime);

    const isStartChanged = assignmentStartTime && assignmentStartTime !== defaultStartTime;
    const isEndChanged = assignmentEndTime && assignmentEndTime !== defaultEndTime;

    const displayStart = assignmentStartTime || defaultStartTime;
    const displayEnd = assignmentEndTime || defaultEndTime;

    const handleClick = (e: MouseEvent) => {
        e.stopPropagation(); // prevent drag or other interactions
        setIsEditing(true);
    };

    const handleSave = () => {
        setIsEditing(false);
        // Only save if there's a valid change
        if (startInput !== (assignmentStartTime || defaultStartTime) || endInput !== (assignmentEndTime || defaultEndTime)) {
            onSave(startInput, endInput);
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setStartInput(assignmentStartTime || defaultStartTime);
            setEndInput(assignmentEndTime || defaultEndTime);
        }
    };

    if (isEditing) {
        return (
            <div
                className="h-5 flex-none flex items-center justify-center gap-1 bg-stone-200 text-black w-full shadow-inner z-20"
                onClick={e => e.stopPropagation()} // prevent drag
                onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        handleSave();
                    }
                }}
                dir="ltr"
            >
                <input
                    type="time"
                    value={startInput}
                    onChange={e => setStartInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    className="w-16 text-xs p-0 border border-gray-300 rounded text-center bg-white h-5 outline-none focus:border-blue-400"
                />
                <span className="text-xs leading-none text-slate-500">-</span>
                <input
                    type="time"
                    value={endInput}
                    onChange={e => setEndInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-16 text-xs p-0 border border-gray-300 rounded text-center bg-white h-5 outline-none focus:border-blue-400"
                />
            </div>
        );
    }

    return (
        <div
            onClick={handleClick}
            className="h-5 flex-none flex items-center justify-center gap-1 bg-stone-200 text-stone-400 w-full cursor-pointer hover:bg-stone-300 transition"
            title="לחץ לעריכת שעות"
            dir="ltr"
        >
            <span className={`text-xs leading-none px-1.5 py-0.5 ${isStartChanged ? 'bg-blue-500 text-white rounded' : ''}`}>
                {displayStart}
            </span>
            <span className="text-xs leading-none text-slate-400">-</span>
            <span className={`text-xs leading-none px-1.5 py-0.5 ${isEndChanged ? 'bg-blue-500 text-white rounded' : ''}`}>
                {displayEnd}
            </span>
        </div>
    );
}
