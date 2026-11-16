/* AUD-21: the picture a proud moment becomes — a 9:16 story card (rendered at 360×640, captured at 1080×1920). Dark, cyan and amber,
   one dominant number, the week in notches and the site address: every share is a small, honest advertisement for TITAN. */
import { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import { colors, space } from "../theme/tokens";
import { Brand } from "./Brand";
import { Icon, type IconName } from "./Icon";
import { T } from "./Text";

export type ShareCardData = {
  eyebrow: string;
  title: string;
  value: string;
  caption?: string | null;
  facts?: [string, string][];
  icon?: IconName;
  week?: { done: number; target: number } | null;
  record?: boolean;
};

export const SHARE_CARD_SIZE = { width: 360, height: 640 } as const;

export const ShareCard = forwardRef<View, { data: ShareCardData }>(function ShareCard({ data }, ref) {
  const accent = data.record ? colors.am : colors.cy;
  const notches = data.week ? Math.max(data.week.target, data.week.done) : 0;
  return (
    <View ref={ref} collapsable={false} style={styles.card} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.glow, { backgroundColor: accent }]} />
      <Brand size={30} />
      <View style={{ flex: 1, justifyContent: "center", gap: space.s3 }}>
        <View style={styles.row}>
          {data.icon ? <Icon name={data.icon} size={26} color={accent} /> : null}
          <T variant="eyebrow" color={accent}>{data.eyebrow}</T>
        </View>
        <T variant="h2" color={colors.tx}>{data.title}</T>
        <T style={[styles.value, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>{data.value}</T>
        {data.caption ? <T variant="small" color={colors.tx2}>{data.caption}</T> : null}
        {data.facts?.length ? (
          <View style={styles.facts}>
            {data.facts.slice(0, 3).map(([k, v]) => (
              <View key={k} style={{ flex: 1, gap: 2 }}>
                <T variant="caption" color={colors.tx3}>{k}</T>
                <T variant="bodyStrong" color={colors.tx}>{v}</T>
              </View>
            ))}
          </View>
        ) : null}
        {data.week ? (
          <View style={{ gap: space.s2 }}>
            <T variant="caption" color={colors.tx3}>Ma semaine · {data.week.done}/{data.week.target} jours actifs</T>
            <View style={styles.row}>
              {Array.from({ length: notches }, (_, i) => (
                <View key={i} style={[styles.notch, i < data.week!.done && { backgroundColor: accent, borderColor: accent }]} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <T variant="bodyStrong" color={colors.tx}>Tous tes sports. Une seule progression.</T>
        <T variant="caption" color={colors.tx3}>titan-app.fr</T>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { width: SHARE_CARD_SIZE.width, height: SHARE_CARD_SIZE.height, backgroundColor: colors.bg, padding: space.s6, gap: space.s4, overflow: "hidden", borderRadius: 0 },
  glow: { position: "absolute", width: 420, height: 420, borderRadius: 210, top: -220, right: -200, opacity: 0.16 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  value: { fontSize: 72, lineHeight: 80, fontWeight: "800" },
  facts: { flexDirection: "row", gap: space.s3, paddingTop: space.s3, borderTopWidth: 1, borderTopColor: colors.line },
  notch: { flex: 1, height: 10, borderRadius: 5, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg3 },
});
