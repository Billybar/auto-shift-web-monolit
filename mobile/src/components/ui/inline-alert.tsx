import { View, Text, Pressable } from 'react-native';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';

export type AlertVariant = 'error' | 'warning' | 'info' | 'success';

// Same palette as the web's InlineAlert; the root Toaster uses it too
export const VARIANT_STYLES: Record<AlertVariant, { bg: string; border: string; text: string; iconColor: string; Icon: LucideIcon }> = {
  error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', iconColor: '#dc2626', Icon: CircleAlert },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', iconColor: '#d97706', Icon: TriangleAlert },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', iconColor: '#2563eb', Icon: Info },
  success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', iconColor: '#16a34a', Icon: CircleCheck },
};

type InlineAlertProps = {
  variant: AlertVariant;
  title?: string;
  children?: string;
  // e.g. { label: 'נסה שוב', onPress: reload }
  action?: { label: string; onPress: () => void };
  // Outer spacing for where it is placed
  className?: string;
};

// A message that belongs to a form or a screen region and stays until it's resolved (a form error,
// or a load failure shown in place of the content). Transient feedback goes through `notify` instead.
// Sets its own RTL direction, so its Hebrew text aligns right wherever it is placed.
export function InlineAlert({ variant, title, children, action, className = '' }: InlineAlertProps) {
  const { bg, border, text, iconColor, Icon } = VARIANT_STYLES[variant];

  return (
    <View
      // Errors and warnings are announced right away
      accessibilityRole={variant === 'error' || variant === 'warning' ? 'alert' : undefined}
      className={`flex-row items-start gap-x-2 p-3 rounded-xl border ${bg} ${border} ${className}`}
      style={{ direction: 'rtl' }}
    >
      <Icon color={iconColor} size={18} style={{ marginTop: 1 }} />
      <View className="flex-1 gap-y-1">
        {title && <Text className={`text-sm font-semibold ${text}`}>{title}</Text>}
        {children && <Text className={`text-sm ${text}`}>{children}</Text>}
        {action && (
          <Pressable
            onPress={action.onPress}
            className={`self-start mt-1 px-3 py-1.5 rounded-lg border bg-white active:opacity-70 ${border}`}
            accessibilityRole="button"
          >
            <Text className={`text-xs font-semibold ${text}`}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
