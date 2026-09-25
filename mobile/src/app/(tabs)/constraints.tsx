// mobile/src/app/(tabs)/constraints.tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Platform, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { Save } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuth'; // Adjust path to your mobile AuthContext
import { useAppLocation } from '../../hooks/useLocation'; // Adjust path to your mobile LocationContext
import { useWeeklyConstraints } from '../../hooks/useWeeklyConstraints';
import { useShiftDefinitions } from '../../hooks/useShiftDefinitions';

export default function ConstraintsScreen() {
    const { width } = useWindowDimensions();
    
    // Set a minimum width of 350 to ensure very small screens can scroll horizontally, 
    // while standard screens (width - 38px: framed table margin + padding + border) fit perfectly without scrolling.
    const contentWidth = Math.max(width - 38, 350);

    // Measured heights used to keep the whole note input visible above the sticky Save bar.
    // On iOS the scroll view aligns the caret (top line of the note), not the input's bottom edge,
    // so the offset must cover the note box height plus the Save bar.
    const [saveBarHeight, setSaveBarHeight] = useState(90);
    const [noteHeight, setNoteHeight] = useState(80);
    const keyboardBottomOffset = Platform.OS === 'ios' ? saveBarHeight + noteHeight + 16 : 100;

    const { user } = useAuth();
    const { selectedLocationId } = useAppLocation();
    const hasValidLocation = typeof selectedLocationId === 'number';

    const { shifts, isLoadingShifts, shiftsError } = useShiftDefinitions(
        hasValidLocation ? selectedLocationId : 0
    );

    const {
        constraintsList,
        syncStartDate,
        isLoading: isLoadingConstraints,
        isSubmitting,
        weekDays,
        setSyncStartDate,
        toggleConstraint,
        saveConstraints,
        note,
        setNote
    } = useWeeklyConstraints({ 
        employeeId: user?.employee_id, 
        isManager: false // Required by the hook's interface
    });

    const isOverlayLoading = isLoadingConstraints || isLoadingShifts;

    // Cell styling logic
    const getCellDisplay = (date: string, shiftId: number) => {
        const constraint = constraintsList.find(c => c.date === date && c.shift_id === shiftId);
        if (constraint?.constraint_type === 'cannot_work') {
            return { label: 'X', bgClass: 'bg-red-100 border-red-300', textClass: 'text-red-700 font-bold' };
        }
        return { label: 'פנוי', bgClass: 'bg-slate-50 border-gray-200', textClass: 'text-gray-400' };
    };

    const handleSave = async () => {
        const result = await saveConstraints();
        if (result?.success) {
            Alert.alert('הצלחה', 'האילוצים נשמרו בהצלחה!');
        } else {
            Alert.alert('שגיאה', `שגיאה בשמירה: ${result?.error}`);
        }
    };

    // Date navigation helpers
    const handleNextWeek = () => {
        const next = new Date(syncStartDate);
        next.setDate(next.getDate() + 7);
        setSyncStartDate(next.toISOString().split('T')[0]);
    };

    const handlePrevWeek = () => {
        const prev = new Date(syncStartDate);
        prev.setDate(prev.getDate() - 7);
        setSyncStartDate(prev.toISOString().split('T')[0]);
    };

    if (!hasValidLocation) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <Text className="text-slate-500 text-lg">יש לבחור מיקום פעיל</Text>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-white" style={{ direction: 'rtl' }}>
            <KeyboardAwareScrollView
                // Keep the whole note input above the sticky Save bar, not just the caret line
                bottomOffset={keyboardBottomOffset}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Header & Week Navigation */}
                <View className="p-4 border-b border-gray-200">
                
                    {/* Week Navigation */}
                    <View className="flex-row justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <TouchableOpacity onPress={handlePrevWeek} className="px-3 py-1 bg-white rounded shadow-sm">
                            <Text className="text-blue-600">הקודם</Text>
                        </TouchableOpacity>
                        <Text className="font-bold text-slate-700">שבוע: {syncStartDate.split('-').reverse().join('/')}</Text>
                        <TouchableOpacity onPress={handleNextWeek} className="px-3 py-1 bg-white rounded shadow-sm">
                            <Text className="text-blue-600">הבא</Text>
                        </TouchableOpacity>
                    </View>
                    <Text className="text-xs text-slate-500 text-center mt-2">לחץ על תא כדי לסמן שאינך יכול לעבוד</Text>
                </View>

                {/* Error Message */}
                {shiftsError && (
                    <View className="p-3 bg-red-50 m-4 rounded-xl border border-red-200">
                        <Text className="text-red-700 text-center">{shiftsError}</Text>
                    </View>
                )}

                {/* Board Grid */}
                <View className="flex-1 relative">
                    {isOverlayLoading && (
                        <View className="absolute inset-0 bg-white/70 justify-center items-center z-10">
                            <ActivityIndicator size="large" color="#2563eb" />
                        </View>
                    )}

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View className="mx-2 my-2 p-2 rounded-xl border-[3px] border-gray-500">
                                {/* Table Header */}
                                <View className="flex-row border-b-2 border-slate-800 pb-2 mb-2" style={{ width: contentWidth }}>
                                    {weekDays.map((date, index) => {
                                        const dateObj = new Date(date);
                                        const dayName = dateObj.toLocaleDateString('he-IL', { weekday: 'short' });
                                        return (
                                            <React.Fragment key={date}>
                                                {/* Thin column separator */}
                                                {index > 0 && <View className="w-px bg-gray-500" />}
                                                <View className="flex-1 items-center justify-center mx-0.5">
                                                    <Text className="font-bold text-slate-700 text-xs">{dayName}</Text>
                                                    <Text className="text-[10px] text-slate-400">{date.split('-').reverse().join('/').substring(0, 5)}</Text>
                                                </View>
                                            </React.Fragment>
                                        );
                                    })}
                                </View>

                                {/* Table Body */}
                                {shifts.length === 0 && !isLoadingShifts ? (
                                    <Text className="text-center text-slate-500 mt-10">לא הוגדרו משמרות לסניף זה.</Text>
                                ) : (
                                    shifts.map(shift => (
                                        <View key={shift.id} className="mb-4 border-b border-gray-100 pb-3" style={{ width: contentWidth }}>
                                            {/* Shift Title Row */}
                                            <View className="py-1 px-1 mb-2 flex-row justify-between items-center">
                                                <Text className="font-bold text-slate-700 text-sm">{shift.name}</Text>
                                                <Text className="text-xs text-slate-300">{shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}</Text>
                                            </View>
                                            
                                            {/* Shift Cells Row */}
                                            <View className="flex-row justify-between w-full">
                                                {weekDays.map((date, index) => {
                                                    const cellData = getCellDisplay(date, shift.id);
                                                    return (
                                                        <React.Fragment key={`${date}-${shift.id}`}>
                                                            {/* Thin column separator */}
                                                            {index > 0 && <View className="w-px bg-gray-500" />}
                                                            <TouchableOpacity
                                                                onPress={() => toggleConstraint(date, shift.id)}
                                                                disabled={isOverlayLoading}
                                                                className={`flex-1 h-11 mx-0.5 rounded-md border items-center justify-center ${cellData.bgClass}`}
                                                            >
                                                                <Text className={`text-xs ${cellData.textClass}`}>{cellData.label}</Text>
                                                            </TouchableOpacity>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    ))
                                )}
                            </View>
                        </ScrollView>
                    </ScrollView>
                </View>
            
                {/* Weekly Note Input Section for Mobile */}
                <View className="px-2 py-1 mt-2">
                    <View className="bg-blue-50 p-1 rounded-xl border border-blue-100">
                        <TextInput
                            value={note || ''}
                            onChangeText={setNote} // React Native uses onChangeText instead of onChange
                            editable={!isOverlayLoading && !isSubmitting} // editable instead of disabled
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
            </KeyboardAwareScrollView>

            {/* Bottom Save Button - Kept OUTSIDE ScrollView; sticks to the top of the keyboard while typing */}
            <KeyboardStickyView>
                <View
                    className="p-4 bg-white border-t border-gray-200"
                    onLayout={e => setSaveBarHeight(e.nativeEvent.layout.height)}
                >
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={isSubmitting || isOverlayLoading || shifts.length === 0}
                        className={`flex-row justify-center items-center gap-2 p-4 rounded-xl ${
                            isSubmitting || isOverlayLoading || shifts.length === 0 ? 'bg-slate-300' : 'bg-emerald-600'
                        }`}
                    >
                        <Save size={20} color="white" />
                        <Text className="text-white font-bold text-lg">
                            {isSubmitting ? 'שומר נתונים...' : 'שמור אילוצים'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardStickyView>
        </View>
    );
}