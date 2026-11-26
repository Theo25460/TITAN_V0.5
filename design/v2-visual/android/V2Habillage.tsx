/* TITAN V2 — composants d'habillage pour Android (A1 bis). BROUILLON de handoff pour B2 : ce fichier n'est importé par
   aucun écran, il n'est pas compilé dans l'application et n'a jamais tourné sur un appareil. Il n'ajoute aucune dépendance :
   react-native (Animated), expo-image et react-native-svg sont déjà dans mobile/package.json ; useReducedMotion vient de
   mobile/src/lib/motion. À copier dans mobile/src/components/ quand B1/B2 auront fixé les emplacements.
   Les images viennent de design/v2-visual/exports/objects (WebP alpha) copiées dans mobile/assets/v2/ par B2. */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors } from "../theme/tokens";
import { useReducedMotion } from "../lib/motion";

/* L'objet rendu. Décoratif par défaut (exclu de TalkBack) ; `label` le rend lisible quand il porte un sens propre. */
export function V2Object({ source, size = 96, locked = false, settle = false, label }: { source: number; size?: 64 | 96 | 128 | 160; locked?: boolean; settle?: boolean; label?: string }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(settle && !reduced ? 0 : 1)).current;
  useEffect(() => {
    if (!settle || reduced) return;
    Animated.timing(v, { toValue: 1, duration: 640, delay: 120, easing: Easing.bezier(0.2, 0.8, 0.25, 1.05), useNativeDriver: true }).start();
  }, [settle, reduced, v]);
  return (
    <Animated.View accessible={!!label} accessibilityLabel={label} importantForAccessibility={label ? "yes" : "no-hide-descendants"}
      style={{ width: size, height: size, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
      <Image source={source} style={{ width: size, height: size, opacity: locked ? 0.55 : 1 }} contentFit="contain" />
    </Animated.View>
  );
}

/* Le compteur de pas du QG : une ligne au premier écran, chiffre + barre vers l'objectif + repère « d'habitude ».
   Une journée sans donnée dit « Pas de donnée », jamais zéro (règle de js/app/pas.js). */
export function V2StepsRow({ steps, goal, usual, source, at, onPress }: { steps: number | null; goal: number | null; usual: number | null; source: string; at: string | null; onPress: () => void }) {
  const reduced = useReducedMotion();
  const fill = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => { if (!reduced && steps != null) Animated.timing(fill, { toValue: 1, duration: 520, easing: Easing.bezier(0.2, 0.7, 0.2, 1), useNativeDriver: false }).start(); }, [steps, reduced, fill]);
  const pct = steps != null && goal ? Math.min(1, steps / goal) : 0;
  const label = steps == null ? "Pas aujourd’hui : pas de donnée." : `Pas aujourd’hui : ${steps.toLocaleString("fr-FR")}${goal ? ` sur un objectif de ${goal.toLocaleString("fr-FR")}` : ""}.`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Ouvre le détail des pas" style={s.steps}>
      <View style={s.stepsTop}>
        <Text style={s.stepsFig}>{steps == null ? "Pas de donnée" : steps.toLocaleString("fr-FR")}{steps != null ? <Text style={s.stepsUnit}> pas</Text> : null}</Text>
        {goal ? <Text style={s.stepsGoal}>objectif {goal.toLocaleString("fr-FR")}</Text> : null}
      </View>
      {goal ? <View style={s.track}>
        <Animated.View style={[s.fill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${pct * 100}%`] }) }]} />
        {usual ? <View style={[s.usual, { left: `${Math.min(1, usual / goal) * 100}%` }]} /> : null}
      </View> : null}
      <Text style={s.stepsMeta}>{source}{at ? ` · relevé à ${at}` : ""}</Text>
    </Pressable>
  );
}

/* La vitrine : les objets gagnés debout sur une tablette d'acier. Verrouillé = désaturé ET dit en mots. */
export function V2Vitrine({ items }: { items: { key: string; source: number; title: string; sub: string; locked?: boolean; record?: boolean }[] }) {
  return (
    <View style={s.shelf} accessibilityRole="list">
      {items.map((it) => (
        <View key={it.key} style={s.item} accessible accessibilityLabel={`${it.title}, ${it.locked ? "à gagner" : it.sub}`}>
          <V2Object source={it.source} size={96} locked={it.locked} />
          <Text style={[s.itemTitle, it.locked && { color: colors.tx2 }]} numberOfLines={2}>{it.title}</Text>
          <Text style={[s.itemSub, it.record && { color: colors.am }]} numberOfLines={1}>{it.locked ? "À gagner" : it.sub}</Text>
        </View>
      ))}
      <View style={s.ledge} importantForAccessibility="no-hide-descendants" />
    </View>
  );
}

const s = StyleSheet.create({
  steps: { minHeight: 48, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line2 },
  stepsTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  stepsFig: { fontFamily: "TitanFigure-Bold", fontSize: 26, color: colors.tx, fontVariant: ["tabular-nums"] },
  stepsUnit: { fontFamily: "TitanText-SemiBold", fontSize: 14, color: colors.tx2 },
  stepsGoal: { fontFamily: "TitanText-Regular", fontSize: 13.5, color: colors.tx2 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg4, marginTop: 8, overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.cy, borderRadius: 3 },
  usual: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: colors.tx2, opacity: 0.7 },
  stepsMeta: { marginTop: 6, fontFamily: "TitanText-Regular", fontSize: 12.5, color: colors.tx3 },
  shelf: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 26, borderRadius: 8 },
  item: { width: 104, alignItems: "center" },
  itemTitle: { fontFamily: "TitanText-Bold", fontSize: 13, color: colors.tx, textAlign: "center", marginTop: -4 },
  itemSub: { fontFamily: "TitanText-Regular", fontSize: 12, color: colors.tx3, textAlign: "center" },
  ledge: { position: "absolute", left: 0, right: 0, bottom: 0, height: 22, backgroundColor: "#1d242c", borderTopWidth: 1, borderTopColor: "#3a4550", borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
});
