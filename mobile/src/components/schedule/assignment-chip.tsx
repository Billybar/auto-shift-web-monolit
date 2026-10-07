import { View, Text } from 'react-native';

type AssignmentChipProps = {
  name: string;
  color: string;
  startTime?: string | null;
  endTime?: string | null;
  defaultStart: string;
  defaultEnd: string;
  isMe?: boolean;
};

// Times may arrive as "HH:MM" or "HH:MM:SS"; compare and display as "HH:MM"
const toHHMM = (time: string) => time.slice(0, 5);

// One time value, highlighted in blue when it differs from the shift default (same rule as the web HoursBox)
function TimePart({ value, isChanged }: { value: string; isChanged: boolean }) {
  return (
    <View className={isChanged ? 'bg-blue-500 rounded px-1' : 'px-0.5'}>
      <Text className={`text-[10px] leading-tight ${isChanged ? 'text-white font-semibold' : 'text-stone-500'}`}>
        {value}
      </Text>
    </View>
  );
}

// Read-only assignment card for the weekly grid: employee name on top, hours below.
// The signed-in employee's own chips get a thick dark ring so they are easy to spot
// (not blue, which already marks changed hours).
export function AssignmentChip({ name, color, startTime, endTime, defaultStart, defaultEnd, isMe = false }: AssignmentChipProps) {
  const start = toHHMM(startTime || defaultStart);
  const end = toHHMM(endTime || defaultEnd);
  const isStartChanged = start !== toHHMM(defaultStart);
  const isEndChanged = end !== toHHMM(defaultEnd);

  return (
    <View className={`mb-1 rounded overflow-hidden bg-white shadow-sm ${isMe ? 'border-2 border-slate-900' : 'border border-slate-300'}`}>
      <View className="py-1 px-0.5 items-center justify-center" style={{ backgroundColor: color }}>
        <Text numberOfLines={1} className="text-[11px] font-bold text-slate-900">
          {name}
        </Text>
      </View>
      {/* Force LTR so "start - end" reads correctly inside the RTL grid */}
      <View className="flex-row items-center justify-center bg-stone-200 py-0.5" style={{ direction: 'ltr' }}>
        <TimePart value={start} isChanged={isStartChanged} />
        <Text className="text-[10px] text-stone-400 mx-0.5">-</Text>
        <TimePart value={end} isChanged={isEndChanged} />
      </View>
    </View>
  );
}
