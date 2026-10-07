import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView, useWindowDimensions, BackHandler } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAssignments } from '../../../api/assignments';
import { fetchEmployeesByLocation, Employee } from '../../../api/employees';
import { getShiftDefinitions } from '../../../api/shiftDefinitions';
import type { Assignment } from '../../types';
import { AssignmentChip } from '../../components/schedule/assignment-chip';
import { useAuth } from '../../hooks/useAuth';
import { Clock, User, ChevronRight, ChevronLeft, Maximize2, Minimize2 } from 'lucide-react-native';

// Narrowest day column that still fits "HH:MM - HH:MM" with highlighted parts
const MIN_COLUMN_WIDTH = 92;

// Thin line on the start side of every day but the first, so it falls between days in RTL or LTR
const daySeparator = (dayIdx: number) =>
  dayIdx > 0 ? { borderStartWidth: 1, borderColor: '#e2e8f0' } : undefined; // slate-200

// Split an employee's name into first/last, from the linked user or the fallback `name` field
const getNameParts = (employee: Employee): { first: string; last: string } => {
  if (employee.user?.first_name) return { first: employee.user.first_name, last: employee.user.last_name ?? '' };
  const [first, ...rest] = (employee.name ?? '').trim().split(' ');
  return { first: first || 'עובד', last: rest.join(' ') };
};

// Shortest start of `last` that none of `others` share, e.g. "כה." vs "כץ." for כהן / כץ.
// Uses the full last name (no dot) when nothing shorter is unique, e.g. identical last names.
const uniqueLastNamePrefix = (last: string, others: string[]): string => {
  for (let length = 1; length < last.length; length++) {
    const prefix = last.slice(0, length);
    if (others.every(other => other.slice(0, length) !== prefix)) return `${prefix}.`;
  }
  return last;
};

