// mobile/src/app/(tabs)/constraints.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { CalendarDays, Save } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuth'; // Adjust path to your mobile AuthContext
import { useAppLocation } from '../../hooks/useLocation'; // Adjust path to your mobile LocationContext
import { useWeeklyConstraints } from '../../hooks/useWeeklyConstraints';
import { useShiftDefinitions } from '../../hooks/useShiftDefinitions';

export default function ConstraintsScreen() {
    const { user } = useAuth();
    const { width } = useWindowDimensions(); // Used to stretch the table in landscape mode
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
        saveConstraints
    } = useWeeklyConstraints({ employeeId: user?.employee_id });

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
            {/* Header */}
            <View className="p-4 border-b border-gray-200">
                <View className="flex-row items-center gap-2 mb-4">
                    <CalendarDays size={24} color="#2563eb" />
                    <Text className="text-xl font-bold text-slate-800">הגשת אילוצים</Text>
                </View>
                
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

                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    className="flex-1"
                    contentContainerStyle={{ minWidth: width }}
                >
                    <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
                        <View className="p-2 flex-1">
                            {/* Table Header */}
                            <View className="flex-row border-b-2 border-slate-800 pb-2 mb-2">
                                <View className="w-16 shrink-0 justify-center">
                                    <Text className="font-bold text-slate-800 text-xs">משמרת</Text>
                                </View>
                                {weekDays.map(date => {
                                    const dateObj = new Date(date);
                                    const dayName = dateObj.toLocaleDateString('he-IL', { weekday: 'narrow' });
                                    return (
                                        <View key={date} className="flex-1 min-w-[44px] items-center justify-center">
                                            <Text className="font-bold text-slate-700 text-xs">{dayName}</Text>
                                            <Text className="text-[10px] text-slate-400">{date.split('-').reverse().join('/').substring(0, 5)}</Text>
                                        </View>
                                    );
                                })}
                            </View>

                            {/* Table Body */}
                            {shifts.length === 0 && !isLoadingShifts ? (
                                <Text className="text-center text-slate-500 mt-10">לא הוגדרו משמרות לסניף זה.</Text>
                            ) : (
                                shifts.map(shift => (
                                    <View key={shift.id} className="flex-row items-center border-b border-gray-100 py-1.5">
                                        {/* Shift Info */}
                                        <View className="w-16 shrink-0 justify-center">
                                            <Text className="font-bold text-slate-700 text-xs">{shift.name}</Text>
                                            <Text className="text-[10px] text-slate-400">{shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}</Text>
                                        </View>
                                        
                                        {/* Shift Cells */}
                                        {weekDays.map(date => {
                                            const cellData = getCellDisplay(date, shift.id);
                                            return (
                                                <View key={`${date}-${shift.id}`} className="flex-1 min-w-[44px] px-0.5">
                                                    <TouchableOpacity
                                                        onPress={() => toggleConstraint(date, shift.id)}
                                                        disabled={isOverlayLoading}
                                                        className={`w-full h-11 rounded-md border items-center justify-center ${cellData.bgClass}`}
                                                    >
                                                        <Text className={`text-xs ${cellData.textClass}`}>{cellData.label}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ))
                            )}
                        </View>
                    </ScrollView>
                </ScrollView>
            </View>

            {/* Bottom Save Button */}
            <View className="p-4 bg-white border-t border-gray-200">
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
        </View>
    );
}