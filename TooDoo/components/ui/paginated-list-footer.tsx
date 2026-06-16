import { Pressable, Text, View } from 'react-native';

import { SEE_ALL_PAGE_SIZE } from '@/lib/paginated-list';
import { uiTheme } from '@/lib/ui-theme';

type PaginatedListFooterProps = {
  page: number;
  totalPages: number;
  totalCount: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  theme: ReturnType<typeof uiTheme>;
};

export function PaginatedListFooter({
  page,
  totalPages,
  totalCount,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  theme,
}: PaginatedListFooterProps) {
  if (totalCount <= SEE_ALL_PAGE_SIZE) {
    return null;
  }

  const start = page * SEE_ALL_PAGE_SIZE + 1;
  const end = Math.min((page + 1) * SEE_ALL_PAGE_SIZE, totalCount);

  return (
    <View className="mt-6 mb-2">
      <Text className="mb-3 text-center text-sm" style={{ color: theme.textMuted }}>
        Visar {start}–{end} av {totalCount}
      </Text>
      <View className="flex-row items-center justify-between gap-3">
        <Pressable
          onPress={onPrevious}
          disabled={!canGoPrevious}
          className="flex-1 rounded-2xl px-4 py-3"
          style={{
            backgroundColor: theme.cardBg,
            borderWidth: 1,
            borderColor: theme.border,
            opacity: canGoPrevious ? 1 : 0.45,
          }}
        >
          <Text className="text-center font-medium" style={{ color: theme.text }}>
            Föregående
          </Text>
        </Pressable>
        <Text className="text-sm font-medium" style={{ color: theme.textMuted }}>
          {page + 1}/{totalPages}
        </Text>
        <Pressable
          onPress={onNext}
          disabled={!canGoNext}
          className="flex-1 rounded-2xl px-4 py-3"
          style={{
            backgroundColor: theme.cardBg,
            borderWidth: 1,
            borderColor: theme.border,
            opacity: canGoNext ? 1 : 0.45,
          }}
        >
          <Text className="text-center font-medium" style={{ color: theme.text }}>
            Nästa
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
