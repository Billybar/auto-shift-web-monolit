import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView, useWindowDimensions, BackHandler, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAssignments, getSchedulePublication } from '../../../api/assignments';
import { fetchEmployeesByLocation, Employee } from '../../../api/employees';
import { getShiftDefinitions } from '../../../api/shiftDefinitions';
import { UserRole } from '../../types';
import type { Assignment, ShiftDefinition } from '../../types';
import { AssignmentChip } from '../../components/schedule/assignment-chip';
import { LocationSwitcher } from '../../components/location-switcher';
import { Sheet } from '../../components/ui/sheet';
import { ChipActionsSheet } from '../../components/schedule/chip-actions-sheet';
import { EmployeePickerSheet, type PickerEmployee } from '../../components/schedule/employee-picker-sheet';
import { HoursSheet, formatHoursRange } from '../../components/schedule/hours-sheet';
import { useAuth } from '../../hooks/useAuth';
import { useAppLocation } from '../../hooks/useLocation';
import {
  useScheduleEdits,
  assignmentsQueryKey,
  addAssignment,
  removeAssignment,
  replaceEmployee,
  exchangeAssignments,
  setAssignmentHours,
} from '../../hooks/useScheduleEdits';
import { Clock, User, ChevronRight, ChevronLeft, Maximize2, Minimize2, Pencil, Plus, X } from 'lucide-react-native';

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

// Times may arrive as "HH:MM" or "HH:MM:SS"
const toHHMM = (time: string) => time.slice(0, 5);

// Parse "YYYY-MM-DD" as a local date (new Date(str) would parse it as UTC midnight)
const parseDateStr = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toColor = (employee?: Employee) =>
  employee?.color ? (employee.color.startsWith('#') ? employee.color : `#${employee.color}`) : '#cbd5e1';

const isSameSlot = (a: Assignment, b: Assignment) =>
  a.employee_id === b.employee_id && a.shift_id === b.shift_id && a.date === b.date;

