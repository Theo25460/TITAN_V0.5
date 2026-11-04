/* "La révélation de progression" — TITAN's signature moment after a session the server has CONFIRMED (V12-36): the XP ring fills, embers rise,
   and on a new level the rank crest strikes into place. About two seconds, one tap to skip, and absent with "réduire les animations".
   It is only ever mounted from a server receipt: nothing here can celebrate a gain that does not exist. */
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { EffortRules, Format } from "../core";
import { haptic } from "../lib/haptics";
import { useReducedMotion } from "../lib/motion";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";
import { RANK_ACCENT, RankCrest, rankIdOf } from "./Crest";
import { Embers } from "./Embers";
import { Icon } from "./Icon";
import { T } from "./Text";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type RevealInput = { xp: number; credits: number; level: number; levelXp: number; need: number; leveledUp: boolean; record?: string | null };

/** What the moment will show, decided from the receipt alone (pure, so it can be tested). */
export function revealPlan(i: RevealInput) {
  const after = Math.max(0, Math.min(1, i.levelXp / Math.max(1, i.need)));
  const before = i.leveledUp ? 0 : Math.max(0, Math.min(1, Math.max(0, i.levelXp - i.xp) / Math.max(1, i.need)));
  const newRank = i.leveledUp && rankIdOf(i.level) !== rankIdOf(Math.max(1, i.level - 1));
  return {
    from: before,
    // A level-up fills the ring to the brim before the crest: the bar of the NEW level is shown by the screen behind.
    to: i.leveledUp ? 1 : after,
    rank: rankIdOf(i.level),
    newRank,
    holds: i.leveledUp, // a level-up waits for a tap; an ordinary gain closes by itself
    autoCloseMs: i.leveledUp ? null : 3200,
  };
}

export function ProgressReveal({ input, onDone }: { input: RevealInput; onDone: () => void }) {
  const reduced = useReducedMotion();
  const plan = revealPlan(input);
  const SIZE = 216;
  const STROKE = 14;
  const r = (SIZE - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const fill = useRef(new Animated.Value(plan.from)).current;
  const intro = useRef(new Animated.Value(0)).current;
  const crest = useRef(new Animated.Value(0)).current;
  const shock = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;
  const [struck, setStruck] = useState(false);
  const [burst, setBurst] = useState(1);
  const done = useRef(false);

  const close = () => {
    if (done.current) return;
    done.current = true;
    Animated.timing(out, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onDone());
  };

  useEffect(() => {
    // With reduced motion the screen behind already tells everything: no cinematic, no blocking layer.
    if (reduced) {
      onDone();
      return;
    }
    haptic("light");
    const timers: ReturnType<typeof setTimeout>[] = [];
    Animated.spring(intro, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
    Animated.timing(fill, { toValue: plan.to, duration: 1100, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
      haptic("success");
      if (plan.holds) {
        setStruck(true);
        setBurst(2);
        Animated.parallel([
          Animated.spring(crest, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
          Animated.timing(shock, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
      }
    });
    if (plan.autoCloseMs) timers.push(setTimeout(close, plan.autoCloseMs));
    return () => timers.forEach(clearTimeout);
    // The moment plays once for the receipt it was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (reduced) return null;

  const accent = RANK_ACCENT[plan.rank];
  const rankName = EffortRules.RANKS.find((x: { id: string }) => x.id === plan.rank)?.name ?? "";
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.layer, { opacity: out }]} testID="progress-reveal">
      <Pressable style={StyleSheet.absoluteFill} onPress={plan.holds && !struck ? undefined : close} accessibilityRole="button" accessibilityLabel="Passer l’animation et continuer">
        <View style={styles.center}>
          <Embers key={burst} seed={burst * 17} count={plan.holds ? 34 : 22} palette={plan.holds ? [accent, "#FFFFFF", colors.am] : [colors.cy, colors.cy2, "#FFFFFF"]} />
          <T variant="eyebrow" tone="accent" style={{ marginBottom: space.s4 }}>
            Séance confirmée
          </T>
          <Animated.View style={{ transform: [{ scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }], opacity: intro }}>
            <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
              <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
                <Circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke={colors.bg4} strokeWidth={STROKE} fill="none" />
                <AnimatedCircle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke={plan.holds && struck ? accent : colors.cy} strokeWidth={STROKE} fill="none" strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} strokeDashoffset={fill.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] }) as unknown as number} transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} />
              </Svg>
              {/* The shock ring of a level-up. */}
              {plan.holds ? <Animated.View pointerEvents="none" style={[styles.shock, { borderColor: accent, opacity: shock.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: shock.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.1] }) }] }]} /> : null}
              {/* Centre: the XP of the session, then (level-up) the crest. */}
              <Animated.View style={{ alignItems: "center", opacity: plan.holds ? crest.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: "clamp" }) : 1, position: plan.holds && struck ? "absolute" : "relative" }}>
                <T variant="numLarge" accessibilityLabel={`${Format.number(input.xp)} XP`}>
                  +{Format.number(input.xp)}
                </T>
                <T variant="caption" tone="accent">
                  XP
                </T>
              </Animated.View>
              {plan.holds ? (
                <Animated.View style={{ position: "absolute", opacity: crest, transform: [{ scale: crest.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: crest.interpolate({ inputRange: [0, 1], outputRange: ["-12deg", "0deg"] }) }] }}>
                  <RankCrest rank={plan.rank} size={168} />
                </Animated.View>
              ) : null}
            </View>
          </Animated.View>

          {plan.holds ? (
            <Animated.View style={{ alignItems: "center", gap: 4, marginTop: space.s4, opacity: crest }}>
              <T variant="eyebrow" color={accent}>
                {plan.newRank ? "Nouveau rang" : "Niveau supérieur"}
              </T>
              <T variant="h1" center>
                Niveau {input.level}
              </T>
              <T variant="body" tone="muted">
                {rankName}
              </T>
            </Animated.View>
          ) : (
            <View style={{ alignItems: "center", gap: 4, marginTop: space.s4 }}>
              <T variant="bodyStrong">
                Niveau {input.level} · {rankName}
              </T>
              {input.credits > 0 ? (
                <T variant="small" tone="muted">
                  +{Format.number(input.credits)} crédit{input.credits > 1 ? "s" : ""}
                </T>
              ) : null}
            </View>
          )}

          {input.record ? (
            <View style={styles.record} testID="reveal-record">
              <Icon name="trophy" size={18} color={colors.am} />
              <T variant="bodyStrong" color={colors.am} numberOfLines={2} style={{ flexShrink: 1 }}>
                Record battu · {input.record}
              </T>
            </View>
          ) : null}

          {plan.holds && struck ? (
            <Button label="Continuer" onPress={close} style={{ marginTop: space.s5, alignSelf: "stretch" }} testID="reveal-continue" />
          ) : (
            <T variant="caption" tone="faint" style={{ marginTop: space.s5 }}>
              Toucher pour continuer
            </T>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { backgroundColor: "rgba(2,4,6,0.975)", zIndex: 50, elevation: 50 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.s6 },
  shock: { position: "absolute", width: 200, height: 200, borderRadius: 100, borderWidth: 3 },
  record: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: space.s4, paddingHorizontal: space.s4, paddingVertical: space.s2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.amLine, backgroundColor: colors.amSoft, maxWidth: "100%" },
});
