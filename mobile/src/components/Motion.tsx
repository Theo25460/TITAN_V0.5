/* Small, purposeful motion: content that arrives in order, numbers that count up. Both are instant with reduced motion. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "../lib/motion";
import { T, type TProps } from "./Text";

/** Fades and lifts its children in, `order` steps after the screen appears (90 ms per step). */
export function Reveal({ order = 0, children, style }: { order?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    const a = Animated.timing(v, { toValue: 1, duration: 360, delay: 120 + order * 90, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [order, reduced, v]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>{children}</Animated.View>;
}

/** A number that counts from `from` to `value`; screen readers get the final value only. */
export function CountUp({ value, from = 0, format, duration = 900, delay = 200, ...text }: Omit<TProps, "children"> & { value: number; from?: number; format: (n: number) => string; duration?: number; delay?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : from);
  useEffect(() => {
    if (reduced || value === from) {
      setShown(value);
      return;
    }
    const v = new Animated.Value(from);
    const id = v.addListener(({ value: n }) => setShown(Math.round(n)));
    const a = Animated.timing(v, { toValue: value, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start(() => setShown(value));
    return () => {
      a.stop();
      v.removeListener(id);
    };
  }, [value, from, duration, delay, reduced]);
  return (
    <T {...text} accessibilityLabel={format(value)}>
      {format(shown)}
    </T>
  );
}
