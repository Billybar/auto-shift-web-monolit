import type { ReactNode } from 'react';
import { Modal, View, Pressable, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

// Widest the panel gets in landscape, so it doesn't stretch across the screen (or under a side nav bar)
const LANDSCAPE_MAX_WIDTH = 560;

// Bottom panel over a dimmed backdrop. The schedule screen uses a single Sheet and swaps its content
// (actions -> picker -> hours) instead of opening a second Modal: iOS refuses to present a Modal
// while another one is still closing.
export function Sheet({ visible, onClose, children }: SheetProps) {
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
      {/* On Android the Modal is its own window drawn behind the system bars, so it measures its own
          insets instead of reusing the screen's. No initialMetrics: the startup (portrait) values would be
          wrong for the first frame in landscape, and the fade hides the one-frame wait for measuring. */}
      <SafeAreaProvider>
        <SheetBody onClose={onClose}>{children}</SheetBody>
      </SafeAreaProvider>
    </Modal>
  );
}

function SheetBody({ onClose, children }: Omit<SheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Tapping the dimmed area (above the panel, or beside it in landscape) closes the sheet */}
      <Pressable style={StyleSheet.absoluteFill} className="bg-black/40" onPress={onClose} accessibilityLabel="סגירה" />
      {/* Side insets keep the panel clear of a side nav bar or notch in landscape.
          box-none lets taps on the empty area reach the backdrop. */}
      <View
        className="flex-1 justify-end"
        style={{ paddingLeft: insets.left, paddingRight: insets.right }}
        pointerEvents="box-none"
      >
        <View
          className="bg-white rounded-t-2xl pt-2 px-4"
          style={{
            direction: 'rtl',
            width: '100%',
            alignSelf: 'center',
            maxWidth: isLandscape ? LANDSCAPE_MAX_WIDTH : undefined,
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View className="self-center w-10 h-1 rounded-full bg-slate-300 mb-3" />
          {children}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
