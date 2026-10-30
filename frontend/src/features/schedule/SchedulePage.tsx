// frontend/src/features/schedule/SchedulePage.tsx
import React, { useState, useEffect } from 'react';
import { Settings, Play, Save, ChevronLeft, ChevronRight, Send, EyeOff, ShieldCheck } from 'lucide-react';

import { getLocationWeights, updateLocationWeights } from '../../api/locations';
import { getAssignments, generateAutoSchedule, saveAssignments } from '../../api/assignments';
import { getShiftDefinitions } from '../../api/shiftDefinitions';
import { getEmployeesByLocation } from '../../api/employees';
import { getPositions } from '../../api/positions';
import { logError, toAppError } from '../../api/errors';
import type { AppError } from '../../api/errors';
import { notify } from '../../lib/notify';
import InlineAlert from '../../components/ui/InlineAlert';

import { useWeeklyDemand } from './hooks/useWeeklyDemand';
import { useSchedulePublication } from './hooks/useSchedulePublication';
import { useScheduleCheck } from './hooks/useScheduleCheck';
import { formatDayLabel, makeNameLookups } from './hooks/scheduleLabels';
import { addToSlot, moveToSlot, removePlacement, replaceInSlot, setPlacementHours, swapPlacements } from './hooks/scheduleEdits';
import type { Placement } from './hooks/scheduleEdits';
import EmployeeSidebar from './EmployeeSidebar';
import ScheduleGrid from './ScheduleGrid';
import type { DragPayload, SlotTarget } from './ScheduleGrid';
import EmployeeSettingsModal from '../employees/EmployeeSettingsModal';
import OptimizationWeightsModal from './OptimizationWeightsModal';
import type { AutoScheduleResult, ShiftDefinition, LocationWeights, Assignment, Employee, Position } from '../../types';
import { UserRole } from '../../types/index';
import { useAuth } from '../../context/AuthContext';
import { useAppLocation } from '../../context/LocationContext';
import { useConfirm } from '../../context/confirmContext';

// Shown when the solver finds no schedule that satisfies every hard rule (see ConstraintManager).
// Missing people no longer fail the run: those slots come back empty and are listed instead.
const INFEASIBLE_CAUSES = [
    'אילוצי "חייב" שמתנגשים זה בזה או עם כללי המנוחה (פחות מ-8 שעות בין משמרות, למשל לילה ולמחרת בוקר), או שתי משמרות באותו יום',
    'מינימום משמרות שבועי של עובד שלא מתיישב עם האילוצים שלו (למשל רצף של 7 ימי עבודה)',
    'מקסימום משמרות שבועי שנמוך ממספר אילוצי "חייב" של העובד',
];

// Outcome of the last auto-assign run that needs explaining; shown above the grid until dismissed
interface EngineIssue {
    variant: 'error' | 'warning' | 'info';
    title: string;
    message: string;
    items?: string[];
}

const getNextSunday = (): Date => {
    const today = new Date();
    const daysUntilSunday = 7 - today.getDay();
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysUntilSunday);
    nextSunday.setHours(0, 0, 0, 0);
    return nextSunday;
};

const generateWeekDates = (startDate: Date): Date[] => {
    return Array.from({ length: 7 }).map((_, index) => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + index);
        return date;
    });
};

