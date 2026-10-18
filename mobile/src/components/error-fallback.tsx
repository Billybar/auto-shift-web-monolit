import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';

// Shown by expo-router when a route throws while rendering. The root layout and each tab screen
// export it as `ErrorBoundary`, so a crash in a tab keeps the tab bar working.
// The root layout's boundary renders outside the app's providers, so this uses no context.
export function ErrorFallback({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('Unhandled render error:', error);
  }, [error]);

  return (
    <View className="flex-1 items-center justify-center gap-y-4 p-8 bg-gray-50" style={{ direction: 'rtl' }} accessibilityRole="alert">
      <TriangleAlert color="#f59e0b" size={48} />
      <Text className="text-xl font-semibold text-gray-800 text-center">משהו השתבש</Text>
      <Text className="text-sm text-gray-500 text-center">
        אירעה שגיאה לא צפויה בתצוגה. נסה שוב, ואם זה חוזר סגור את האפליקציה ופתח אותה מחדש.
      </Text>
      <Pressable onPress={retry} className="px-5 py-2.5 rounded-lg bg-blue-600 active:bg-blue-700" accessibilityRole="button">
        <Text className="text-white font-semibold">נסה שוב</Text>
      </Pressable>
    </View>
  );
}
