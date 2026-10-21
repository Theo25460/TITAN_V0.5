import { Text as RNText, type TextProps, type TextStyle, StyleSheet } from "react-native";
import { colors, fonts } from "../theme/tokens";

type Variant = "display" | "h1" | "h2" | "h3" | "title" | "body" | "bodyStrong" | "small" | "caption" | "eyebrow" | "num" | "numLarge";
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

const variants = StyleSheet.create<Record<Variant, TextStyle>>({
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, letterSpacing: -0.3 },
  h1: { fontFamily: fonts.display, fontSize: 28, lineHeight: 31, letterSpacing: -0.2 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 25 },
  h3: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22 },
  title: { fontFamily: fonts.textBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.textSemi, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: fonts.textSemi, fontSize: 12, lineHeight: 16 },
  eyebrow: { fontFamily: fonts.displayBold, fontSize: 12, lineHeight: 16, letterSpacing: 1.6, textTransform: "uppercase" },
  num: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, fontVariant: ["tabular-nums"] },
  numLarge: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, fontVariant: ["tabular-nums"] },
});

const defaultTone: Partial<Record<Variant, Tone>> = { eyebrow: "faint", caption: "muted", small: "muted" };
// Large titles keep their layout under big system font sizes; body text scales freely.
const scaleCap: Partial<Record<Variant, number>> = { display: 1.3, h1: 1.35, h2: 1.4, numLarge: 1.3, eyebrow: 1.5 };

export type TProps = TextProps & { variant?: Variant; tone?: Tone; center?: boolean; color?: string };

export function T({ variant = "body", tone, center, color, style, ...rest }: TProps) {
  const isHeading = variant === "display" || variant === "h1" || variant === "h2" || variant === "h3";
  return (
    <RNText
      accessibilityRole={isHeading ? "header" : undefined}
      maxFontSizeMultiplier={scaleCap[variant] ?? 1.8}
      {...rest}
      style={[variants[variant], { color: color ?? tones[tone ?? defaultTone[variant] ?? "default"] }, center && { textAlign: "center" }, style]}
    />
  );
}
