import { useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'> & {
  wrapperClassName?: string;
  wrapperStyle?: StyleProp<ViewStyle>;
  toggleColor?: string;
};

export function PasswordInput({
  wrapperClassName = 'mt-2 flex-row items-center rounded-2xl border px-4 py-3',
  wrapperStyle,
  toggleColor,
  style,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View className={wrapperClassName} style={wrapperStyle}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        className="flex-1"
        style={[{ fontSize: 16, paddingVertical: 0 }, style]}
      />
      <Pressable
        onPress={() => setVisible((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Dölj lösenord' : 'Visa lösenord'}
        hitSlop={8}
        style={{ marginLeft: 8, padding: 2 }}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={22}
          color={toggleColor ?? '#9ca3af'}
        />
      </Pressable>
    </View>
  );
}
