import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useReducedMotion } from "../lib/motion";
import { colors, radius } from "../theme/tokens";

export function ProgressBar({ value, color = colors.cy, height = 8, track = colors.bg4, accessibilityLabel }: { value: number; color?: string; height?: number; track?: string; accessibilityLabel?: string }) {
  const ratio = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(reduced ? ratio : 0)).current;
  useEffect(() => {
    if (reduced) anim.setValue(ratio);
    else Animated.timing(anim, { toValue: ratio, duration: 520, useNativeDriver: false }).start();
  }, [ratio, reduced, anim]);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      style={[styles.track, { height, backgroundColor: track, borderRadius: height }]}
    >
      <Animated.View style={{ height, borderRadius: height, backgroundColor: color, width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
    </View>
  );
}

export function Ring({ value, size = 64, stroke = 7, color = colors.cy, children }: { value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.bg4} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c * ratio} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ track: { width: "100%", overflow: "hidden", borderRadius: radius.pill } });
