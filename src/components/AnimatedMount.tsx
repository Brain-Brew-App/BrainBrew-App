import type { ReactNode } from 'react';
import { Animated, type ViewStyle, type StyleProp } from 'react-native';

import { duration as motionDuration, useEnterValue } from '../theme/motion';

interface AnimatedMountProps {
  children: ReactNode;
  /** Milliseconds to wait before entering. Used to stagger sibling rows. */
  delay?: number;
  /** Pixels to rise from. 0 fades in place. */
  distance?: number;
  ms?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fades and lifts its children in once, on mount. Transform + opacity only.
 *
 * The wrapper never sets pointerEvents, so children accept taps for the whole
 * duration — an entering element is never a dead element.
 */
export function AnimatedMount({
  children,
  delay = 0,
  distance = 12,
  ms = motionDuration.enter,
  style,
}: AnimatedMountProps) {
  const enter = useEnterValue(delay, ms);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
