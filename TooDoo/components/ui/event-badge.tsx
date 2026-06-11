import { Text, View } from 'react-native';

export function EventBadge({ backgroundColor }: { backgroundColor: string }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        backgroundColor,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '600', color: '#ffffff' }}>Event</Text>
    </View>
  );
}
