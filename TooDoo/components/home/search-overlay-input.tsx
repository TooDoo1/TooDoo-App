import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_DEBOUNCE_MS = 200;

type Props = {
  /** Query owned by the home screen (tip taps, voice, clear can change it). */
  value: string;
  /** Debounced query for the home screen — fires at most once per pause in typing. */
  onQueryChange: (text: string) => void;
  /** Every keystroke, without re-rendering the parent (store it in a ref). */
  onDraftChange?: (text: string) => void;
  onSubmit: (text: string) => void;
  onClear: () => void;
  autoFocus?: boolean;
  placeholder: string;
  placeholderTextColor: string;
  iconColor: string;
  inputStyle: StyleProp<TextStyle>;
  slotStyle: StyleProp<ViewStyle>;
  clearButtonStyle: StyleProp<ViewStyle>;
  debounceMs?: number;
};

/**
 * Search field that keeps the typed text in local state, so typing re-renders only
 * this input instead of the whole home screen.
 */
function SearchOverlayInputComponent({
  value,
  onQueryChange,
  onDraftChange,
  onSubmit,
  onClear,
  autoFocus,
  placeholder,
  placeholderTextColor,
  iconColor,
  inputStyle,
  slotStyle,
  clearButtonStyle,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: Props) {
  const [draft, setDraft] = useState(value);
  const lastReportedRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (value === lastReportedRef.current) return;
    cancelPending();
    lastReportedRef.current = value;
    setDraft(value);
    onDraftChange?.(value);
  }, [cancelPending, onDraftChange, value]);

  useEffect(() => cancelPending, [cancelPending]);

  const report = useCallback(
    (text: string) => {
      cancelPending();
      if (text === lastReportedRef.current) return;
      lastReportedRef.current = text;
      onQueryChange(text);
    },
    [cancelPending, onQueryChange]
  );

  const handleChangeText = useCallback(
    (text: string) => {
      setDraft(text);
      onDraftChange?.(text);
      if (!text.trim()) {
        report(text);
        return;
      }
      cancelPending();
      timerRef.current = setTimeout(() => report(text), debounceMs);
    },
    [cancelPending, debounceMs, onDraftChange, report]
  );

  const handleSubmit = useCallback(() => {
    report(draft);
    onSubmit(draft);
  }, [draft, onSubmit, report]);

  const handleClear = useCallback(() => {
    cancelPending();
    lastReportedRef.current = '';
    setDraft('');
    onDraftChange?.('');
    onClear();
  }, [cancelPending, onClear, onDraftChange]);

  const hasText = Boolean(draft.trim());

  return (
    <>
      <View style={slotStyle}>
        <TextInput
          autoFocus={autoFocus}
          value={draft}
          onChangeText={handleChangeText}
          onSubmitEditing={handleSubmit}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          style={inputStyle}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <Pressable
        onPress={handleClear}
        style={[clearButtonStyle, { opacity: hasText ? 1 : 0 }]}
        pointerEvents={hasText ? 'auto' : 'none'}
        disabled={!hasText}
      >
        <Ionicons name="close-circle" size={24} color={iconColor} />
      </Pressable>
    </>
  );
}

export const SearchOverlayInput = memo(SearchOverlayInputComponent);
