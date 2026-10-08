import type { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { RefreshCw, ArrowLeftRight, Clock, Trash2 } from 'lucide-react-native';

type ChipActionsSheetProps = {
  employeeName: string;
  // e.g. "ג׳ 06/10 · בוקר · 07:00 - 15:00"
  details: string;
  onReplace: () => void;
  onExchange: () => void;
  onHours: () => void;
  onRemove: () => void;
};

function ActionRow({ icon, label, onPress, isDestructive = false }: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  isDestructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-x-3 py-3.5 border-t border-slate-100 active:bg-slate-50"
      accessibilityRole="button"
    >
      {icon}
      <Text className={`text-base font-medium ${isDestructive ? 'text-red-600' : 'text-slate-800'}`}>{label}</Text>
    </Pressable>
  );
}

// Sheet content for a tapped chip: what can be done with this assignment
export function ChipActionsSheet({ employeeName, details, onReplace, onExchange, onHours, onRemove }: ChipActionsSheetProps) {
  return (
    <View>
      <View className="items-start pb-3">
        <Text className="text-lg font-bold text-slate-900">{employeeName}</Text>
        <Text className="text-sm text-slate-500 mt-0.5">{details}</Text>
      </View>
      <ActionRow icon={<RefreshCw color="#334155" size={20} />} label="החלפת עובד" onPress={onReplace} />
      <ActionRow icon={<ArrowLeftRight color="#334155" size={20} />} label="החלפה עם משמרת אחרת" onPress={onExchange} />
      <ActionRow icon={<Clock color="#334155" size={20} />} label="שינוי שעות" onPress={onHours} />
      <ActionRow icon={<Trash2 color="#dc2626" size={20} />} label="הסרה מהמשמרת" onPress={onRemove} isDestructive />
    </View>
  );
}
