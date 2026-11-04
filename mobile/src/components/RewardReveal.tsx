/* A chapter insignia, revealed once the server has granted it: a short, quiet moment, never a slot machine. */
import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { haptic } from "../lib/haptics";
import { useReducedMotion } from "../lib/motion";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { T } from "./Text";

export type RevealContent = { color: string; eyebrow: string; title: string; insignia: string; text: string; next?: string | null };

export function RewardReveal({ content, onClose }: { content: RevealContent | null; onClose: () => void }) {
  const reduced = useReducedMotion();
  const medal = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!content) return;
    haptic("success");
    if (reduced) {
      medal.setValue(1);
      halo.setValue(1);
      return;
    }
    medal.setValue(0);
    halo.setValue(0);
    Animated.parallel([
      Animated.spring(medal, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.timing(halo, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [content, reduced, medal, halo]);
  if (!content) return null;
  const c = content.color;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer">
        <Pressable style={styles.panel} accessibilityViewIsModal onPress={() => {}}>
          <View style={styles.stage}>
            <Animated.View style={[styles.halo, { borderColor: c, opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.9] }) }] }]} />
            <Animated.View style={[styles.medal, { borderColor: c, backgroundColor: `${c}22`, transform: [{ scale: medal }, { rotate: medal.interpolate({ inputRange: [0, 1], outputRange: ["-25deg", "0deg"] }) }] }]}>
              <Icon name="medal" size={54} color={c} strokeWidth={1.6} />
            </Animated.View>
          </View>
          <T variant="eyebrow" center color={c}>
            {content.eyebrow}
          </T>
          <T variant="h2" center>
            {content.title}
          </T>
          <View style={[styles.insignia, { borderColor: `${c}66` }]}>
            <T variant="caption" tone="faint" center>
              Insigne obtenu
            </T>
            <T variant="h3" center color={c}>
              {content.insignia}
            </T>
          </View>
          <T variant="small" center>
            {content.text}
          </T>
          {content.next ? (
            <T variant="caption" tone="muted" center>
              Prochaine étape : {content.next}
            </T>
          ) : null}
          <Button label="Continuer l’aventure" onPress={onClose} style={{ alignSelf: "stretch" }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(2,4,6,0.82)", alignItems: "center", justifyContent: "center", padding: space.s5 },
  panel: { width: "100%", maxWidth: 420, borderRadius: radius.r4, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line2, padding: space.s6, gap: space.s3, alignItems: "center" },
  stage: { width: 150, height: 150, alignItems: "center", justifyContent: "center", marginBottom: space.s2 },
  halo: { position: "absolute", width: 120, height: 120, borderRadius: 60, borderWidth: 2 },
  medal: { width: 116, height: 116, borderRadius: 58, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  insignia: { alignSelf: "stretch", gap: 2, paddingVertical: space.s3, borderRadius: radius.r2, borderWidth: 1, backgroundColor: colors.bg2 },
});
