import { useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { MapPin, ChevronDown, Check } from 'lucide-react-native';
import { useAppLocation } from '../hooks/useLocation';
import { Sheet } from './ui/sheet';

// Header button for users with access to more than one location (admins, multi-site managers).
// Shows the selected location; tapping opens a list to switch. Renders nothing when there is
// nothing to switch (e.g. employees, who belong to a single location).
export function LocationSwitcher() {
  const { selectedLocationId, setSelectedLocationId, availableLocations } = useAppLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { height } = useWindowDimensions();

  if (availableLocations.length <= 1) return null;

  const current = availableLocations.find(location => location.id === selectedLocationId);

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        className="h-9 mx-2 flex-row items-center gap-x-1 px-2.5 rounded-lg border border-gray-300 bg-gray-50 active:bg-gray-100"
        style={{ maxWidth: 170 }}
        accessibilityRole="button"
        accessibilityLabel={`החלפת אתר. אתר נוכחי: ${current?.name ?? 'לא נבחר'}`}
      >
        <MapPin color="#4b5563" size={14} />
        <Text numberOfLines={1} className="shrink text-xs font-semibold text-gray-700">
          {current?.name ?? 'בחר אתר'}
        </Text>
        <ChevronDown color="#4b5563" size={14} />
      </Pressable>

      <Sheet visible={isOpen} onClose={() => setIsOpen(false)}>
        <View className="items-start pb-3">
          <Text className="text-lg font-bold text-slate-900">בחירת אתר</Text>
        </View>
        <ScrollView style={{ maxHeight: height * 0.5 }}>
          {availableLocations.map(location => {
            const isSelected = location.id === selectedLocationId;
            return (
              <Pressable
                key={location.id}
                onPress={() => {
                  setSelectedLocationId(location.id);
                  setIsOpen(false);
                }}
                className="flex-row items-center justify-between py-3.5 border-t border-slate-100 active:bg-slate-50"
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text className={`text-base ${isSelected ? 'font-bold text-blue-600' : 'text-slate-800'}`}>
                  {location.name}
                </Text>
                {isSelected && <Check color="#2563eb" size={18} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
}
