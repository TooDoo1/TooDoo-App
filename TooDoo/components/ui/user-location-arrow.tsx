import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  USER_LOCATION_ARROW_COLOR,
  USER_LOCATION_ARROW_COLOR_DARK,
} from '@/lib/map-user-location';

/** Native map marker: small two-tone triangle with a bottom indent. */
export function UserLocationArrow() {
  return (
    <View style={styles.wrap} accessibilityLabel="Din plats">
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Path d="M11 2 L11 15.5 L4 19.5 Z" fill={USER_LOCATION_ARROW_COLOR_DARK} />
        <Path d="M11 2 L18 19.5 L11 15.5 Z" fill={USER_LOCATION_ARROW_COLOR} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
