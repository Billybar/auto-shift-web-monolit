// src/features/schedule/components/ScheduleToolbar.tsx
import { Settings, Play, Save, ChevronLeft, ChevronRight, Send, EyeOff, ShieldCheck } from 'lucide-react';

import Button from '../../../components/ui/Button';

const OUTLINE_CLASS = 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300';

interface ScheduleActions {
    isPublished: boolean;
    // The weights loaded, so the tuning modal can open
    canTuneWeights: boolean;
    onTuneWeights: () => void;
    onAutoAssign: () => void;
    isGenerating: boolean;
    onCheck: () => void;
    isChecking: boolean;
    onSave: () => void;
    isSaving: boolean;
    onPublish: () => void;
    onUnpublish: () => void;
    isUpdatingPublication: boolean;
}

interface ScheduleToolbarProps {
    weekStart: Date;
    onPrevWeek: () => void;
    onNextWeek: () => void;
    // Staff on a week that loaded; missing for employees and while the week failed to load
    actions?: ScheduleActions;
}

/** Week navigation, and for staff the week's status and actions. */
export default function ScheduleToolbar({ weekStart, onPrevWeek, onNextWeek, actions }: ScheduleToolbarProps) {
    return (
        <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center shrink-0">
            <div className="flex items-center flex-wrap">
                <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                    <button
                        onClick={onPrevWeek}
                        className="p-1.5 hover:bg-gray-100 rounded transition text-gray-600"
                        title="שבוע הקודם"
                    >
                        <ChevronRight size={20} />
                    </button>

                    <span className="font-medium text-sm text-gray-800 min-w-[140px] text-center">
                        שבוע - {weekStart.toLocaleDateString('he-IL')}
                    </span>

                    <button
                        onClick={onNextWeek}
                        className="p-1.5 hover:bg-gray-100 rounded transition text-gray-600"
                        title="שבוע הבא"
                    >
                        <ChevronLeft size={20} />
                    </button>
                </div>

                {actions && (
                    <div className={`mr-4 px-3 py-1 rounded-full text-sm font-semibold border ${actions.isPublished ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                        {actions.isPublished ? 'פורסם' : 'טיוטה'}
                    </div>
                )}
            </div>

            {actions && <ActionButtons {...actions} />}
        </div>
    );
}

function ActionButtons({
    isPublished,
    canTuneWeights,
    onTuneWeights,
    onAutoAssign,
    isGenerating,
    onCheck,
    isChecking,
    onSave,
    isSaving,
    onPublish,
    onUnpublish,
    isUpdatingPublication,
}: ScheduleActions) {
    return (
        <div className="flex space-x-3 space-x-reverse">
            <Button
                onClick={onTuneWeights}
                disabled={!canTuneWeights}
                title={canTuneWeights ? undefined : 'משקלים לא נטענו'}
                className={OUTLINE_CLASS}
            >
                <Settings size={18} />
                כיוונון השיבוץ
            </Button>

            <Button onClick={onAutoAssign} loading={isGenerating}>
                {!isGenerating && <Play size={18} />}
                {isGenerating ? 'מריץ מנוע...' : 'שיבוץ אוטומטי'}
            </Button>

            {/* Check the board against the engine's rules */}
            <Button
                onClick={onCheck}
                loading={isChecking}
                disabled={isSaving || isGenerating}
                className={OUTLINE_CLASS}
            >
                {!isChecking && <ShieldCheck size={18} />}
                {isChecking ? 'בודק...' : 'בדיקת סידור'}
            </Button>

            <Button
                onClick={onSave}
                loading={isSaving}
                disabled={isGenerating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
                {!isSaving && <Save size={18} />}
                {isSaving ? 'שומר...' : 'שמירה'}
            </Button>

            {isPublished ? (
                <Button
                    onClick={onUnpublish}
                    loading={isUpdatingPublication}
                    className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                >
                    {!isUpdatingPublication && <EyeOff size={18} />}
                    ביטול פרסום
                </Button>
            ) : (
                <Button
                    variant="success"
                    onClick={onPublish}
                    loading={isUpdatingPublication}
                    disabled={isSaving || isGenerating || isChecking}
                >
                    {!isUpdatingPublication && <Send size={18} />}
                    פרסום
                </Button>
            )}
        </div>
    );
}
