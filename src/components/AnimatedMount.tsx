import type { ReactNode } from 'react';
import { Animated, type ViewProps, type ViewStyle, type StyleProp } from 'react-native';

import { duration as motionDuration, useEnterValue } from '../theme/motion';

/**
 * Accessibility props are forwarded (7K). This wrapper sits around most of the
 * app's content, so if it swallows them, nothing underneath can ever announce —
 * which is exactly why TalkBack was silent for every result, error and loading
 * state in the app.
 */
type ForwardedA11yProps = Pick<
  ViewProps,
  'accessible' | 'accessibilityLabel' | 'accessibilityRole' | 'accessibilityLiveRegion' | 'accessibilityState' | 'importantForAccessibility'
>;

interface AnimatedMountProps extends ForwardedA11yProps {
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
  ...a11y
}: AnimatedMountProps) {
  const enter = useEnterValue(delay, ms);

  return (
    <Animated.View
      {...a11y}
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
