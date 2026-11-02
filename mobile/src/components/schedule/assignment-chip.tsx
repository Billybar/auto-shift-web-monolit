import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

type AssignmentChipProps = {
  name: string;
  color: string;
  startTime?: string | null;
  endTime?: string | null;
  defaultStart: string;
  defaultEnd: string;
  isMe?: boolean;
  isDimmed?: boolean;
  // Edit mode: makes the chip tappable
  onPress?: () => void;
  disabled?: boolean;
  // Edit mode: the chip picked as the first side of an exchange
  isSelected?: boolean;
  // Edit mode: what the last edit did to this chip. 'removed' is a ghost of a shift no longer in the week
  status?: 'changed' | 'removed';
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

// Two quick emerald flashes over a chip the last edit just changed. Runs once when it mounts;
// Reanimated skips it when the phone's reduce-motion setting is on, leaving only the border
function ChangePulse() {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.set(withSequence(
      withTiming(0.45, { duration: 250 }),
      withTiming(0, { duration: 250 }),
      withTiming(0.45, { duration: 250 }),
      withTiming(0, { duration: 250 }),
    ));
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: '#34d399' /* emerald-400 */ }, style]}
    />
  );
}

// Assignment card for the weekly grid: employee name on top, hours below.
// The signed-in employee's own chips get a thin dark border so they are easy to spot
// (not blue, which already marks changed hours). In "only me" mode everyone else's chips are dimmed.
// Read-only unless `onPress` is given (edit mode); a selected chip gets a thick violet border.
// Edit mode also marks the last edit: the chips it changed get a thick emerald border (flashing as
// it appears), and a shift it removed stays as a faded ghost with a dashed red border.
export function AssignmentChip({
  name, color, startTime, endTime, defaultStart, defaultEnd,
  isMe = false, isDimmed = false, onPress, disabled = false, isSelected = false, status,
}: AssignmentChipProps) {
  const start = toHHMM(startTime || defaultStart);
  const end = toHHMM(endTime || defaultEnd);
  const isStartChanged = start !== toHHMM(defaultStart);
  const isEndChanged = end !== toHHMM(defaultEnd);
  const isChanged = status === 'changed';
  const isRemoved = status === 'removed';

  const borderClass = isSelected
    ? 'border-violet-600'
    : isChanged
      ? 'border-emerald-500'
      : isRemoved
        ? 'border-red-400 border-dashed'
        : isMe ? 'border-slate-900' : 'border-slate-300';

  const statusLabel = isChanged ? ' · שונה' : isRemoved ? ' · הוסר' : '';
  const accessibilityLabel = `${name} ${start} - ${end}${statusLabel}`;

  const chip = (
    <View
      className={`mb-1 rounded border overflow-hidden bg-white shadow-sm ${borderClass}`}
      style={[
        isDimmed && { opacity: 0.35 },
        isRemoved && { opacity: 0.5 },
        (isSelected || isChanged) && { borderWidth: 2 },
      ]}
      // A ghost is never tappable, so it carries its own label
      accessible={isRemoved}
      accessibilityLabel={isRemoved ? accessibilityLabel : undefined}
    >
      <View className="py-1 px-0.5 items-center justify-center" style={{ backgroundColor: color }}>
        <Text numberOfLines={1} className={`text-[11px] font-bold text-slate-900 ${isRemoved ? 'line-through' : ''}`}>
          {name}
        </Text>
      </View>
      {/* Force LTR so "start - end" reads correctly inside the RTL grid */}
      <View className="flex-row items-center justify-center bg-stone-200 py-0.5" style={{ direction: 'ltr' }}>
        <TimePart value={start} isChanged={isStartChanged} />
        <Text className="text-[10px] text-stone-400 mx-0.5">-</Text>
        <TimePart value={end} isChanged={isEndChanged} />
      </View>
      {isChanged && <ChangePulse />}
    </View>
  );

  if (!onPress) return chip;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: isSelected }}
    >
      {chip}
    </Pressable>
  );
}
