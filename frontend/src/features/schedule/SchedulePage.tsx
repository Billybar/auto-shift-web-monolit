// frontend/src/features/schedule/SchedulePage.tsx
import { useMemo, useState } from 'react';
import { Settings, EyeOff } from 'lucide-react';

import { logError } from '../../api/errors';
import { notify } from '../../lib/notify';
import InlineAlert from '../../components/ui/InlineAlert';
import Spinner from '../../components/ui/Spinner';
import { UserRole } from '../../types';
import { useAuth } from '../../context/useAuth';
import { useAppLocation } from '../../context/useAppLocation';
import { useConfirm } from '../../context/confirmContext';

import { useScheduleWeek } from './hooks/scheduleWeek';
import { useScheduleBoard } from './hooks/useScheduleBoard';
import { useAutoAssign } from './hooks/useAutoAssign';
import { useLocationWeights } from './hooks/useLocationWeights';
import { useWeeklyDemand } from './hooks/useWeeklyDemand';
import { useSchedulePublication } from './hooks/useSchedulePublication';
import { useScheduleCheck } from './hooks/useScheduleCheck';
import { useConstraintSubmissions } from './hooks/useConstraintSubmissions';
import { makeNameLookups, makeShortNames } from './hooks/scheduleLabels';
import type { DragPayload, SlotTarget } from './hooks/scheduleEdits';
import ScheduleToolbar from './components/ScheduleToolbar';
import EmployeeSidebar from './EmployeeSidebar';
import ScheduleGrid from './ScheduleGrid';
import OptimizationWeightsModal from './OptimizationWeightsModal';
import EmployeeSettingsModal from '../employees/EmployeeSettingsModal';
import EmployeeConstraintsModal from '../constraints/components/EmployeeConstraintsModal';