// Restore the app-wide portrait lock set in the root layout
const lockPortrait = () => {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
};

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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Managers/schedulers without a linked employee have no employee_id, so nothing is highlighted
  const { user } = useAuth();
  // "Only me" dims everyone else's chips; offered to employees only, and on by default
  const canFocusOnMe = user?.role === 'employee' && !!user.employee_id;
  const [isOnlyMe, setIsOnlyMe] = useState(true);

  // Only this screen can rotate, so the real orientation tells us if full-week mode is on
  const isLandscape = width > height;

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
    queryFn: () => getAssignments(locationId, weekRange.start, weekRange.end),
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

  // Chip label per employee: the first name, plus as many last-name letters as needed
  // to tell apart employees at this location with the same first name (e.g. "יוסי כ.", "יוסי כה.")
  const chipNames = useMemo(() => {
    const parts = employees.map(e => ({ id: e.id, ...getNameParts(e) }));

    const labels = new Map<number, string>();
    parts.forEach(({ id, first, last }) => {
      const sameFirstLastNames = parts.filter(p => p.id !== id && p.first === first).map(p => p.last);
      labels.set(id, sameFirstLastNames.length > 0 && last
        ? `${first} ${uniqueLastNamePrefix(last, sameFirstLastNames)}`
        : first);
    });
    return labels;
  }, [employees]);

  // Full-week mode must never leak to other screens: restore portrait on blur or unmount
  useFocusEffect(useCallback(() => lockPortrait, []));

  // Android back leaves full-week mode first, instead of leaving the screen
  useEffect(() => {
    if (!isLandscape) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      lockPortrait();
      return true;
    });
    return () => subscription.remove();
  }, [isLandscape]);

  // Forcing the lock (instead of unlocking) works even when the phone's rotation lock is on
  const toggleFullWeek = () => {
    if (isLandscape) {
      lockPortrait();
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    }
  };

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

  // Day columns are flex-1, so landscape simply fills the screen with the whole week.
  // Portrait sets the grid width so columns stay wide enough for the hours (~3-4 days visible)
  // and scrolls sideways. 32 = the grid's horizontal padding.
  // Use Math.floor to prevent sub-pixel rounding errors that cause edge clipping in RTL.
  const availableWidth = width - insets.left - insets.right - 32;
  const columnWidth = Math.max(Math.floor(availableWidth / 7), MIN_COLUMN_WIDTH);
  const gridTotalWidth = columnWidth * 7;

  // The row is laid out LTR: view buttons on the left, week navigation grouped on the right
  // (reading RTL: previous week arrow, week date, next week arrow)
  const navBar = (
    <View className={`bg-white flex-row items-center justify-between px-4 border-b border-gray-200 ${isLandscape ? 'py-1' : 'py-4'}`}>
      {/* View buttons: bordered so they read as tappable */}
      <View className="flex-row items-center gap-x-2">
        <TouchableOpacity
          onPress={toggleFullWeek}
          className="h-9 w-9 items-center justify-center bg-gray-50 border border-gray-300 rounded-lg"
          accessibilityRole="button"
          accessibilityLabel={isLandscape ? 'יציאה מתצוגת שבוע מלא' : 'תצוגת שבוע מלא'}
        >
          {isLandscape ? <Minimize2 color="#4b5563" size={18} /> : <Maximize2 color="#4b5563" size={18} />}
        </TouchableOpacity>
        {canFocusOnMe && (
          <TouchableOpacity
            onPress={() => setIsOnlyMe(prev => !prev)}
            className={`h-9 flex-row items-center gap-x-1 px-2.5 border rounded-lg ${isOnlyMe ? 'bg-slate-900 border-slate-900' : 'bg-gray-50 border-gray-300'}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isOnlyMe }}
          >
            <User color={isOnlyMe ? '#ffffff' : '#4b5563'} size={16} />
            <Text className={`text-xs font-semibold ${isOnlyMe ? 'text-white' : 'text-gray-600'}`}>רק אני</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Week navigation: one bordered group, same height as the view buttons */}
      <View className="h-9 flex-row items-center bg-gray-50 border border-gray-300 rounded-lg">
        <TouchableOpacity onPress={handleNextWeek} className="h-full px-2 justify-center" accessibilityLabel="השבוע הבא">
          <ChevronLeft color="#4b5563" size={20} />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-800 px-1">
          שבוע {weekStart.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
        </Text>
        <TouchableOpacity onPress={handlePrevWeek} className="h-full px-2 justify-center" accessibilityLabel="השבוע הקודם">
          <ChevronRight color="#4b5563" size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Table Header - Days (opaque background so it can stay sticky over the shifts).
  // mx-px mirrors the shift blocks' 1px border so the day lines line up with the cells below.
  // Today's day and date are colored amber (only when the shown week includes today).
  const todayStr = formatDateStr(new Date());
  const dayHeader = (
    <View className="flex-row mx-px bg-gray-50 border-b-2 border-slate-300 pt-2 pb-2">
      {weekDays.map((date, idx) => {
        const isToday = formatDateStr(date) === todayStr;
        return (
          <View key={`header-${idx}`} className="flex-1 items-center justify-center" style={daySeparator(idx)}>
            <Text className={`font-bold text-xs ${isToday ? 'text-amber-600' : 'text-slate-700'}`}>
              {date.toLocaleDateString('he-IL', { weekday: 'short' })}
            </Text>
            <Text className={`text-[10px] ${isToday ? 'text-amber-600' : 'text-slate-400'}`}>
              {date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
            </Text>
          </View>
        );
      })}
    </View>
  );

  // Table Body - Shifts
  const shiftBlocks = (
    <>
      {shiftDefs.map((shift) => (
        <View key={`shift-${shift.id}`} className="mb-1.5 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">

          {/* Shift Title Banner */}
          <View className="bg-slate-100 py-0.5 px-2 border-b border-slate-200 flex-row justify-between items-center">
            <Text className="font-bold text-slate-800 text-sm">{shift.name}</Text>
            <Text className="text-[10px] text-slate-500 font-medium">
              {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
            </Text>
          </View>
          
          {/* 7 Days Row */}
          {/* No horizontal padding here, so the cells line up with the day header columns */}
          <View className="flex-row min-h-[60px]">
            {weekDays.map((date, dayIdx) => {
              const dateStr = formatDateStr(date);
              // Filter assignments for this specific shift and date
              const cellAssignments = assignments.filter(
                a => a.shift_id === shift.id && a.date === dateStr
              );

              return (
                <View key={`cell-${shift.id}-${dayIdx}`} className="flex-1 px-0.5 py-1" style={daySeparator(dayIdx)}>
                  {cellAssignments.map((assignment, aIdx) => {
                    const employee = employees.find(e => e.id === assignment.employee_id);
                    const empColor = employee?.color?.startsWith('#')
                      ? employee.color
                      : `#${employee?.color || 'cbd5e1'}`;
                    const isMe = assignment.employee_id === user?.employee_id;

                    return (
                      <AssignmentChip
                        key={`assign-${assignment.employee_id}-${aIdx}`}
                        name={chipNames.get(assignment.employee_id) ?? ''}
                        color={empColor}
                        startTime={assignment.start_time}
                        endTime={assignment.end_time}
                        defaultStart={shift.start_time}
                        defaultEnd={shift.end_time}
                        isMe={isMe}
                        isDimmed={canFocusOnMe && isOnlyMe && !isMe}
                      />
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
    </>
  );

  return (
    <View
      className="flex-1 bg-gray-50"
      // The header is hidden in landscape and the notch moves to the side
      style={{ paddingLeft: insets.left, paddingRight: insets.right, paddingTop: isLandscape ? insets.top : 0 }}
    >
      {isLandscape ? (
        // Landscape: the whole week fits, so a single vertical scroll. The week navigation
        // scrolls away (index 0) and the days row sticks to the top (index 1).
        <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 24 }}>
          {navBar}
          <View className="bg-gray-50" style={{ direction: 'rtl', paddingHorizontal: 16 }}>{dayHeader}</View>
          <View style={{ direction: 'rtl', paddingHorizontal: 16 }}>{shiftBlocks}</View>
        </ScrollView>
      ) : (
        <>
          {navBar}

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
              <View className="pb-2" style={{ width: gridTotalWidth }}>
                {dayHeader}
                {shiftBlocks}
              </View>
            </ScrollView>
          </ScrollView>
        </>
      )}
    </View>
  );
}