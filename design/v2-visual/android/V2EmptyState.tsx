/* TITAN V2 — état vide Android (brouillon de handoff, non compilé dans l'application). Le dessin vient du même SVG que le Web
   (design/v2-visual/svg/empty-states) via react-native-svg (SvgXml, déjà dépendance). Le texte reste natif et traduisible. */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { colors } from "../theme/tokens";

export function V2EmptyState({ xml, accent, title, body, action }: { xml: string; accent: string; title: string; body: string; action?: React.ReactNode }) {
  // The SVG carries `var(--titan-accent,#hex)`; react-native-svg has no CSS variables, so the accent is written in before drawing.
  const drawn = xml.replace(/var\(--titan-accent,(#[0-9A-Fa-f]{6})\)/g, accent).replace(/style="color:#[0-9A-Fa-f]{6}"/, "");
  return (
    <View style={st.wrap}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><SvgXml xml={drawn} width={160} height={120} color={colors.tx3} /></View>
      <Text style={st.title} accessibilityRole="header">{title}</Text>
      <Text style={st.body}>{body}</Text>
      {action}
    </View>
  );
}
const st = StyleSheet.create({
  wrap: { paddingVertical: 24, gap: 8, alignItems: "flex-start" },
  title: { fontFamily: "TitanText-Bold", fontSize: 17, color: colors.tx },
  body: { fontFamily: "TitanText-Regular", fontSize: 15.5, lineHeight: 23, color: colors.tx2, maxWidth: 420 },
});