export default function SchedulePage() {
    const { user } = useAuth();
    // Employees only view the published board
    const isEmployee = user?.role === UserRole.EMPLOYEE;
    const { selectedLocationId } = useAppLocation();
    const locationId = selectedLocationId || null;
    const confirm = useConfirm();

    const week = useScheduleWeek();
    const board = useScheduleBoard(locationId, week, isEmployee);
    const demand = useWeeklyDemand(locationId, week.startDate);
    const publication = useSchedulePublication(locationId, week.startDate);
    const weights = useLocationWeights(locationId, !isEmployee);

    const names = makeNameLookups(board.shifts, board.positions, board.employeesMap);
    // Compact name labels for the sidebar and the grid chips (full names stay in tooltips)
    const shortNames = useMemo(() => makeShortNames(board.employees), [board.employees]);
    // The last schedule check; dropped by any edit, week change or location change
    const scheduleCheck = useScheduleCheck(locationId, week.startDate, board.assignments, names);
    // Who hasn't submitted constraints this week (sidebar marker); empty once the week is published
    const pendingConstraintIds = useConstraintSubmissions(locationId, week.startDate, publication.isPublished, !isEmployee);
    const autoAssign = useAutoAssign({
        locationId,
        startDate: week.startDate,
        demandMap: demand.demandMap,
        names,
        onDraft: board.replaceAll,
    });

    const [employeeSearchTerm, setEmployeeSearchTerm] = useState<string>('');
    // The employee whose shift-limits popup is open
    const [settingsEmployeeId, setSettingsEmployeeId] = useState<number | null>(null);
    // The employee whose constraints popup is open
    const [constraintsEmployeeId, setConstraintsEmployeeId] = useState<number | null>(null);

    // Retry for the error state: reload everything the board is built from
    const reloadBoard = () => {
        board.reload();
        demand.reload();
        publication.reload();
    };

    /** Saves the board. The publish flow skips the confirmation and the toast. Returns false when not saved. */
    const handleSaveSchedule = async (silent: boolean = false): Promise<boolean> => {
        if (!silent) {
            const confirmed = await confirm(publication.isPublished
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
            const result = await board.save();
            if (!silent) {
                notify.success("הסידור נשמר", `נוספו: ${result.added} · עודכנו: ${result.updated} · הוסרו: ${result.removed} · ללא שינוי: ${result.unchanged}`);
            }
            return true;
        } catch (error) {
            notify.error(error, "שמירת הסידור נכשלה");
            return false;
        }
    };

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
        // The board on screen is what gets published
        if (await handleSaveSchedule(true)) {
            await publication.setPublished(true);
        }
    };

    const handleUnpublish = async () => {
        const confirmed = await confirm({
            title: "להחזיר את הסידור למצב טיוטה?",
            description: "המשמרות יוסתרו מהעובדים עד לפרסום הבא.",
            confirmText: "החזרה לטיוטה",
        });
        if (!confirmed) return;
        await publication.setPublished(false);
    };

    // The slot owns the role: see hooks/scheduleEdits.ts
    const handleDrop = (payload: DragPayload, target: SlotTarget) => {
        if (!board.drop(payload, target)) {
            notify.warning("העובד כבר משובץ במשמרת זו", "אותו עובד לא יכול להופיע פעמיים באותה משמרת.");
        }
    };

    if (!locationId) {
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4 text-slate-500">
                <Settings size={48} className="text-slate-300" />
                <h2 className="text-xl font-medium">בחר אתר על מנת לראות סידור</h2>
            </div>
        );
    }

    if (board.isLoading || demand.isLoading || publication.isLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Spinner />
            </div>
        );
    }

    // If any part of the week failed to load, show an error state instead of a board that looks
    // editable: saving it would send incomplete data, and Smart Sync would delete the missing shifts.
    // Week navigation stays available.
    const loadError = board.loadError ?? demand.loadError ?? publication.loadError;
    const canEdit = !isEmployee && !loadError;

    return (
        <div className="flex h-full flex-row gap-4 relative overflow-hidden">
            {canEdit && (
                <EmployeeSidebar
                    employeesMap={board.employeesMap}
                    employeeLabels={shortNames}
                    positions={board.positions}
                    assignments={board.assignments}
                    searchQuery={employeeSearchTerm}
                    onSearchChange={setEmployeeSearchTerm}
                    onEditEmployee={setSettingsEmployeeId}
                    onEditConstraints={setConstraintsEmployeeId}
                    shifts={board.shifts}
                    weekDates={week.dateStrs}
                    pendingConstraintIds={pendingConstraintIds}
                />
            )}
            <div className="flex flex-col space-y-3 flex-grow overflow-hidden min-w-0">
                <ScheduleToolbar
                    weekStart={week.weekStart}
                    onPrevWeek={week.goToPrevWeek}
                    onNextWeek={week.goToNextWeek}
                    actions={canEdit ? {
                        isPublished: publication.isPublished,
                        canTuneWeights: !!weights.weights,
                        onTuneWeights: weights.open,
                        onAutoAssign: autoAssign.run,
                        isGenerating: autoAssign.isGenerating,
                        onCheck: handleCheckSchedule,
                        isChecking: scheduleCheck.isChecking,
                        onSave: () => void handleSaveSchedule(),
                        isSaving: board.isSaving,
                        onPublish: handlePublish,
                        onUnpublish: handleUnpublish,
                        isUpdatingPublication: publication.isUpdating,
                    } : undefined}
                />

                {loadError ? (
                    <InlineAlert
                        variant="error"
                        title="טעינת הסידור נכשלה"
                        action={{ label: 'נסה שוב', onClick: reloadBoard }}
                        className="shrink-0"
                    >
                        {loadError.message}
                    </InlineAlert>
                ) : isEmployee && !publication.isPublished ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-300 p-8">
                        <EyeOff size={48} className="text-slate-300 mb-4" />
                        <h3 className="text-xl font-medium text-slate-600">הסידור לשבוע זה טרם פורסם</h3>
                        <p className="text-slate-400 mt-2">תוכל לצפות במשמרות שלך לאחר שהמנהל יפרסם את הסידור.</p>
                    </div>
                ) : (
                    <>
                        {/* What the last auto-assign run needs to explain; stays until dismissed, the next run, or a week change */}
                        {!isEmployee && autoAssign.issue && (
                            <InlineAlert
                                variant={autoAssign.issue.variant}
                                title={autoAssign.issue.title}
                                items={autoAssign.issue.items}
                                onDismiss={autoAssign.dismissIssue}
                                className="shrink-0"
                            >
                                {autoAssign.issue.message}
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
                            weekDates={week.dates}
                            shiftDefinitions={board.shifts}
                            positions={board.positions}
                            demandMap={demand.demandMap}
                            assignments={board.assignments}
                            employeesMap={board.employeesMap}
                            employeeLabels={shortNames}
                            {...(!isEmployee && {
                                pendingCells: demand.pendingCells,
                                onChangeSlots: demand.changeSlots,
                                issuesByPlacement: scheduleCheck.issuesByPlacement,
                                previousDay: { date: week.previousDay, assignments: board.previousDayAssignments },
                                onDrop: handleDrop,
                                onRemove: board.remove,
                                onUpdateHours: board.setHours,
                            })}
                        />
                    </>
                )}
            </div>

            {!isEmployee && (
                <EmployeeSettingsModal
                    isOpen={settingsEmployeeId !== null}
                    onClose={() => setSettingsEmployeeId(null)}
                    employee={settingsEmployeeId !== null ? board.employeesMap[settingsEmployeeId] ?? null : null}
                />
            )}

            {/* Constraints popup for one employee, locked to the week on screen */}
            {!isEmployee && constraintsEmployeeId !== null && board.employeesMap[constraintsEmployeeId] && (
                <EmployeeConstraintsModal
                    employee={board.employeesMap[constraintsEmployeeId]}
                    isManager
                    weekStart={week.startDate}
                    onClose={() => setConstraintsEmployeeId(null)}
                    // The last check was run against the old constraints. The save itself refreshes
                    // the sidebar (hover cards, "not submitted" corners).
                    onSaved={scheduleCheck.clear}
                />
            )}

            {!isEmployee && weights.editing && (
                <OptimizationWeightsModal
                    weights={weights.editing}
                    onChange={weights.setEditing}
                    onSubmit={(e) => { e.preventDefault(); void weights.save(); }}
                    onClose={weights.close}
                    isSubmitting={weights.isSaving}
                    error={weights.saveError}
                />
            )}
        </div>
    );
}
