import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

/**
 * Motion tokens. Everything animates transform or opacity only — never layout,
 * never colour interpolation on a hot path. Nothing here blocks input: an
 * animation may run while the element beneath it is already tappable.
 *
 * The native driver is skipped on web, where react-native-web has no native
 * animation thread and would warn on every call.
 */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export const duration = {
  /** Press in/out — must feel instant. */
  press: 90,
  /** Element entering the screen. */
  enter: 260,
  /** Screen or puzzle swapping. */
  transition: 320,
  /** BrewScore count-up. */
  count: 900,
  /** The one celebration beat, for high scores only. */
  celebrate: 620,
} as const;

export const easing = {
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.quad),
} as const;

/** Stagger step for sequential row reveals. */
export const STAGGER_MS = 70;

/**
 * True when the OS asks for reduced motion. On web this maps to the
 * `prefers-reduced-motion` media query. Callers must jump straight to the end
 * state rather than shortening the animation.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  return reduced;
}

/**
 * A 0→1 value that runs once on mount. Returns 1 immediately under reduced
 * motion, so the element is simply present rather than animating faster.
 */
export function useEnterValue(delay = 0, ms: number = duration.enter): Animated.Value {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      value.setValue(1);
      return;
    }
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: ms,
      delay,
      easing: easing.out,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, ms, reduced, value]);

  return value;
}

/**
 * Press feedback: a small spring on scale. Returned handlers are additive —
 * the caller still owns onPress.
 */
export function usePressScale(to = 0.97) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (toValue: number) => {
    if (reduced) return;
    Animated.spring(scale, {
      toValue,
      speed: 40,
      bounciness: 4,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  };

  return {
    scale,
    onPressIn: () => spring(to),
    onPressOut: () => spring(1),
  };
}
