import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type DimensionValue } from "react-native";
import { errorMessage } from "../lib/errors";
import { useReducedMotion } from "../lib/motion";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { T } from "./Text";

export function EmptyState({ icon = "compass", title, text, action, onAction }: { icon?: IconName; title: string; text?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.box}>
      <View style={styles.badge}>
        <Icon name={icon} size={26} color={colors.cy} />
      </View>
      <T variant="h3" center>
        {title}
      </T>
      {text ? (
        <T variant="small" center>
          {text}
        </T>
      ) : null}
      {action && onAction ? <Button label={action} onPress={onAction} style={{ alignSelf: "stretch", marginTop: space.s2 }} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry, title = "Impossible de charger ces données" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <View style={[styles.badge, { backgroundColor: colors.errSoft }]}>
        <Icon name="alert" size={26} color={colors.err} />
      </View>
      <T variant="h3" center>
        {title}
      </T>
      <T variant="small" center>
        {errorMessage(error)}
      </T>
      {onRetry ? <Button label="Réessayer" kind="secondary" icon="restore" onPress={onRetry} style={{ alignSelf: "stretch", marginTop: space.s2 }} /> : null}
    </View>
  );
}

export function Skeleton({ height = 18, width = "100%", style }: { height?: number; width?: DimensionValue; style?: object }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return <Animated.View style={[{ height, width, borderRadius: radius.r1, backgroundColor: colors.bg3, opacity: pulse }, style]} />;
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: space.s4 }} accessibilityLabel="Chargement" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton width="40%" height={12} />
          <Skeleton width="80%" height={22} />
          <Skeleton width="60%" height={14} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", gap: space.s3, padding: space.s6, borderRadius: radius.r3, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cySoft, alignItems: "center", justifyContent: "center" },
  card: { gap: 10, padding: space.s4, borderRadius: radius.r3, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
});