// Helper to format Date to YYYY-MM-DD for backend comparison
const formatDateStr = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function SchedulePage() {
    // --- Auth State ---
    const { user } = useAuth();
    // Check if the current user is restricted to employee view only
    const isEmployee = user?.role === UserRole.EMPLOYEE;
    
    // --- Location State ---
    const { selectedLocationId } = useAppLocation();

    const confirm = useConfirm();

    // --- Data States ---
    const [shiftDefinitions, setShiftDefinitions] = useState<ShiftDefinition[]>([]);
    // All roles of the location, archived ones included (they label past assignments)
    const [positions, setPositions] = useState<Position[]>([]);
    // -- Emplotee State ---
    const [employeesMap, setEmployeesMap] = useState<Record<number, Employee>>({});

    // --- Assignments State ---
    const [assignments, setAssignments] = useState<Assignment[]>([]);

    // --- Date States ---
    // setWeekStart and used lazy initialization to avoid calling getNextSunday on every render
    const [weekStart, setWeekStart] = useState<Date>(getNextSunday);
    const weekDates = generateWeekDates(weekStart);

    const startDateStrForHook = formatDateStr(weekDates[0]);
    
    // Use hooks to fetch weekly demand and publication status
    const { demandMap, isLoading: isDemandLoading, loadError: demandError, reload: reloadDemand, pendingCells, changeSlots } = useWeeklyDemand(selectedLocationId || null, startDateStrForHook);
    const { isPublished, isLoading: isPubLoading, loadError: publicationError, reload: reloadPublication, isUpdating, setPublished } = useSchedulePublication(selectedLocationId || null, startDateStrForHook);

    // Week Navigation Handlers ---
    const handlePrevWeek = () => {
        setWeekStart((prevDate) => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() - 7);
            return newDate;
        });
    };

    const handleNextWeek = () => {
        setWeekStart((prevDate) => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() + 7);
            return newDate;
        });
    };

    // --- UI States ---
    const [loading, setLoading] = useState<boolean>(true);
    // Set when the board couldn't be loaded; the page then shows an error state instead of the grid
    const [boardError, setBoardError] = useState<AppError | null>(null);
    const [engineIssue, setEngineIssue] = useState<EngineIssue | null>(null);
    const [weightsError, setWeightsError] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState<boolean>(false); // Track engine status
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [employeeSearchTerm, setEmployeeSearchTerm] = useState<string>('');
    const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState<boolean>(false);
    const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);

    // --- Modal & Weights States ---
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false); 
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    
    // Null until loaded for the selected location, so the form never shows or saves values that aren't the real ones
    const [weights, setWeights] = useState<LocationWeights | null>(null);

    const names = makeNameLookups(shiftDefinitions, positions, employeesMap);
    // The last schedule check; dropped by any edit, week change or location change
    const scheduleCheck = useScheduleCheck(selectedLocationId || null, startDateStrForHook, assignments, names);

    const fetchBoardStructure = async () => {
        // Prevent fetching if no location is selected
        if (!selectedLocationId) return;

        try {
            setLoading(true);
            setBoardError(null);
            setEngineIssue(null);
            // Drop the previous week's / location's data, so a failed load can never save it here
            // (Smart Sync deletes whatever the payload is missing)
            setWeights(null);
            setShiftDefinitions([]);
            setPositions([]);
            setAssignments([]);
            setEmployeesMap({});

            const startDateStr = formatDateStr(weekDates[0]);
            const endDateStr = formatDateStr(weekDates[6]);

            // 1. Fetch structure, roles, assignments, AND EMPLOYEES simultaneously
            // (the week's demand comes from useWeeklyDemand)
            const [shiftsData, positionsData, weightsData, boardAssignments, employeesData] = await Promise.all([
                getShiftDefinitions(selectedLocationId),
                getPositions(selectedLocationId, true),
                getLocationWeights(selectedLocationId),
                getAssignments(selectedLocationId, startDateStr, endDateStr),
                getEmployeesByLocation(selectedLocationId)
            ]);

            // 2. orgenize emp dict by ID
            const empMap: Record<number, Employee> = {};
            employeesData.forEach(emp => {
                empMap[emp.id] = emp;
            });

            // 3. Update States
            setShiftDefinitions(shiftsData);
            setPositions(positionsData);
            setWeights(weightsData);
            setAssignments(boardAssignments); // Load existing assignments
            setEmployeesMap(empMap);


        } catch (error) {
            logError("Failed to fetch board structure:", error);
            setBoardError(toAppError(error));
        } finally {
            setLoading(false);
        }
    };

    // Retry for the error state: reload everything the board is built from
    const reloadBoard = () => {
        fetchBoardStructure();
        reloadDemand();
        reloadPublication();
    };

    // Lightweight refresh of employees only (keeps unsaved assignments and the selected location)
    const refreshEmployees = async () => {
        if (!selectedLocationId) return;

        try {
            const employeesData = await getEmployeesByLocation(selectedLocationId);
            const empMap: Record<number, Employee> = {};
            employeesData.forEach(emp => {
                empMap[emp.id] = emp;
            });
            setEmployeesMap(empMap);
        } catch (error) {
            notify.error(error, "רענון רשימת העובדים נכשל");
        }
    };

    useEffect(() => {
        fetchBoardStructure();
        // Re-fetch data whenever weekStart or the selected location changes
    }, [weekStart, selectedLocationId]);

    // --- Optimization Weights Modal ---
    const openWeightsModal = () => {
        setWeightsError(null);
        setIsSettingsOpen(true);
    };

    // --- Handle Form Submit ---
    const handleSaveWeights = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedLocationId || !weights) return;
        try {
            setIsSubmitting(true);
            setWeightsError(null);
            const updatedWeights = await updateLocationWeights(selectedLocationId, weights);
            setWeights(updatedWeights);
            setIsSettingsOpen(false);
            notify.success("משקלי השיבוץ נשמרו");
        } catch (error) {
            // The modal stays open, so the reason is shown inside it
            logError("Failed to update weights:", error);
            setWeightsError(toAppError(error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Explains the gaps and the inputs the engine set aside, by role and day
    const describeEngineResult = (response: AutoScheduleResult): string[] => {
        const { shiftName, positionName, employeeName } = names;

        const gaps = response.unfilled_slots.map(slot =>
            `${formatDayLabel(slot.date)} · ${shiftName(slot.shift_id)} · ${positionName(slot.position_id)}: חסרים ${slot.missing}`
        );
        const warnings = response.warnings.map(warning => {
            switch (warning.code) {
                case 'employee_skipped_no_positions':
                    return `${employeeName(warning.employee_id)}: אין תפקיד פעיל, ולכן לא שובץ`;
                case 'must_work_ignored':
                    return `${employeeName(warning.employee_id)}: אילוץ "חייב" ב${formatDayLabel(warning.date)} (${shiftName(warning.shift_id)}) לא נלקח בחשבון, כי המשמרת לא צריכה אף תפקיד שלו`;
                case 'min_shifts_lowered':
                    return `${employeeName(warning.employee_id)}: מינימום המשמרות הורד מ-${warning.requested} ל-${warning.applied}, כי אין לו מספיק ימים זמינים`;
            }
        });
        return [...gaps, ...warnings];
    };

    const handleAutoAssign = async () => {
        if (!selectedLocationId) return;

        // Nothing to fill: point to the weekly template instead of running the engine
        if (!Object.values(demandMap).some(cell => cell.required_employees > 0)) {
            setEngineIssue({
                variant: 'info',
                title: 'לא הוגדר תקן לשבוע זה',
                message: 'הגדר כמה עובדים נדרשים בכל משמרת ובכל תפקיד בהגדרות אתר ← "תקן שבועי", או הוסף עמדות ישירות בלוח.',
            });
            return;
        }

        try {
            setIsGenerating(true);
            setEngineIssue(null);
            const startDateStr = formatDateStr(weekDates[0]);

            // 1. Tell backend to run the solver and GET the draft result
            const response = await generateAutoSchedule(selectedLocationId, startDateStr);

            // If FAILED, keep the current board assignments and explain why (don't set to [])
            if (response.status === "FAILED") {
                setEngineIssue(response.failure_reason === 'time_limit'
                    ? {
                        variant: 'error',
                        title: "לא נמצא שיבוץ בזמן",
                        message: "המנוע לא הספיק למצוא שיבוץ בזמן שהוקצב לו. נסה שוב, או הקל על חלק מהאילוצים.",
                    }
                    : {
                        variant: 'error',
                        title: "לא נמצא שיבוץ אפשרי",
                        message: "המערכת לא מצאה שיבוץ שעומד בכל הכללים הקשיחים. הסיבות הנפוצות:",
                        items: INFEASIBLE_CAUSES,
                    });
                return;
            }

            // 2. Set the draft assignments directly to the state (No DB fetch); saving is a separate step
            setAssignments(response.draft_assignments);

            const score = `ציון קנסות: ${response.penalty_score ?? "—"} (נמוך יותר = טוב יותר). השיבוץ עדיין לא נשמר.`;
            const issues = describeEngineResult(response);
            if (issues.length > 0) {
                // Partial success the user must read: stays above the grid
                setEngineIssue({
                    variant: 'warning',
                    title: response.unfilled_slots.length > 0 ? "השיבוץ הושלם, אבל חלק מהעמדות נשארו ריקות" : "השיבוץ הושלם עם הערות",
                    message: score,
                    items: issues,
                });
                return;
            }

            // Show the penalty score (total penalties; lower is better)
            notify.success(response.status === "OPTIMAL" ? "נמצא שיבוץ אופטימלי" : "נמצא שיבוץ תקין", score);

        } catch (error) {
            logError("Engine generation failed:", error);
            setEngineIssue({ variant: 'error', title: "השיבוץ האוטומטי נכשל", message: toAppError(error).message });
        } finally {
            setIsGenerating(false);
        }
    };

    // --- Handle Save Schedule ---
    const handleSaveSchedule = async (skipConfirm: boolean = false): Promise<boolean> => {
        if (!selectedLocationId) return false;
        
        // Dynamic confirmation message based on publish state
        if (!skipConfirm) {
            const confirmed = await confirm(isPublished
                ? {
                    title: "לשמור את השינויים?",
                    description: "השבוע כבר מפורסם. כל שינוי שיישמר יוצג לעובדים באופן מיידי.",
                    confirmText: "שמירה",
                }
                : {
                    title: "לשמור את השינויים כטיוטה?",
                    description: "הסידור יישמר כטיוטה, והעובדים לא יראו אותו עד שיפורסם.",
                    confirmText: "שמירה",
                });
            if (!confirmed) return false;
        }

        try {
            setIsSaving(true);
            const startDateStr = formatDateStr(weekDates[0]);
            const endDateStr = formatDateStr(weekDates[6]);
            const result = await saveAssignments(
                selectedLocationId,
                startDateStr,
                endDateStr,
                assignments
            );

            // The publish flow saves silently and reports the publish result instead
            if (!skipConfirm) {
                notify.success("הסידור נשמר", `נוספו: ${result.added} · עודכנו: ${result.updated} · הוסרו: ${result.removed} · ללא שינוי: ${result.unchanged}`);
            }
            return true;
        } catch (error) {
            notify.error(error, "שמירת הסידור נכשלה");
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    // --- Handle Check Schedule ---
    // Checks the board as it is on screen (unsaved edits included); problems stay above the grid and on the cards
    const handleCheckSchedule = async () => {
        try {
            const result = await scheduleCheck.run();
            if (result && result.violations.length === 0) {
                notify.success("לא נמצאו הפרות", "הסידור עומד בכל הכללים הקשיחים.");
            }
        } catch (error) {
            notify.error(error, "בדיקת הסידור נכשלה");
        }
    };

    // Handlers for Publish and Unpublish
    const handlePublish = async () => {
        // Warn about broken hard rules, but never block: the scheduler decides
        let violations = 0;
        try {
            violations = (await scheduleCheck.run())?.violations.length ?? 0;
        } catch (error) {
            logError("Schedule check before publish failed:", error);
        }
        const confirmed = await confirm(violations > 0
            ? {
                title: "לפרסם למרות ההפרות?",
                description: `נמצאו ${violations} הפרות של כללים קשיחים (מפורטות מעל הלוח). העובדים יראו את המשמרות באופן מיידי.`,
                confirmText: "פרסום בכל זאת",
            }
            : {
                title: "לפרסם את הסידור?",
                description: "העובדים יראו את המשמרות באופן מיידי.",
                confirmText: "פרסום",
            });
        if (!confirmed) return;
        // First save the current board state silently
        const saved = await handleSaveSchedule(true);
        if (saved) {
            await setPublished(true);
        }
    };

    const handleUnpublish = async () => {
        const confirmed = await confirm({
            title: "להחזיר את הסידור למצב טיוטה?",
            description: "המשמרות יוסתרו מהעובדים עד לפרסום הבא.",
            confirmText: "החזרה לטיוטה",
        });
        if (!confirmed) return;
        await setPublished(false);
    };

    // --- Handle Drag and Drop Logic ---
    // The slot owns the role: see hooks/scheduleEdits.ts
    const handleDrop = (e: React.DragEvent, target: SlotTarget) => {
        e.preventDefault(); // Required to allow dropping

        const payloadStr = e.dataTransfer.getData('application/json');
        if (!payloadStr) return;

        const payload = JSON.parse(payloadStr) as DragPayload;
        const sourceEmployeeId = payload.employee_id;
        if (!sourceEmployeeId) return;

        const targetPlacement: Placement | null = target.employeeId !== null
            ? { employeeId: target.employeeId, shiftId: target.shiftId, date: target.date }
            : null;

        let next: Assignment[] | null;
        if (payload.type === 'FROM_SIDEBAR') {
            // REPLACE the employee in an occupied slot, or ADD to an empty one
            next = targetPlacement
                ? replaceInSlot(assignments, targetPlacement, sourceEmployeeId)
                : addToSlot(assignments, sourceEmployeeId, target);
        } else {
            const source: Placement = { employeeId: sourceEmployeeId, shiftId: payload.shift_id, date: payload.date };
            if (targetPlacement && targetPlacement.employeeId === sourceEmployeeId
                && targetPlacement.shiftId === source.shiftId && targetPlacement.date === source.date) {
                return; // Dropped on itself
            }
            // SWAP with the employee in an occupied slot, or MOVE to an empty one
            next = targetPlacement
                ? swapPlacements(assignments, source, targetPlacement)
                : moveToSlot(assignments, source, target);
        }

        if (!next) {
            notify.warning("העובד כבר משובץ במשמרת זו", "אותו עובד לא יכול להופיע פעמיים באותה משמרת.");
            return;
        }
        setAssignments(next);
    };

    // --- Handle Remove Assignment ---
    const handleRemove = (placement: Placement) => {
        setAssignments(prev => removePlacement(prev, placement));
    };

    // --- Handle Update Assignment Hours ---
    const handleUpdateAssignmentHours = (placement: Placement, startTime: string, endTime: string) => {
        setAssignments(prev => setPlacementHours(prev, placement, startTime, endTime));
    };

    // Handler to open the modal for a specific employee
    const handleOpenEditModal = (employeeId: number) => {
        setEditingEmployeeId(employeeId);
        setIsEmployeeModalOpen(true);
    };

    // Prompt the user to select a location if none is selected
    if (!selectedLocationId) {
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4 text-slate-500">
                <Settings size={48} className="text-slate-300" />
                <h2 className="text-xl font-medium">בחר אתר על מנת לראות סידור</h2>
            </div>
        );
    }
    
    if (loading || isDemandLoading || isPubLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    // If any part of the week failed to load, show an error state instead of a board that looks
    // editable: saving it would send incomplete data, and Smart Sync would delete the missing shifts.
    // Week navigation stays available.
    const loadError = boardError ?? demandError ?? publicationError;

    return (
        <div className="flex h-full flex-row gap-4 relative overflow-hidden">
            {!isEmployee && !loadError && <EmployeeSidebar employeesMap={employeesMap} positions={positions} assignments={assignments} searchQuery={employeeSearchTerm} onSearchChange={setEmployeeSearchTerm} onEditEmployee={handleOpenEditModal} shifts={shiftDefinitions} weekDates={weekDates.map(d => formatDateStr(d))} />}
            <div className="flex flex-col space-y-3 flex-grow overflow-hidden min-w-0">
                {/* Header Actions */}
                <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center shrink-0">
                    <div className="flex items-center flex-wrap">
                    
                        {/* Week Navigation Controls */}
                        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                            <button 
                                onClick={handlePrevWeek}
                                className="p-1.5 hover:bg-gray-100 rounded transition text-gray-600"
                                title="שבוע הקודם"
                            >
                                <ChevronRight size={20} />
                            </button>
                            
                            <span className="font-medium text-sm text-gray-800 min-w-[140px] text-center">
                            שבוע - {weekStart.toLocaleDateString('he-IL')}
                            </span>
                            
                            <button 
                            onClick={handleNextWeek}
                            className="p-1.5 hover:bg-gray-100 rounded transition text-gray-600"
                            title="שבוע הבא"
                        >
                            <ChevronLeft size={20} />
                        </button>
                    </div>
                    
                    {/* CHANGED: Status Badge for Managers */}
                    {!isEmployee && !loadError && (
                        <div className={`mr-4 px-3 py-1 rounded-full text-sm font-semibold border ${isPublished ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                            {isPublished ? 'פורסם' : 'טיוטה'}
                        </div>
                    )}
                </div>

                {/* Only render action buttons if the user is NOT a regular employee (and the week loaded) */}
                {!isEmployee && !loadError && (
                    <div className="flex space-x-3 space-x-reverse">
                        <button
                            onClick={openWeightsModal}
                                disabled={!weights}
                                title={weights ? undefined : "משקלים לא נטענו"}
                                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Settings size={18} />
                                כיוונון השיבוץ
                            </button>
                            
                            <button 
                                onClick={handleAutoAssign}
                                disabled={isGenerating}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                                    isGenerating ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                                } text-white`}
                            >
                                {isGenerating ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <Play size={18} />
                                )}
                                {isGenerating ? 'מריץ מנוע...' : 'שיבוץ אוטומטי'}
                            </button>

                            {/* Check the board against the engine's rules */}
                            <button
                                onClick={handleCheckSchedule}
                                disabled={scheduleCheck.isChecking || isSaving || isGenerating}
                                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {scheduleCheck.isChecking ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-700"></div>
                                ) : (
                                    <ShieldCheck size={18} />
                                )}
                                {scheduleCheck.isChecking ? 'בודק...' : 'בדיקת סידור'}
                            </button>

                            {/*  Save button */}
                            <button 
                                onClick={() => handleSaveSchedule()}
                                disabled={isSaving || isGenerating}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                                    isSaving ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                                } text-white`}
                            >
                                {isSaving ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <Save size={18} />
                                )}
                                {isSaving ? 'שומר...' : 'שמירה'}
                            </button>

                            {/* Publish / Unpublish Buttons (next to Save) */}
                            {isPublished ? (
                                <button
                                    onClick={handleUnpublish}
                                    disabled={isUpdating}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                                >
                                    {isUpdating ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-700"></div> : <EyeOff size={18} />}
                                    ביטול פרסום
                                </button>
                            ) : (
                                <button
                                    onClick={handlePublish}
                                    disabled={isUpdating || isSaving || isGenerating || scheduleCheck.isChecking}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                    {isUpdating ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <Send size={18} />}
                                    פרסום
                                </button>
                            )}
                        </div>
                    )}
                </div>
             
                {/* The Schedule Grid (Takes up remaining space) */}
            {loadError ? (
                <InlineAlert
                    variant="error"
                    title="טעינת הסידור נכשלה"
                    action={{ label: 'נסה שוב', onClick: reloadBoard }}
                    className="shrink-0"
                >
                    {loadError.message}
                </InlineAlert>
            ) : isEmployee && !isPublished ? (
                /* CHANGED: Hide grid for employees if not published */
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-300 p-8">
                    <EyeOff size={48} className="text-slate-300 mb-4" />
                    <h3 className="text-xl font-medium text-slate-600">הסידור לשבוע זה טרם פורסם</h3>
                    <p className="text-slate-400 mt-2">תוכל לצפות במשמרות שלך לאחר שהמנהל יפרסם את הסידור.</p>
                </div>
            ) : (
                <>
                    {/* What the last auto-assign run needs to explain; stays until dismissed, the next run, or a week change */}
                    {!isEmployee && engineIssue && (
                        <InlineAlert
                            variant={engineIssue.variant}
                            title={engineIssue.title}
                            items={engineIssue.items}
                            onDismiss={() => setEngineIssue(null)}
                            className="shrink-0"
                        >
                            {engineIssue.message}
                        </InlineAlert>
                    )}
                    {/* The last schedule check's problems; cleared by any edit */}
                    {!isEmployee && scheduleCheck.items && scheduleCheck.items.length > 0 && (
                        <InlineAlert
                            variant="error"
                            title={`נמצאו ${scheduleCheck.items.length} הפרות של כללים קשיחים`}
                            items={scheduleCheck.items}
                            onDismiss={scheduleCheck.clear}
                            className="shrink-0"
                        >
                            המשמרות שמפרות כלל מסומנות בלוח באדום.
                        </InlineAlert>
                    )}
                    <ScheduleGrid
                        weekDates={weekDates}
                        shiftDefinitions={shiftDefinitions}
                        positions={positions}
                        demandMap={demandMap}
                        pendingCells={!isEmployee ? pendingCells : undefined}
                        onChangeSlots={!isEmployee ? changeSlots : undefined}
                        assignments={assignments}
                        employeesMap={employeesMap}
                        issuesByPlacement={!isEmployee ? scheduleCheck.issuesByPlacement : undefined}
                        formatDateStr={formatDateStr}
                        // Pass an empty dummy function if it's an employee, to satisfy TypeScript
                        onDrop={isEmployee ? () => {} : handleDrop}
                        onRemove={isEmployee ? () => {} : handleRemove}
                        onUpdateHours={isEmployee ? () => {} : handleUpdateAssignmentHours}
                    />
                </>
            )}
        </div>
            
            {/* Employee Shift Settings Modal (shift limits only) */}
            {!isEmployee && (
                <EmployeeSettingsModal
                    isOpen={isEmployeeModalOpen}
                    onClose={() => setIsEmployeeModalOpen(false)}
                    // Look up the full employee object from the map using the ID we saved in state
                    employee={editingEmployeeId ? employeesMap[editingEmployeeId] : null}
                    onSuccess={refreshEmployees}
                />
            )}
            
            {/* --- Optimization Weights Modal --- */}
            {/* Only render if modal is open, the user is NOT a regular employee, and the weights loaded */}
            {isSettingsOpen && !isEmployee && weights && (
                <OptimizationWeightsModal
                    weights={weights}
                    onChange={setWeights}
                    onSubmit={handleSaveWeights}
                    onClose={() => setIsSettingsOpen(false)}
                    isSubmitting={isSubmitting}
                    error={weightsError}
                />
            )}
        </div>
    );
}