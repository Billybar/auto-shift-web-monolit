import type { ReactNode } from 'react';
import { Modal, View, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

// Bottom panel over a dimmed backdrop. The schedule screen uses a single Sheet and swaps its content
// (actions -> picker -> hours) instead of opening a second Modal: iOS refuses to present a Modal
// while another one is still closing.
export function Sheet({ visible, onClose, children }: SheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // The schedule screen can be in landscape (full-week mode)
      supportedOrientations={['portrait', 'landscape']}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Tapping the dimmed area closes the sheet */}
        <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="סגירה" />
        <View
          className="bg-white rounded-t-2xl pt-2"
          style={{
            direction: 'rtl',
            paddingBottom: insets.bottom + 12,
            paddingLeft: Math.max(insets.left, 16),
            paddingRight: Math.max(insets.right, 16),
          }}
        >
          <View className="self-center w-10 h-1 rounded-full bg-slate-300 mb-3" />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