// What the edit sheet currently shows: a chip's actions, a picker (replace / add) or the hours editor
type ActiveSheet =
  | { type: 'actions' | 'replace' | 'hours'; slot: Assignment }
  | { type: 'add'; shiftId: number; date: string };

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
  // "Only me" dims everyone else's chips. Offered to anyone linked to an employee, including
  // managers/schedulers/admins who also work shifts. On by default only for employees,
  // since the other roles mostly need to see everyone.
  const canFocusOnMe = !!user?.employee_id;
  const [isOnlyMe, setIsOnlyMe] = useState(user?.role === UserRole.EMPLOYEE);

  // Only this screen can rotate, so the real orientation tells us if full-week mode is on
  const isLandscape = width > height;

  // The user's location (employees get theirs through user.locations when they are created)
  const { selectedLocationId, isLoadingLocations } = useAppLocation();
  const locationId = typeof selectedLocationId === 'number' ? selectedLocationId : 0;
  const hasLocation = locationId > 0;

  // Admins, managers and schedulers can make quick edits to a published week
  const canEdit = user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER || user?.role === UserRole.SCHEDULER;

  // Calculate the week range based on weekStart
  const weekRange = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return { start: formatDateStr(weekStart), end: formatDateStr(end) };
  }, [weekStart]);
  const week = { locationId, start: weekRange.start, end: weekRange.end };

  // Generate array of 7 dates for the grid headers
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  // 1. Fetch Assignments
  // The key is shared with useScheduleEdits, which updates this cache entry when saving
  const {
    data: assignments = [],
    isLoading: isLoadingAssignments,
    isFetching: isFetchingAssignments,
    refetch: refetchAssignments,
  } = useQuery({
    queryKey: assignmentsQueryKey(week),
    queryFn: () => getAssignments(locationId, weekRange.start, weekRange.end),
    enabled: hasLocation,
  });

  // 2. Fetch Employees (cached automatically by React Query)
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery({
    queryKey: ['employees', locationId],
    queryFn: () => fetchEmployeesByLocation(locationId),
    enabled: hasLocation,
  });

  // 3. Fetch Shift Definitions
  const { data: shiftDefs = [], isLoading: isLoadingShifts } = useQuery({
    queryKey: ['shiftDefinitions', locationId],
    queryFn: () => getShiftDefinitions(locationId),
    enabled: hasLocation,
  });

  // 4. Publish status (only editors need it: editing is allowed on published weeks only)
  const { data: publication, refetch: refetchPublication } = useQuery({
    queryKey: ['publication', locationId, weekRange.start],
    queryFn: () => getSchedulePublication(locationId, weekRange.start),
    enabled: canEdit && hasLocation,
  });
  const isPublished = publication?.is_published ?? false;

  const isLoading = isLoadingAssignments || isLoadingEmployees || isLoadingShifts;

  // --- Edit mode ---
  // Edit mode belongs to the week it was opened on, so changing week or location turns it off
  const weekKey = `${locationId}|${weekRange.start}`;
  const [editingWeekKey, setEditingWeekKey] = useState<string | null>(null);
  const [isStartingEdit, setIsStartingEdit] = useState(false);
  const [sheet, setSheet] = useState<ActiveSheet | null>(null);
  // First chip picked for an exchange; the next tapped chip is the other side
  const [exchangeSource, setExchangeSource] = useState<Assignment | null>(null);

  // Switching location (header picker) ends edit mode like switching week does, so coming back
  // to the first location doesn't resume editing without a fresh load
  const [editLocationId, setEditLocationId] = useState(locationId);
  if (editLocationId !== locationId) {
    setEditLocationId(locationId);
    setEditingWeekKey(null);
  }

  const isEditing = editingWeekKey === weekKey && isPublished;
  const activeSheet = isEditing ? sheet : null;
  const activeExchange = isEditing ? exchangeSource : null;

  const { apply, isSaving } = useScheduleEdits(week);
  // Block new edits while a save is running or the week is reloading after it
  const isBusy = isSaving || isFetchingAssignments;

  const stopEditing = () => {
    setEditingWeekKey(null);
    setSheet(null);
    setExchangeSource(null);
  };

  // Editing always starts from fresh data: reload the week and its publish status first
  const toggleEditing = async () => {
    if (isEditing) {
      stopEditing();
      return;
    }

    const key = weekKey;
    setIsStartingEdit(true);
    try {
      const [assignmentsResult, publicationResult] = await Promise.all([refetchAssignments(), refetchPublication()]);
      if (assignmentsResult.isError || publicationResult.isError) {
        Alert.alert('שגיאה', 'לא ניתן לרענן את הסידור. בדוק את החיבור ונסה שוב.');
        return;
      }
      if (!publicationResult.data?.is_published) {
        Alert.alert('לא ניתן לערוך', 'עריכה במובייל זמינה רק לסידור שפורסם. טיוטות עורכים באתר.');
        return;
      }
      setSheet(null);
      setExchangeSource(null);
      setEditingWeekKey(key);
    } finally {
      setIsStartingEdit(false);
    }
  };

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

  // --- Edit actions (each saves the week right away; destructive ones ask first) ---
  const fullName = (employeeId: number) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return `עובד ${employeeId}`;
    const { first, last } = getNameParts(employee);
    return `${first} ${last}`.trim();
  };

  // e.g. "יום ג׳ 06.10 · בוקר"
  const slotLabel = (shiftId: number, dateStr: string) => {
    const date = parseDateStr(dateStr);
    const day = date.toLocaleDateString('he-IL', { weekday: 'short' });
    const dayMonth = date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    return `${day} ${dayMonth} · ${shiftDefs.find(s => s.id === shiftId)?.name ?? ''}`;
  };

  const pickerEmployees: PickerEmployee[] = employees
    .filter(e => e.is_active !== false)
    .map(e => ({ id: e.id, name: fullName(e.id), color: toColor(e) }));

  const closeSheet = () => setSheet(null);

  // Outside an exchange a chip opens its actions; during one it is the other side of the exchange
  const handleChipPress = (assignment: Assignment) => {
    if (!activeExchange) {
      setSheet({ type: 'actions', slot: assignment });
      return;
    }

    const source = activeExchange;
    // Tapping the first chip again cancels the exchange
    if (isSameSlot(source, assignment)) {
      setExchangeSource(null);
      return;
    }

    Alert.alert(
      'החלפת משמרות',
      `להחליף בין ${fullName(source.employee_id)} (${slotLabel(source.shift_id, source.date)}) לבין ${fullName(assignment.employee_id)} (${slotLabel(assignment.shift_id, assignment.date)})?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'החלפה',
          onPress: () => {
            if (apply(current => exchangeAssignments(current, source, assignment))) setExchangeSource(null);
          },
        },
      ]
    );
  };

  // The confirmation opens over the sheet; the sheet closes only once the edit is accepted
  const confirmRemove = (slot: Assignment) => {
    Alert.alert('הסרה מהמשמרת', `להסיר את ${fullName(slot.employee_id)} מ${slotLabel(slot.shift_id, slot.date)}?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'הסרה',
        style: 'destructive',
        onPress: () => {
          if (apply(current => removeAssignment(current, slot))) closeSheet();
        },
      },
    ]);
  };

  const handleAddSelect = (shiftId: number, date: string, employeeId: number, sameDayShiftNames: string[]) => {
    const save = () => {
      if (apply(current => addAssignment(current, locationId, shiftId, date, employeeId))) closeSheet();
    };
    if (sameDayShiftNames.length === 0) {
      save();
      return;
    }
    Alert.alert(
      'העובד כבר משובץ היום',
      `${fullName(employeeId)} כבר משובץ היום ב${sameDayShiftNames.join(', ')}. להוסיף בכל זאת?`,
      [{ text: 'ביטול', style: 'cancel' }, { text: 'הוספה', onPress: save }]
    );
  };

  const handleReplaceSelect = (slot: Assignment, employeeId: number, sameDayShiftNames: string[]) => {
    const warning = sameDayShiftNames.length > 0
      ? `\n${fullName(employeeId)} כבר משובץ היום ב${sameDayShiftNames.join(', ')}.`
      : '';
    Alert.alert(
      'החלפת עובד',
      `להחליף את ${fullName(slot.employee_id)} ב${fullName(employeeId)} (${slotLabel(slot.shift_id, slot.date)})?${warning}`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'החלפה',
          onPress: () => {
            if (apply(current => replaceEmployee(current, slot, employeeId))) closeSheet();
          },
        },
      ]
    );
  };

  const handleHoursSave = (slot: Assignment, shift: ShiftDefinition, start: string, end: string) => {
    if (apply(current => setAssignmentHours(current, slot, start, end, { start: shift.start_time, end: shift.end_time }))) {
      closeSheet();
    }
  };

  const renderSheetContent = () => {
    if (!activeSheet) return null;

    if (activeSheet.type === 'add') {
      const { shiftId, date } = activeSheet;
      return (
        <EmployeePickerSheet
          title="הוספת עובד"
          details={slotLabel(shiftId, date)}
          employees={pickerEmployees}
          assignments={assignments}
          shiftDefs={shiftDefs}
          shiftId={shiftId}
          date={date}
          onSelect={(employeeId, sameDayShiftNames) => handleAddSelect(shiftId, date, employeeId, sameDayShiftNames)}
        />
      );
    }

    const { slot } = activeSheet;
    const shift = shiftDefs.find(s => s.id === slot.shift_id);
    if (!shift) return null;

    const start = toHHMM(slot.start_time || shift.start_time);
    const end = toHHMM(slot.end_time || shift.end_time);
    const details = slotLabel(slot.shift_id, slot.date);

    if (activeSheet.type === 'actions') {
      return (
        <ChipActionsSheet
          employeeName={fullName(slot.employee_id)}
          details={`${details} · ${formatHoursRange(start, end)}`}
          onReplace={() => setSheet({ type: 'replace', slot })}
          onExchange={() => {
            setSheet(null);
            setExchangeSource(slot);
          }}
          onHours={() => setSheet({ type: 'hours', slot })}
          onRemove={() => confirmRemove(slot)}
        />
      );
    }

    if (activeSheet.type === 'replace') {
      return (
        <EmployeePickerSheet
          title={`החלפת ${fullName(slot.employee_id)}`}
          details={details}
          employees={pickerEmployees}
          assignments={assignments}
          shiftDefs={shiftDefs}
          shiftId={slot.shift_id}
          date={slot.date}
          onSelect={(employeeId, sameDayShiftNames) => handleReplaceSelect(slot, employeeId, sameDayShiftNames)}
        />
      );
    }

    return (
      <HoursSheet
        employeeName={fullName(slot.employee_id)}
        details={details}
        initialStart={start}
        initialEnd={end}
        defaultStart={toHHMM(shift.start_time)}
        defaultEnd={toHHMM(shift.end_time)}
        onSave={(newStart, newEnd) => handleHoursSave(slot, shift, newStart, newEnd)}
        onCancel={closeSheet}
      />
    );
  };

  // Full-week mode must never leak to other screens: restore portrait on blur or unmount
  useFocusEffect(useCallback(() => lockPortrait, []));

  // Android back first cancels a pending exchange, then leaves edit mode, then full-week mode,
  // and only then leaves the screen
  useEffect(() => {
    if (!isLandscape && !isEditing) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // An open sheet is a Modal, which handles back itself
      if (activeExchange) setExchangeSource(null);
      else if (isEditing) setEditingWeekKey(null);
      else lockPortrait();
      return true;
    });
    return () => subscription.remove();
  }, [isLandscape, isEditing, activeExchange]);

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

  // Week Navigation Handlers (edit mode always restarts with a fresh load of the new week)
  const handlePrevWeek = () => {
    stopEditing();
    setWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    stopEditing();
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

  if (isLoading || isLoadingLocations) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!hasLocation) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <Text className="text-slate-500 text-lg">יש לבחור מיקום פעיל</Text>
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

  // A manager who also works shifts gets both "רק אני" and the edit toggle; in portrait the edit
  // toggle then drops its label (pencil only) so the bar still fits one row on common phones
  const isCompactEditButton = canFocusOnMe && !isLandscape;

  // The row is laid out LTR: view buttons on the left, week navigation grouped on the right
  // (reading RTL: previous week arrow, week date, next week arrow).
  // It wraps instead of overflowing when the buttons don't fit (narrow phones, draft badge).
  const navBar = (
    <View className={`bg-white flex-row flex-wrap gap-y-2 items-center justify-between px-4 border-b border-gray-200 ${isLandscape ? 'py-1' : 'py-4'}`}>
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
        {/* Edit toggle: reloads the week, then turns on edit mode (published weeks only) */}
        {canEdit && (
          <TouchableOpacity
            onPress={toggleEditing}
            disabled={isStartingEdit}
            className={`h-9 flex-row items-center justify-center gap-x-1 border rounded-lg ${isCompactEditButton ? 'w-9' : 'px-2.5'} ${isEditing ? 'bg-slate-900 border-slate-900' : 'bg-gray-50 border-gray-300'}`}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? 'סיום עריכה' : 'עריכה'}
            accessibilityState={{ selected: isEditing, busy: isStartingEdit }}
          >
            {isStartingEdit
              ? <ActivityIndicator size="small" color="#4b5563" />
              : <Pencil color={isEditing ? '#ffffff' : '#4b5563'} size={16} />}
            {!isCompactEditButton && (
              <Text className={`text-xs font-semibold ${isEditing ? 'text-white' : 'text-gray-600'}`}>
                {isEditing ? 'סיום' : 'עריכה'}
              </Text>
            )}
          </TouchableOpacity>
        )}
        {canEdit && publication && !isPublished && (
          <View className="h-9 justify-center px-2 rounded-lg bg-amber-100 border border-amber-200">
            <Text className="text-[11px] font-semibold text-amber-700">טיוטה</Text>
          </View>
        )}
        {/* The tab header (with its location picker) is hidden in landscape, so show the picker here */}
        {isLandscape && <LocationSwitcher />}
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

  // Shown under the navigation in edit mode: a reminder that saves are live, or the exchange prompt
  const editStrip = !isEditing ? null : activeExchange ? (
    <View className="flex-row items-center justify-between gap-x-2 px-4 py-2 bg-violet-50 border-b border-violet-200" style={{ direction: 'rtl' }}>
      <Text className="shrink text-xs font-semibold text-violet-800">
        בחר משמרת להחלפה עם {fullName(activeExchange.employee_id)} ({slotLabel(activeExchange.shift_id, activeExchange.date)})
      </Text>
      <TouchableOpacity
        onPress={() => setExchangeSource(null)}
        className="flex-row items-center gap-x-1 px-2 py-1 rounded-md bg-white border border-violet-200"
        accessibilityRole="button"
      >
        <X color="#5b21b6" size={14} />
        <Text className="text-xs font-semibold text-violet-800">ביטול</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View className="flex-row items-center gap-x-2 px-4 py-2 bg-amber-50 border-b border-amber-200" style={{ direction: 'rtl' }}>
      <Pencil color="#b45309" size={14} />
      <Text className="shrink text-xs font-semibold text-amber-800">מצב עריכה · שינויים נשמרים מיד ומוצגים לעובדים</Text>
      {isBusy && <ActivityIndicator size="small" color="#b45309" />}
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
                    const isMe = assignment.employee_id === user?.employee_id;

                    return (
                      <AssignmentChip
                        key={`assign-${assignment.employee_id}-${aIdx}`}
                        name={chipNames.get(assignment.employee_id) ?? ''}
                        color={toColor(employee)}
                        startTime={assignment.start_time}
                        endTime={assignment.end_time}
                        defaultStart={shift.start_time}
                        defaultEnd={shift.end_time}
                        isMe={isMe}
                        // Edit mode works on everyone's shifts, so "only me" dimming is paused while editing
                        isDimmed={canFocusOnMe && isOnlyMe && !isMe && !isEditing}
                        onPress={isEditing ? () => handleChipPress(assignment) : undefined}
                        disabled={isBusy}
                        isSelected={!!activeExchange && isSameSlot(activeExchange, assignment)}
                      />
                    );
                  })}
                  {/* Edit mode: add an employee to this shift (hidden while picking an exchange) */}
                  {isEditing && !activeExchange && (
                    <TouchableOpacity
                      onPress={() => setSheet({ type: 'add', shiftId: shift.id, date: dateStr })}
                      disabled={isBusy}
                      className="h-6 items-center justify-center rounded border border-dashed border-slate-300"
                      accessibilityRole="button"
                      accessibilityLabel={`הוספת עובד ל${slotLabel(shift.id, dateStr)}`}
                    >
                      <Plus color="#94a3b8" size={14} />
                    </TouchableOpacity>
                  )}
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
        // scrolls away (index 0) and the days row sticks to the top (index 1), with the edit strip above it.
        <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 24 }}>
          {navBar}
          <View className="bg-gray-50">
            {editStrip}
            <View style={{ direction: 'rtl', paddingHorizontal: 16 }}>{dayHeader}</View>
          </View>
          <View style={{ direction: 'rtl', paddingHorizontal: 16 }}>{shiftBlocks}</View>
        </ScrollView>
      ) : (
        <>
          {navBar}
          {editStrip}

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

      {/* One sheet for every edit step; its content changes with the step */}
      <Sheet visible={!!activeSheet} onClose={closeSheet}>
        {renderSheetContent()}
      </Sheet>
    </View>
  );
}