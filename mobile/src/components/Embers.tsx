import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useReducedMotion } from "../lib/motion";
import { colors } from "../theme/tokens";

/** A small deterministic generator, so a burst looks the same for the same `seed` (and tests are stable). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Ember = { x: number; rise: number; drift: number; size: number; delay: number; duration: number; color: string };

export function emberPlan(count: number, seed: number, palette: string[], spread = 120): Ember[] {
  const r = rng(seed);
  return Array.from({ length: count }, () => ({
    x: (r() - 0.5) * spread * 2,
    rise: 70 + r() * 170,
    drift: (r() - 0.5) * 60,
    size: 2 + r() * 4,
    delay: r() * 500,
    duration: 1100 + r() * 1000,
    color: palette[Math.floor(r() * palette.length)]!,
  }));
}

/** Embers rising from the centre of the box: the "something good just happened" particles. Decorative only; nothing with reduced motion. */
export function Embers({ count = 24, seed = 1, palette = [colors.cy, colors.cy2, colors.am, "#FFFFFF"], play = true, spread = 120 }: { count?: number; seed?: number; palette?: string[]; play?: boolean; spread?: number }) {
  const reduced = useReducedMotion();
  const plan = useMemo(() => emberPlan(count, seed, palette, spread), [count, seed, palette, spread]);
  const values = useRef(plan.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduced || !play) return;
    const anims = plan.map((p, i) => {
      values[i]!.setValue(0);
      return Animated.timing(values[i]!, { toValue: 1, duration: p.duration, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true });
    });
    const all = Animated.parallel(anims);
    all.start();
    return () => all.stop();
  }, [plan, play, reduced, values]);
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="embers">
      {plan.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: p.size,
            height: p.size,
            marginLeft: p.x - p.size / 2,
            borderRadius: p.size,
            backgroundColor: p.color,
            opacity: values[i]!.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 1, 0.7, 0] }),
            transform: [{ translateY: values[i]!.interpolate({ inputRange: [0, 1], outputRange: [0, -p.rise] }) }, { translateX: values[i]!.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) }, { scale: values[i]!.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }],
          }}
        />
      ))}
    </View>
  );
}
