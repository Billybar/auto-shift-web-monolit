import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchAssignments, Assignment } from '../../../api/assignments';
import { fetchEmployeesByLocation, Employee } from '../../../api/employees';
import { getShiftDefinitions } from '../../../api/shiftDefinitions';
import { Clock, User, ChevronRight, ChevronLeft } from 'lucide-react-native';

// Helper to get the previous Sunday for the initial state
const getNextSunday = (): Date => {
  const today = new Date();
  const daysUntilSunday = today.getDay(); // 0 is Sunday
  const lastSunday = new Date(today);
  lastSunday.setDate(today.getDate() - daysUntilSunday);
  lastSunday.setHours(0, 0, 0, 0);
  return lastSunday;
};

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
  const [weekStart, setWeekStart] = useState<Date>(getNextSunday);
  const { width } = useWindowDimensions();

  // Hardcoded locationId for now
  const locationId = 3;

  // Calculate the week range based on weekStart
  const weekRange = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return { start: formatDateStr(weekStart), end: formatDateStr(end) };
  }, [weekStart]);

  // Generate array of 7 dates for the grid headers
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

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

  // Week Navigation Handlers
  const handlePrevWeek = () => {
    setWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 7);
      return next;
    });
  };

  // Helper to extract only the first name for grid display
  const getFirstName = (employee: Employee | undefined) => {
    if (!employee) return '';
    if (employee.user?.first_name) return employee.user.first_name;
    if (employee.name) return employee.name.split(' ')[0];
    return 'עובד';
  };


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

    

    return (
      <View>
        {/* Shift Row Container with explicit gap between cubes */}
        <View className="bg-white p-1 rounded-xl mb-1 shadow-sm border border-gray-100 flex-row items-center justify-between gap-x-4">
          
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
          <View className="flex-1 bg-slate-50 p-2 rounded-lg border border-slate-200">
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

  // Ensure horizontal scrolling feels spacious enough on narrow screens.
  // Use Math.floor to prevent sub-pixel rounding errors that cause edge clipping in RTL.
  const minRequiredWidth = Math.max(width - 16, 450); 
  const columnWidth = Math.floor(minRequiredWidth / 7);
  const gridTotalWidth = columnWidth * 7;

  return (
    <View className="flex-1 bg-gray-50">
      {/* Week Navigation Bar */}
      <View className="bg-white flex-row items-center justify-between px-4 py-4 border-b border-gray-200">
        <TouchableOpacity onPress={handleNextWeek} className="p-2 bg-gray-50 rounded-lg">
          <ChevronLeft color="#4b5563" size={24} />
        </TouchableOpacity>
        
        <View className="items-center">
          <Text className="text-base font-bold text-gray-800">
            שבוע {weekStart.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
          </Text>
        </View>

        <TouchableOpacity onPress={handlePrevWeek} className="p-2 bg-gray-50 rounded-lg">
          <ChevronRight color="#4b5563" size={24} />
        </TouchableOpacity>
      </View>

      {/* Weekly Grid */}
      {/* Added horizontal padding to the ScrollView content so it scrolls nicely at the edges */}
      {/* Weekly Grid */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        className="flex-1" 
        style={{ direction: 'rtl' }}
        // Increased padding to 16 to guarantee breathing room for the last border
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Use gridTotalWidth to perfectly match the 7 rounded columns */}
          <View className="py-2" style={{ width: gridTotalWidth }}>
            
            {/* Table Header - Days */}
            <View className="flex-row border-b-2 border-slate-300 pb-2 mb-3">
              {weekDays.map((date, idx) => (
                <View key={`header-${idx}`} className="items-center justify-center" style={{ width: columnWidth }}>
                  <Text className="font-bold text-slate-700 text-xs">
                    {date.toLocaleDateString('he-IL', { weekday: 'short' })}
                  </Text>
                  <Text className="text-[10px] text-slate-400">
                    {date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
                  </Text>
                </View>
              ))}
            </View>

            {/* Table Body - Shifts */}
            {shiftDefs.map((shift) => (
              <View key={`shift-${shift.id}`} className="mb-4 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                
                {/* Shift Title Banner */}
                <View className="bg-slate-100 py-1.5 px-3 border-b border-slate-200 flex-row justify-between items-center">
                  <Text className="font-bold text-slate-800 text-sm">{shift.name}</Text>
                  <Text className="text-[10px] text-slate-500 font-medium">
                    {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                  </Text>
                </View>
                
                {/* 7 Days Row */}
                <View className="flex-row p-1 min-h-[60px]">
                  {weekDays.map((date, dayIdx) => {
                    const dateStr = formatDateStr(date);
                    // Filter assignments for this specific shift and date
                    const cellAssignments = assignments.filter(
                      a => a.shift_id === shift.id && a.date === dateStr
                    );

                    return (
                      <View key={`cell-${shift.id}-${dayIdx}`} className="px-0.5 border-l border-slate-100 last:border-l-0" style={{ width: columnWidth }}>
                        {cellAssignments.map((assignment, aIdx) => {
                          const employee = employees.find(e => e.id === assignment.employee_id);
                          const firstName = getFirstName(employee);
                          const empColor = employee?.color?.startsWith('#') 
                            ? employee.color 
                            : `#${employee?.color || 'cbd5e1'}`;

                          return (
                            <View 
                              key={`assign-${assignment.employee_id}-${aIdx}`}
                              className="py-1 px-0.5 mb-1 rounded flex items-center justify-center shadow-sm"
                              style={{ backgroundColor: empColor }}
                            >
                              <Text 
                                numberOfLines={1} 
                                className="text-[10px] font-bold text-slate-900 truncate"
                              >
                                {firstName}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>

              </View>
            ))}
            
            {shiftDefs.length === 0 && !isLoading && (
              <Text className="text-center text-slate-500 mt-10">לא נמצאו משמרות לסניף זה.</Text>
            )}

          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}