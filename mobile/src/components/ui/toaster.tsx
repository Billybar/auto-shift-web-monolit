import { useEffect, useSyncExternalStore } from 'react';
import { View, Text, Pressable, AccessibilityInfo, Platform } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toastStore } from '../../lib/notify';
import { VARIANT_STYLES } from './inline-alert';

// Draws the toasts sent through `notify`, at the top of the screen. Mounted once in the root layout.
// It is part of the app's window, so an open Modal (e.g. the Sheet) is drawn above it.
export function Toaster() {
  const toast = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    // Android reads it through the live region below; iOS has no live regions
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(toast.description ? `${toast.title}. ${toast.description}` : toast.title);
    }
    const timer = setTimeout(() => toastStore.dismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast]);

  const variantStyle = toast ? VARIANT_STYLES[toast.variant] : null;

  return (
    // box-none: only the toast itself takes touches, never the area around it
    <View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: insets.top + 8, left: insets.left + 12, right: insets.right + 12, zIndex: 1000 }}
    >
      {/* A replacement toast reuses this view (new text, no second animation), so toasts never stack */}
      {toast && variantStyle && (
        <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOutUp.duration(150)}>
          <Pressable
            onPress={() => toastStore.dismiss(toast.id)}
            className={`flex-row items-start gap-x-2 p-3 rounded-xl border shadow-md ${variantStyle.bg} ${variantStyle.border}`}
            style={{ direction: 'rtl' }}
            accessibilityRole={toast.variant === 'error' || toast.variant === 'warning' ? 'alert' : undefined}
            accessibilityHint="הקש כדי לסגור"
          >
            <variantStyle.Icon color={variantStyle.iconColor} size={20} />
            <View className="flex-1 gap-y-0.5">
              <Text className={`text-sm font-semibold ${variantStyle.text}`}>{toast.title}</Text>
              {toast.description && <Text className={`text-sm ${variantStyle.text}`}>{toast.description}</Text>}
            </View>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}
