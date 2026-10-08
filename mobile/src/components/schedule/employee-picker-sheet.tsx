import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Search } from 'lucide-react-native';
import type { Assignment, ShiftDefinition } from '../../types';

export type PickerEmployee = { id: number; name: string; color: string };

type EmployeePickerSheetProps = {
  title: string;
  // e.g. "ג׳ 06/10 · בוקר"
  details: string;
  // Active employees of the location, with full names and resolved colors
  employees: PickerEmployee[];
  // The whole week, used for the hints and the shift counts
  assignments: Assignment[];
  shiftDefs: ShiftDefinition[];
  shiftId: number;
  date: string;
  onSelect: (employeeId: number, sameDayShiftNames: string[]) => void;
};

// Sheet content for choosing an employee to add to a shift or to replace someone.
// Employees already in the shift are disabled; ones already working that day get a warning.
// Order: free that day first, then fewer shifts this week (like the web sidebar count), then name.
export function EmployeePickerSheet({ title, details, employees, assignments, shiftDefs, shiftId, date, onSelect }: EmployeePickerSheetProps) {
  const [query, setQuery] = useState('');
  const { height } = useWindowDimensions();

  const shiftName = (id: number) => shiftDefs.find(s => s.id === id)?.name ?? '';

  const rows = employees
    .filter(e => e.name.includes(query.trim()))
    .map(e => {
      const own = assignments.filter(a => a.employee_id === e.id);
      return {
        ...e,
        isInCell: own.some(a => a.shift_id === shiftId && a.date === date),
        sameDayShiftNames: own.filter(a => a.date === date && a.shift_id !== shiftId).map(a => shiftName(a.shift_id)),
        weekCount: own.length,
      };
    })
    .sort((a, b) =>
      Number(a.isInCell) - Number(b.isInCell)
      || Number(a.sameDayShiftNames.length > 0) - Number(b.sameDayShiftNames.length > 0)
      || a.weekCount - b.weekCount
      || a.name.localeCompare(b.name, 'he'));

  return (
    <View>
      <View className="items-start pb-3">
        <Text className="text-lg font-bold text-slate-900">{title}</Text>
        <Text className="text-sm text-slate-500 mt-0.5">{details}</Text>
      </View>

      <View className="flex-row items-center gap-x-2 px-3 mb-2 bg-slate-50 border border-slate-200 rounded-lg">
        <Search color="#94a3b8" size={16} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="חיפוש עובד..."
          placeholderTextColor="#94a3b8"
          className="flex-1 py-2.5 text-sm text-slate-800 text-right"
        />
      </View>

      <ScrollView style={{ maxHeight: height * 0.5 }} keyboardShouldPersistTaps="handled">
        {rows.map(row => {
          const hint = row.isInCell
            ? 'כבר במשמרת'
            : row.sameDayShiftNames.length > 0 ? `משובץ היום: ${row.sameDayShiftNames.join(', ')}` : '';

          return (
            <Pressable
              key={row.id}
              onPress={() => onSelect(row.id, row.sameDayShiftNames)}
              disabled={row.isInCell}
              className={`flex-row items-center gap-x-3 py-2.5 border-t border-slate-100 ${row.isInCell ? 'opacity-40' : 'active:bg-slate-50'}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: row.isInCell }}
            >
              <View className="w-5 h-5 rounded border border-slate-300" style={{ backgroundColor: row.color }} />
              <View className="flex-1 items-start">
                <Text className="text-base text-slate-800">{row.name}</Text>
                {hint !== '' && (
                  <Text className={`text-xs ${row.isInCell ? 'text-slate-500' : 'text-amber-600'}`}>{hint}</Text>
                )}
              </View>
              <Text className="text-xs text-slate-500">
                {row.weekCount === 1 ? 'משמרת אחת' : `${row.weekCount} משמרות`}
              </Text>
            </Pressable>
          );
        })}
        {rows.length === 0 && (
          <Text className="text-center text-slate-500 py-6">לא נמצאו עובדים</Text>
        )}
      </ScrollView>
    </View>
  );
}
