import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchAssignments, Assignment } from '../../../api/assignments';
import { fetchEmployeesByLocation, Employee } from '../../../api/employees';
import { getShiftDefinitions } from '../../../api/shiftDefinitions';
import { Clock, User, ChevronRight, ChevronLeft } from 'lucide-react-native';

// Helper function to format Date to YYYY-MM-DD for backend comparison
const formatDateStr = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to get the start and end of the week (Sunday to Saturday) for fetching
const getWeekRange = (date: Date) => {
  const sunday = new Date(date);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(saturday.getDate() + 6);
  
  return { start: formatDateStr(sunday), end: formatDateStr(saturday) };
};

// Helper to sort shifts logically: Morning -> Evening -> Night
const getShiftOrderPriority = (name: string): number => {
  const lower = name.toLowerCase();
  if (lower.includes('בוקר') || lower.includes('morning')) return 1;
  if (lower.includes('ערב') || lower.includes('evening')) return 2;
  if (lower.includes('לילה') || lower.includes('night')) return 3;
  return 4; // Fallback for custom names
};

export default function ScheduleScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Hardcoded locationId for now
  const locationId = 3;

  // Calculate the week range based on the currently selected day
  // This allows us to fetch the whole week once, and flip through days locally
  const weekRange = useMemo(() => getWeekRange(currentDate), [currentDate]);

  // 1. Fetch Assignments
  const { data: assignments = [], isLoading: isLoadingAssignments, refetch: refetchAssignments } = useQuery({
    queryKey: ['assignments', locationId, weekRange.start, weekRange.end],
    queryFn: () => fetchAssignments(locationId, weekRange.start, weekRange.end),
  });

  // 2. Fetch Employees (cached automatically by React Query)
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery({
    queryKey: ['employees', locationId],
    queryFn: () => fetchEmployeesByLocation(locationId),
  });

  // 3. Fetch Shift Definitions
  const { data: shiftDefs = [], isLoading: isLoadingShifts } = useQuery({
    queryKey: ['shiftDefinitions', locationId],
    queryFn: () => getShiftDefinitions(locationId),
  });

  const isLoading = isLoadingAssignments || isLoadingEmployees || isLoadingShifts;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchAssignments();
    setRefreshing(false);
  };

  // Day Navigation Handlers
  const handlePrevDay = () => {
    setCurrentDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return next;
    });
  };

  const handleNextDay = () => {
    setCurrentDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  // Filter assignments for the specifically selected day
  const targetDateStr = formatDateStr(currentDate);

  const dailyAssignments = assignments
  .filter(a => a.date === targetDateStr)
  .sort((a, b) => {
    const shiftA = shiftDefs.find(s => s.id === a.shift_id);
    const shiftB = shiftDefs.find(s => s.id === b.shift_id);
    return getShiftOrderPriority(shiftA?.name || '') - getShiftOrderPriority(shiftB?.name || '');
  });


  // Check if current item belongs to a different shift than the previous one
  const renderShiftCard = ({ item, index }: { item: Assignment; index: number }) => {
    const shift = shiftDefs.find(s => s.id === item.shift_id);
    const employee = employees.find(e => e.id === item.employee_id);
    
    const shiftName = shift?.name || `Shift ${item.shift_id}`;
    const employeeName = employee?.user 
      ? `${employee.user.first_name} ${employee.user.last_name}` 
      : employee?.name || `Employee ${item.employee_id}`;

    const employeeColor = employee?.color 
      ? (employee.color.startsWith('#') ? employee.color : `#${employee.color}`) 
      : '#cbd5e1';

    // Check if we crossed to a new shift type compared to the previous item
    const prevItem = index > 0 ? dailyAssignments[index - 1] : null;
    const isNewShiftGroup = prevItem && prevItem.shift_id !== item.shift_id;

    return (
      <View>
        {/* Visual separator line between different shift types (e.g., Morning -> Evening) */}
        {isNewShiftGroup && (
          <View className="flex-row items-center my-4">
            {/* Thicker and clearer separator line between shift groups */}
            <View className="flex-1 h-[6px] bg-slate-300 rounded-full" />
          </View>
        )}

        {/* Shift Row Container with explicit gap between cubes */}
        <View className="bg-white p-3 rounded-xl mb-3 shadow-sm border border-gray-100 flex-row items-center justify-between gap-x-4">
          
          {/* Left Cube: Fully Colored Employee Name Block */}
          <View 
            className="flex-1 p-3 rounded-lg border border-slate-200 items-center justify-center shadow-sm min-h-[4rem]"
            style={{ backgroundColor: employeeColor }}
          >
            <Text className="text-base font-bold text-slate-900 text-center truncate px-1">
              {employeeName}
            </Text>
          </View>

          {/* Right Cube: Shift Name & Hours */}
          <View className="flex-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <Text className="text-base font-bold text-slate-900 text-right">
              {shiftName}
            </Text>
            <View className="flex-row items-center justify-end mt-1">
              <Text className="text-xs text-slate-500 ml-1">
                {shift?.start_time} - {shift?.end_time}
              </Text>
              <Clock color="#64748b" size={14} />
            </View>
          </View>

        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Date Navigation Bar */}
      <View className="bg-white flex-row items-center justify-between px-4 py-4 border-b border-gray-200">
        <TouchableOpacity onPress={handleNextDay} className="p-2 bg-gray-50 rounded-lg">
          <ChevronLeft color="#4b5563" size={24} />
        </TouchableOpacity>
        
        <View className="items-center">
          <Text className="text-lg font-bold text-gray-800">
            {currentDate.toLocaleDateString('he-IL', { weekday: 'long' })}
          </Text>
          <Text className="text-sm text-gray-500">
            {currentDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </Text>
        </View>

        <TouchableOpacity onPress={handlePrevDay} className="p-2 bg-gray-50 rounded-lg">
          <ChevronRight color="#4b5563" size={24} />
        </TouchableOpacity>
      </View>

      {/* Shifts List */}
      <FlatList
        className="px-4 pt-4"
        data={dailyAssignments}
        keyExtractor={(item) => `${item.shift_id}-${item.date}-${item.employee_id}`}
        renderItem={({ item, index }) => renderShiftCard({ item, index })}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
        }
        ListEmptyComponent={
          <View className="items-center justify-center mt-20">
            <Text className="text-gray-500 text-base">אין משמרות ביום זה.</Text>
          </View>
        }
      />
    </View>
  );
}