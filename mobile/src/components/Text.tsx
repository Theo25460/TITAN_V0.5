import { Text as RNText, type TextProps, type TextStyle, StyleSheet } from "react-native";
import { useSpace } from "../theme/space";
import { colors, fonts } from "../theme/tokens";

type Variant = "display" | "h1" | "h2" | "h3" | "title" | "body" | "bodyStrong" | "small" | "caption" | "eyebrow" | "num" | "numLarge" | "figure" | "figureXL";
type Tone = "default" | "muted" | "faint" | "accent" | "amber" | "ok" | "warn" | "err" | "ink";

const tones: Record<Tone, string> = {
  default: colors.tx,
  muted: colors.tx2,
  faint: colors.tx3,
  accent: colors.cy,
  amber: colors.am,
  ok: colors.ok,
  warn: colors.warn,
  err: colors.err,
  ink: colors.cyInk,
};

/* One family, three widths. Titles are condensed and heavy; text is the normal width; figures (times, distances, levels) are
   extra-condensed so a large number stays narrow: light when it is huge, bold when it is small. « eyebrow » is kept as a name for
   the existing call sites but it is now a plain label: no capitals, no tracking. */
const variants = StyleSheet.create<Record<Variant, TextStyle>>({
  display: { fontFamily: fonts.display, fontSize: 38, lineHeight: 39, letterSpacing: -0.4 },
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 27, letterSpacing: -0.1 },
  h3: { fontFamily: fonts.display, fontSize: 19, lineHeight: 23 },
  title: { fontFamily: fonts.textBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.text, fontSize: 15.5, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.textSemi, fontSize: 15.5, lineHeight: 23 },
  small: { fontFamily: fonts.text, fontSize: 13.5, lineHeight: 19 },
  caption: { fontFamily: fonts.textSemi, fontSize: 12.5, lineHeight: 16 },
  eyebrow: { fontFamily: fonts.textBold, fontSize: 13, lineHeight: 17 },
  num: { fontFamily: fonts.figureBold, fontSize: 24, lineHeight: 26, fontVariant: ["tabular-nums"] },
  numLarge: { fontFamily: fonts.figureBold, fontSize: 46, lineHeight: 46, fontVariant: ["tabular-nums"] },
  figure: { fontFamily: fonts.figure, fontSize: 64, lineHeight: 60, letterSpacing: -0.5, fontVariant: ["tabular-nums"] },
  figureXL: { fontFamily: fonts.figure, fontSize: 104, lineHeight: 92, letterSpacing: -1.5, fontVariant: ["tabular-nums"] },
});

const defaultTone: Partial<Record<Variant, Tone>> = { eyebrow: "muted", caption: "muted", small: "muted" };
// Layouts accommodate the complete system text scale through 200%.

export type TProps = TextProps & { variant?: Variant; tone?: Tone; center?: boolean; color?: string };

export function T({ variant = "body", tone, center, color, style, ...rest }: TProps) {
  const space = useSpace();
  const resolved = tone ?? defaultTone[variant] ?? "default";
  const isHeading = variant === "display" || variant === "h1" || variant === "h2" || variant === "h3";
  return (
    <RNText
      accessibilityRole={isHeading ? "header" : undefined}
      maxFontSizeMultiplier={2}
      {...rest}
      style={[variants[variant], { color: color ?? (resolved === "accent" ? space.accent : resolved === "ink" ? space.ink : tones[resolved]) }, center && { textAlign: "center" }, style]}
    />
  );
}
