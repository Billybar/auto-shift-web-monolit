// mobile/src/app/(tabs)/constraints.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, Platform, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { Save } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuth'; // Adjust path to your mobile AuthContext
import { useAppLocation } from '../../hooks/useLocation'; // Adjust path to your mobile LocationContext
import { useWeeklyConstraints } from '../../hooks/useWeeklyConstraints';
import { useDefaultConstraints } from '../../hooks/useDefaultConstraints';
import { useBoardRows } from '../../hooks/useBoardRows';
import { InlineAlert } from '../../components/ui/inline-alert';
import { addDays } from '../../lib/dates';

// A render error here shows the fallback inside the tab, so the tab bar keeps working
export { ErrorFallback as ErrorBoundary } from '../../components/error-fallback';

// One week, or the default week ("אילוצים קבועים") every week the employee hasn't saved starts with
type BoardMode = 'week' | 'defaults';
const MODES: { mode: BoardMode; label: string }[] = [
    { mode: 'week', label: 'לשבוע' },
    { mode: 'defaults', label: 'קבועים' },
];

const dayName = (date: string) => new Date(date).toLocaleDateString('he-IL', { weekday: 'short' });

export default function ConstraintsScreen() {
    const { width } = useWindowDimensions();

    // The grid always fits the screen width (the pinned day names can't follow a sideways scroll),
    // so very narrow phones get a smaller cell label to keep "מעדיף" inside its cell
    const cellTextSize = width <= 340 ? 'text-[10px]' : 'text-xs';

    // Measured heights used to keep the whole note input visible above the sticky Save bar.
    // On iOS the scroll view aligns the caret (top line of the note), not the input's bottom edge,
    // so the offset must cover the note box height plus the Save bar.
    const [saveBarHeight, setSaveBarHeight] = useState(90);
    const [noteHeight, setNoteHeight] = useState(80);
    const keyboardBottomOffset = Platform.OS === 'ios' ? saveBarHeight + noteHeight + 16 : 100;

    const { user } = useAuth();
    const { selectedLocationId, isLoadingLocations, locationsError, reloadLocations } = useAppLocation();
    const hasValidLocation = typeof selectedLocationId === 'number';

    // The board's rows: each stands for one or more shifts the employee marks together
    const { rows, isLoadingRows, rowsError, reloadRows } = useBoardRows(
        hasValidLocation ? selectedLocationId : 0
    );

    const [mode, setMode] = useState<BoardMode>('week');
    const isWeek = mode === 'week';

    const {
        constraintsList,
        syncStartDate,
        isLoading: isLoadingWeek,
        loadError: weekError,
        isSubmitting: isSubmittingWeek,
        weekDays,
        setSyncStartDate,
        toggleConstraint,
        saveConstraints,
        reload: reloadWeek,
        note,
        setNote,
        usesDefaults,
        isDirty,
    } = useWeeklyConstraints({
        employeeId: user?.employee_id,
        isManager: false // Required by the hook's interface
    });

    // Both boards stay loaded, so switching between them keeps unsaved edits
    const {
        defaults,
        isLoading: isLoadingDefaults,
        loadError: defaultsError,
        isSubmitting: isSubmittingDefaults,
        toggleDefault,
        saveDefaults,
        reload: reloadDefaults,
    } = useDefaultConstraints({ employeeId: user?.employee_id, isManager: false });

    const constraintsError = isWeek ? weekError : defaultsError;
    const reloadConstraints = isWeek ? reloadWeek : reloadDefaults;
    const isSubmitting = isWeek ? isSubmittingWeek : isSubmittingDefaults;
    const isOverlayLoading = (isWeek ? isLoadingWeek : isLoadingDefaults) || isLoadingRows;

    // Either part of the board failed to load (and isn't being retried). The grid is then replaced by the
    // error and saving is blocked: saving replaces the whole board, so it would delete constraints that weren't shown.
    const loadError = isOverlayLoading ? null : (rowsError ?? constraintsError);
    const retryLoad = () => {
        if (rowsError) reloadRows();
        if (constraintsError) reloadConstraints();
    };
    const isSaveDisabled = isSubmitting || isOverlayLoading || !!loadError || rows.length === 0;

    // The columns: the week's dates, or the days of the week (keyed 0 = Sunday ... 6 = Saturday).
    // weekDays always starts on a Sunday, so it gives the day names for both.
    const columns = weekDays.map((date, index) => (
        isWeek
            ? { key: date, title: dayName(date), subtitle: date.split('-').reverse().join('/').substring(0, 5) }
            : { key: String(index), title: dayName(date), subtitle: undefined }
    ));
    const markAt = (columnKey: string, groupId: number) => (
        isWeek
            ? constraintsList.find(c => c.date === columnKey && c.group_id === groupId)
            : defaults.find(c => c.day_of_week === Number(columnKey) && c.group_id === groupId)
    );
    const toggleCell = (columnKey: string, groupId: number) => {
        if (isWeek) toggleConstraint(columnKey, groupId);
        else toggleDefault(Number(columnKey), groupId);
    };

    // Cell styling logic
    const getCellDisplay = (columnKey: string, groupId: number) => {
        const constraint = markAt(columnKey, groupId);
        if (constraint?.constraint_type === 'cannot_work') {
            return { label: 'X', bgClass: 'bg-red-100 border-red-300', textClass: 'text-red-700 font-bold' };
        }
        if (constraint?.constraint_type === 'prefer_to') {
            return { label: 'מעדיף', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-700 font-bold' };
        }
        return { label: 'פנוי', bgClass: 'bg-slate-50 border-gray-200', textClass: 'text-gray-400' };
    };

    // The hooks report the result (toast)
    const handleSave = async () => {
        if (isWeek) {
            saveConstraints();
            return;
        }
        // A week that still shows the defaults (and wasn't edited) now shows the new ones
        if (await saveDefaults() && usesDefaults && !isDirty) reloadWeek();
    };

    // Date navigation helpers
    const handleNextWeek = () => setSyncStartDate(addDays(syncStartDate, 7));

    const handlePrevWeek = () => setSyncStartDate(addDays(syncStartDate, -7));

    // Managers and schedulers who don't work shifts have no employee record, so there is nothing to submit
    if (!user?.employee_id) {
        return (
            <View className="flex-1 justify-center p-4 bg-white">
                <InlineAlert variant="info" title="אין אילוצים להגשה">
                    החשבון שלך לא מקושר לעובד, ולכן אין אילוצים להגיש.
                </InlineAlert>
            </View>
        );
    }

    if (!hasValidLocation) {
        return (
            <View className="flex-1 justify-center items-center p-4 bg-white">
                {isLoadingLocations ? (
                    <ActivityIndicator size="large" color="#2563eb" />
                ) : locationsError ? (
                    <InlineAlert
                        variant="error"
                        title="טעינת רשימת האתרים נכשלה"
                        action={{ label: 'נסה שוב', onPress: reloadLocations }}
                        className="self-stretch"
                    >
                        {locationsError.message}
                    </InlineAlert>
                ) : (
                    <Text className="text-slate-500 text-lg">יש לבחור מיקום פעיל</Text>
                )}
            </View>
        );
    }

    return (
        <View className="flex-1 bg-white" style={{ direction: 'rtl' }}>
            <KeyboardAwareScrollView
                // Keep the whole note input above the sticky Save bar, not just the caret line
                bottomOffset={keyboardBottomOffset}
                // The whole page scrolls as one; the day names (child 1) stay pinned at the top
                stickyHeaderIndices={[1]}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Header & Week Navigation */}
                <View className="p-4 border-b border-gray-200">

                    {/* Board mode */}
                    <View className="flex-row bg-slate-100 p-1 rounded-xl mb-3" accessibilityRole="tablist">
                        {MODES.map(({ mode: option, label }) => (
                            <TouchableOpacity
                                key={option}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: mode === option }}
                                onPress={() => setMode(option)}
                                disabled={isSubmitting}
                                className={`flex-1 items-center py-2 rounded-lg ${mode === option ? 'bg-white shadow-sm' : ''}`}
                            >
                                <Text className={mode === option ? 'font-bold text-blue-700' : 'text-slate-600'}>{label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Week Navigation */}
                    {isWeek ? (
                        <View className="flex-row justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <TouchableOpacity onPress={handlePrevWeek} className="px-3 py-1 bg-white rounded shadow-sm">
                                <Text className="text-blue-600">הקודם</Text>
                            </TouchableOpacity>
                            <Text className="font-bold text-slate-700">שבוע: {syncStartDate.split('-').reverse().join('/')}</Text>
                            <TouchableOpacity onPress={handleNextWeek} className="px-3 py-1 bg-white rounded shadow-sm">
                                <Text className="text-blue-600">הבא</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <InlineAlert variant="info">
                            האילוצים הקבועים ממלאים כל שבוע שעוד לא שמרת. שבוע שנשמר או פורסם לא משתנה.
                        </InlineAlert>
                    )}
                    {isWeek && usesDefaults && !weekError && (
                        <InlineAlert variant="info" className="mt-3">
                            השבוע מולא מהאילוצים הקבועים ועדיין לא נשמר. שמירה תקבע אותו לשבוע הזה.
                        </InlineAlert>
                    )}
                    <Text className="text-xs text-slate-500 text-center mt-2">לחץ על תא כדי לשנות: פנוי ➔ לא יכול (X) ➔ מעדיף</Text>
                </View>

                {/* Pinned day names. Always rendered (empty on a load error) so it stays child 1 of the scroll.
                    Its 18px side inset (px-2 + px-2.5) matches the framed board's (mx-2 + border-2 + p-2), so the columns line up */}
                <View className="bg-white px-2 pt-2">
                    {!loadError && (
                        <View className="flex-row px-2.5 pb-2 border-b border-slate-400">
                            {columns.map((column, index) => (
                                <React.Fragment key={column.key}>
                                    {/* Thin column separator */}
                                    {index > 0 && <View className="w-px bg-slate-400" />}
                                    <View className="flex-1 items-center justify-center mx-0.5">
                                        <Text className="font-bold text-slate-700 text-xs">{column.title}</Text>
                                        {column.subtitle && <Text className="text-[10px] text-slate-400">{column.subtitle}</Text>}
                                    </View>
                                </React.Fragment>
                            ))}
                        </View>
                    )}
                </View>

                {/* Board Grid, or why it couldn't load */}
                {loadError ? (
                    <InlineAlert
                        variant="error"
                        title={isWeek ? 'טעינת האילוצים נכשלה' : 'טעינת האילוצים הקבועים נכשלה'}
                        action={{ label: 'נסה שוב', onPress: retryLoad }}
                        className="m-4"
                    >
                        {loadError.message}
                    </InlineAlert>
                ) : (
                <View className="relative">
                    {isOverlayLoading && (
                        <View className="absolute inset-0 bg-white/70 justify-center items-center z-10">
                            <ActivityIndicator size="large" color="#2563eb" />
                        </View>
                    )}

                    <View className="mx-2 my-2 p-2 rounded-xl border-2 border-slate-400">
                        {/* Table Body */}
                        {rows.length === 0 && !isLoadingRows ? (
                            <Text className="text-center text-slate-500 my-10">לא הוגדרו משמרות לסניף זה.</Text>
                        ) : (
                            rows.map(row => (
                                <View key={row.groupId} className="mb-4 border-b border-gray-100 pb-3 w-full">
                                    {/* Row Title */}
                                    <View className="pt-1 px-1 mb-1 flex-row justify-between items-center">
                                        <Text className="font-bold text-slate-700 text-sm">{row.label}</Text>
                                        <Text className="text-xs text-slate-300">{row.hours}</Text>
                                    </View>

                                    {/* Shift Cells Row */}
                                    <View className="flex-row justify-between w-full">
                                        {columns.map((column, index) => {
                                            const cellData = getCellDisplay(column.key, row.groupId);
                                            return (
                                                <React.Fragment key={`${column.key}-${row.groupId}`}>
                                                    {/* Thin column separator */}
                                                    {index > 0 && <View className="w-px bg-slate-400" />}
                                                    <TouchableOpacity
                                                        onPress={() => toggleCell(column.key, row.groupId)}
                                                        disabled={isOverlayLoading}
                                                        className={`flex-1 h-11 mx-0.5 rounded-md border items-center justify-center ${cellData.bgClass}`}
                                                    >
                                                        <Text numberOfLines={1} className={`${cellTextSize} ${cellData.textClass}`}>{cellData.label}</Text>
                                                    </TouchableOpacity>
                                                </React.Fragment>
                                            );
                                        })}
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                </View>
                )}

                {/* Weekly Note Input Section for Mobile (a note belongs to one week) */}
                {isWeek && (
                <View className="px-2 py-1 mt-2">
                    <View className="bg-blue-50 p-1 rounded-xl border border-blue-100">
                        <TextInput
                            value={note || ''}
                            onChangeText={setNote} // React Native uses onChangeText instead of onChange
                            editable={!isOverlayLoading && !isSubmitting && !loadError} // editable instead of disabled
                            onLayout={e => setNoteHeight(e.nativeEvent.layout.height)}
                            multiline={true}
                            numberOfLines={3}
                            placeholder=" הערות לסידור..."
                            placeholderTextColor="#94a3b8"
                            className="w-full border border-blue-200 rounded-lg p-3 text-sm text-slate-800 bg-white min-h-[80px] text-right"
                            style={{ textAlignVertical: 'top' }} // Fix for Android multiline text alignment
                        />
                    </View>
                </View>
                )}
            </KeyboardAwareScrollView>

            {/* Bottom Save Button - Kept OUTSIDE ScrollView; sticks to the top of the keyboard while typing */}
            <KeyboardStickyView>
                <View
                    className="p-4 bg-white border-t border-gray-200"
                    onLayout={e => setSaveBarHeight(e.nativeEvent.layout.height)}
                >
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={isSaveDisabled}
                        className={`flex-row justify-center items-center gap-2 p-4 rounded-xl ${
                            isSaveDisabled ? 'bg-slate-300' : 'bg-emerald-600'
                        }`}
                    >
                        <Save size={20} color="white" />
                        <Text className="text-white font-bold text-lg">
                            {isSubmitting ? 'שומר נתונים...' : isWeek ? 'שמור אילוצים' : 'שמור אילוצים קבועים'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardStickyView>
        </View>
    );
}