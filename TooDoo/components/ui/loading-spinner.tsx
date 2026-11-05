import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

type LoadingSpinnerProps = {
  /** Optional muted label under the spinner. */
  label?: string;
  /** `inline` for section placeholders; `screen` for full-area centers. */
  variant?: 'inline' | 'screen';
  size?: 'small' | 'large';
  color?: string;
  style?: StyleProp<ViewStyle>;
};

/** Shared spinning circle used whenever content is still loading. */
export function LoadingSpinner({
  label,
  variant = 'inline',
  size = 'small',
  color,
  style,
}: LoadingSpinnerProps) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const spinnerColor = color ?? theme.text;

  return (
    <View
      style={[
        styles.base,
        variant === 'screen' ? styles.screen : styles.inline,
        style,
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Laddar'}
    >
      <ActivityIndicator size={size} color={spinnerColor} />
      {label ? (
        <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inline: {
    paddingVertical: 16,
  },
  screen: {
    flex: 1,
    minHeight: 160,
    paddingVertical: 36,
  },
  label: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
