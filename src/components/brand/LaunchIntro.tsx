import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { duration, easing, STAGGER_MS, USE_NATIVE_DRIVER, useReducedMotion } from '../../theme/motion';

const CHARACTER = require('../../../assets/splash-character.png');
const MOTION_LINES = require('../../../assets/splash-motion-lines.png');

interface LaunchIntroProps {
  /** Called once the entrance has finished (or immediately under reduced motion). */
  onFinish: () => void;
  size?: number;
}

/**
 * The one-time brand flourish shown right after the native splash hands off
 * to JS: the mascot settles into frame while its own motion-line strokes
 * catch up a beat behind it. Two PNG layers segmented from the same source
 * art (see docs/BRAND_GUIDELINE.md §5), animated independently — no new art,
 * transform + opacity only.
 *
 * Plays once, then calls onFinish. Deliberately not a loop: Phase 0 has
 * nothing actually loading behind it, so a real loading spinner would be
 * dishonest — this is a brand beat, not a progress indicator.
 */
export function LaunchIntro({ onFinish, size = 220 }: LaunchIntroProps) {
  const reduced = useReducedMotion();
  const characterProgress = useRef(new Animated.Value(0)).current;
  const linesProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      characterProgress.setValue(1);
      linesProgress.setValue(1);
      const timer = setTimeout(onFinish, 200);
      return () => clearTimeout(timer);
    }

    const anim = Animated.parallel([
      Animated.timing(characterProgress, {
        toValue: 1,
        duration: duration.celebrate,
        easing: easing.out,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(linesProgress, {
        toValue: 1,
        duration: duration.transition,
        delay: STAGGER_MS * 2,
        easing: easing.out,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);
    anim.start();

    const timer = setTimeout(onFinish, duration.celebrate + 220);
    return () => {
      anim.stop();
      clearTimeout(timer);
    };
    // Runs once on mount; onFinish is a stable route-change callback, not a
    // value this entrance should restart for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      <Animated.Image
        source={MOTION_LINES}
        resizeMode="contain"
        style={[
          styles.layer,
          {
            opacity: linesProgress,
            transform: [
              {
                translateX: linesProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-16, 0],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.Image
        source={CHARACTER}
        resizeMode="contain"
        style={[
          styles.layer,
          {
            opacity: characterProgress,
            transform: [
              {
                scale: characterProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.9, 1],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'center', position: 'relative' },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
});
