/* « Partager » (before V2): the 9:16 story card of a session or a success. Every length is given on the 1080 × 1920 grid of the exported
   picture and multiplied by `width / 1080`, so the same component draws the preview on the phone and the capture at exactly 1080 px.
   Identity: the night ground of TITAN, the real mark (assets/brand/mark.png), one accent — cyan for progression, amber for a record —
   and no glow, gradient text or decoration. Text never follows the system font size here: the picture must look the same for everyone. */
import { forwardRef } from "react";
import { Image, StyleSheet, Text, View, type TextStyle } from "react-native";
import { ShareStory, type StoryCardModel } from "../core/shareStory";
import { Sports } from "../core";
import { colors, fonts } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const mark = require("../../assets/brand/mark.png");

const { width: W, height: H } = ShareStory.SIZE;
const SAFE = ShareStory.SAFE;

function iconOf(sportId: string | null | undefined, kind: StoryCardModel["kind"]): IconName {
  if (sportId) {
    try {
      return Sports.iconOf(sportId) as IconName;
    } catch {
      /* an unknown sport keeps the generic mark below */
    }
  }
  return kind === "achievement" ? "trophy" : "bolt";
}

/** The size a one-line text may take so it fits `room` px: the largest of `base` and below, from the average advance of the cut
    (`em`, in font sizes). Computed, not measured, so the website's canvas and the phone pick the same size. */
export function fitSize(text: string, base: number, room: number, em: number): number {
  return Math.max(Math.round(base * 0.4), Math.min(base, Math.floor(room / Math.max(1, [...text].length * em))));
}

export type StoryCardProps = { model: StoryCardModel; width: number; sportId?: string | null };

export const StoryCard = forwardRef<View, StoryCardProps>(function StoryCard({ model, width, sportId }, ref) {
  const k = width / W;
  const px = (n: number) => Math.round(n * k * 100) / 100;
  const accent = model.accent === "amber" ? colors.am : colors.cy;
  // A record, a long title or a name make the card denser: the figures give way so the footer stays above the reply field.
  const dense = Boolean(model.highlight) || (Boolean(model.xp) && model.facts.length > 0);
  const room = W - SAFE.side * 2;
  const titleSize = dense ? 92 : 108;
  const heroSize = model.hero ? fitSize(model.hero.value, dense ? 200 : 300, room, 0.4) : 0;
  const text = (size: number, family: string, color: string, extra?: TextStyle): TextStyle => ({ fontFamily: family, fontSize: px(size), lineHeight: px(size * 1.12), color, ...extra });
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { width: px(W), height: px(H), paddingTop: px(SAFE.top), paddingBottom: px(SAFE.bottom), paddingHorizontal: px(SAFE.side) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.row, { gap: px(26) }]}>
        <Image source={mark} style={{ width: px(92), height: px(92), borderRadius: px(24) }} />
        <Text allowFontScaling={false} style={text(70, fonts.display, colors.tx, { letterSpacing: px(9), lineHeight: px(78) })}>TITAN</Text>
        <View style={{ flex: 1 }} />
        {model.date ? <Text allowFontScaling={false} numberOfLines={1} style={text(32, fonts.textSemi, colors.tx2, { flexShrink: 1, textAlign: "right" })}>{model.date}</Text> : null}
      </View>

      <View style={{ flex: 1, justifyContent: "center", gap: px(dense ? 24 : 40) }}>
        <View style={{ gap: px(14) }}>
          <View style={[styles.row, { gap: px(18) }]}>
            <Icon name={iconOf(sportId, model.kind)} size={px(60)} color={accent} strokeWidth={1.8} />
            <Text allowFontScaling={false} numberOfLines={1} style={text(40, fonts.textSemi, accent, { flexShrink: 1 })}>{model.eyebrow}</Text>
          </View>
          <Text allowFontScaling={false} numberOfLines={model.highlight ? 1 : 2} style={text(titleSize, fonts.display, colors.tx, { lineHeight: px(titleSize * 1.06) })}>
            {model.title}
          </Text>
        </View>

        {model.hero ? (
          <View>
            <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={text(heroSize, fonts.figure, colors.tx, { lineHeight: px(heroSize), letterSpacing: px(-3) })}>
              {model.hero.value}
            </Text>
            {model.hero.label ? <Text allowFontScaling={false} numberOfLines={1} style={text(40, fonts.textSemi, colors.tx2)}>{model.hero.label}</Text> : null}
          </View>
        ) : null}

        {model.facts.length ? (
          <View style={[styles.row, { borderTopWidth: Math.max(1, px(3)), borderTopColor: colors.line2, paddingTop: px(34), gap: px(28), alignItems: "flex-start" }]}>
            {model.facts.map(([label, value]) => (
              <View key={label} style={{ flex: 1, gap: px(6) }}>
                <Text allowFontScaling={false} numberOfLines={1} style={text(32, fonts.textSemi, colors.tx3)}>{label}</Text>
                <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={text(76, fonts.figureBold, colors.tx)}>{value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {model.highlight ? (
          <View style={{ backgroundColor: colors.bg2, padding: px(32), gap: px(6), borderRadius: px(12), overflow: "hidden" }}>
            <Text allowFontScaling={false} numberOfLines={1} style={text(36, fonts.textSemi, colors.am)}>{model.highlight.label}</Text>
            <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={text(fitSize(model.highlight.value, 96, room - 64, 0.45), fonts.figureBold, colors.am)}>{model.highlight.value}</Text>
            {model.highlight.detail ? <Text allowFontScaling={false} numberOfLines={1} style={text(34, fonts.text, colors.tx2)}>{model.highlight.detail}</Text> : null}
            {/* La coupe: the 45° corner of what is primary (DESIGN.md § 11), cut in the ground colour. */}
            <View style={{ position: "absolute", right: -px(40), bottom: -px(40), width: px(80), height: px(80), backgroundColor: colors.bg, transform: [{ rotate: "45deg" }] }} />
          </View>
        ) : null}

        {model.progress ? <Text allowFontScaling={false} numberOfLines={2} style={text(42, fonts.text, colors.tx2)}>{model.progress}</Text> : null}

        {model.xp || model.level ? (
          <View style={[styles.row, { gap: px(24), alignItems: "flex-end" }]}>
            {model.xp ? <Text allowFontScaling={false} numberOfLines={1} style={text(84, fonts.figureBold, colors.cy, { lineHeight: px(88) })}>{model.xp}</Text> : null}
            {model.level ? <Text allowFontScaling={false} numberOfLines={1} style={text(36, fonts.textSemi, colors.tx2, { flexShrink: 1, marginBottom: px(10) })}>{model.level}</Text> : null}
          </View>
        ) : null}
      </View>

      <View style={{ borderTopWidth: Math.max(1, px(3)), borderTopColor: colors.line2, paddingTop: px(28), gap: px(6) }}>
        {model.name ? <Text allowFontScaling={false} numberOfLines={1} style={text(44, fonts.textBold, colors.tx)}>{model.name}</Text> : null}
        <Text allowFontScaling={false} numberOfLines={1} style={text(36, fonts.textSemi, colors.tx)}>{model.tagline}</Text>
        <Text allowFontScaling={false} numberOfLines={1} style={text(36, fonts.textSemi, colors.cy)}>{model.url}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center" },
});
