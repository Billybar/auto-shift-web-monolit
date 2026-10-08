import { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import DateTimePicker from '@expo/ui/community/datetime-picker';

type HoursSheetProps = {
  employeeName: string;
  // e.g. "ג׳ 06/10 · בוקר"
  details: string;
  // All times are "HH:MM"
  initialStart: string;
  initialEnd: string;
  defaultStart: string;
  defaultEnd: string;
  onSave: (start: string, end: string) => void;
  onCancel: () => void;
};

// "start - end" wrapped in a left-to-right isolate, so it doesn't flip to "end - start" inside Hebrew text
export const formatHoursRange = (start: string, end: string) => `⁦${start} - ${end}⁩`;

// Wide enough for the compact "HH:MM" pill of the iOS time picker
const IOS_PICKER_WIDTH = 120;

const pad = (n: number) => String(n).padStart(2, '0');

const toDate = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const toHHMM = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

// iOS renders the native picker inline (it opens its own wheel when tapped).
// Android shows a dialog that opens on mount, so it is mounted only after the time button is tapped.
function TimeField({ label, value, isChanged, onChange }: {
  label: string;
  value: string;
  isChanged: boolean;
  onChange: (value: string) => void;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <View className="flex-row items-center justify-between py-3 border-t border-slate-100">
      <Text className="text-base text-slate-700">{label}</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={toDate(value)}
          mode="time"
          locale="he_IL"
          // The iOS picker only takes its height from the native view. Without a width it gets 0,
          // so the time pill overflows the row (cut off at the screen edge) and taps don't reach it.
          style={{ width: IOS_PICKER_WIDTH }}
          onValueChange={(_event, date) => onChange(toHHMM(date))}
        />
      ) : (
        <>
          <Pressable
            onPress={() => setIsDialogOpen(true)}
            className={`px-4 py-2 rounded-lg border ${isChanged ? 'bg-blue-500 border-blue-500' : 'bg-slate-50 border-slate-300'}`}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${value}`}
          >
            <Text className={`text-base font-semibold ${isChanged ? 'text-white' : 'text-slate-800'}`}>{value}</Text>
          </Pressable>
          {isDialogOpen && (
            <DateTimePicker
              value={toDate(value)}
              mode="time"
              is24Hour
              presentation="dialog"
              onValueChange={(_event, date) => {
                setIsDialogOpen(false);
                onChange(toHHMM(date));
              }}
              onDismiss={() => setIsDialogOpen(false)}
            />
          )}
        </>
      )}
    </View>
  );
}

// Sheet content for changing one assignment's hours. End before start is allowed (overnight shifts).
export function HoursSheet({ employeeName, details, initialStart, initialEnd, defaultStart, defaultEnd, onSave, onCancel }: HoursSheetProps) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);

  const isDefault = start === defaultStart && end === defaultEnd;

  // Nothing changed: just close, without saving the week
  const handleSave = () => {
    if (start === initialStart && end === initialEnd) onCancel();
    else onSave(start, end);
  };

  return (
    <View>
      <View className="items-start pb-3">
        <Text className="text-lg font-bold text-slate-900">שינוי שעות · {employeeName}</Text>
        <Text className="text-sm text-slate-500 mt-0.5">{details}</Text>
      </View>

      <TimeField label="התחלה" value={start} isChanged={start !== defaultStart} onChange={setStart} />
      <TimeField label="סיום" value={end} isChanged={end !== defaultEnd} onChange={setEnd} />

      <Pressable
        onPress={() => { setStart(defaultStart); setEnd(defaultEnd); }}
        disabled={isDefault}
        className={`py-3 border-t border-slate-100 items-start ${isDefault ? 'opacity-40' : ''}`}
        accessibilityRole="button"
      >
        <Text className="text-sm font-medium text-blue-600">
          איפוס לשעות המשמרת ({formatHoursRange(defaultStart, defaultEnd)})
        </Text>
      </Pressable>

      <View className="flex-row gap-x-3 mt-2">
        <Pressable
          onPress={handleSave}
          className="flex-1 items-center py-3 rounded-xl bg-emerald-600 active:bg-emerald-700"
          accessibilityRole="button"
        >
          <Text className="text-white font-bold text-base">שמירה</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          className="flex-1 items-center py-3 rounded-xl bg-slate-100 active:bg-slate-200"
          accessibilityRole="button"
        >
          <Text className="text-slate-700 font-semibold text-base">ביטול</Text>
        </Pressable>
      </View>
    </View>
  );
}
