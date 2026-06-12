import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

export function ProfileMenuRow({
  label,
  description,
  icon,
  onPress,
  isLast = false,
}: {
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-4"
      style={{
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.border,
      }}
    >
      <View
        className="mr-3 h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.cardBgMuted }}
      >
        <Ionicons name={icon} size={18} color={theme.text} />
      </View>
      <View className="flex-1 pr-2">
        <Text className="text-base font-medium" style={{ color: theme.text }}>
          {label}
        </Text>
        {description ? (
          <Text className="mt-0.5 text-sm" style={{ color: theme.textMuted }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
    </Pressable>
  );
}
