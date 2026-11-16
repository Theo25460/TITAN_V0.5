/* TITAN « Programme » design tokens (16 November 2026), shared with css/ascension.css on the website.
   A night ground; one bright flat colour per space of the app (it tints that space's header field and is its action colour);
   cyan is progression (XP, level, the ascent) and amber is records, everywhere. One type family in three widths. */
export const colors = {
  bg: "#090C10",
  bg1: "#0D1116",
  bg2: "#131920",
  bg3: "#1A222C",
  bg4: "#232D39",
  line: "rgba(226,234,236,0.09)",
  line2: "rgba(226,234,236,0.17)",
  line3: "rgba(226,234,236,0.30)",
  tx: "#F1F3EF",
  tx2: "#AEB7BD",
  tx3: "#838E97",
  tx4: "#525C66",
  cy: "#3DD9E8",
  cy2: "#8CEAF2",
  cyInk: "#02181B",
  cySoft: "rgba(61,217,232,0.12)",
  cyLine: "rgba(61,217,232,0.38)",
  am: "#F4BB54",
  amInk: "#1D1302",
  amSoft: "rgba(244,187,84,0.12)",
  amLine: "rgba(244,187,84,0.40)",
  ok: "#57D39B",
  okSoft: "rgba(87,211,155,0.12)",
  warn: "#F0A24A",
  warnSoft: "rgba(240,162,74,0.12)",
  err: "#F2665F",
  errSoft: "rgba(242,102,95,0.12)",
  scrim: "rgba(2,4,6,0.72)",
  // The space colours: flat and bright, each one carries dark ink.
  signal: "#D7F25A",
  azur: "#9CC3FF",
  craie: "#E9EDE8",
  corail: "#FF9B7A",
  mousse: "#7FE0B0",
} as const;

/** A space of the app: its colour, the ink that sits on it, a soft wash and a hairline of it, and the deep field behind its header. */
export type SpaceId = "qg" | "seance" | "progres" | "aventure" | "profil" | "cercle";
export type SpaceTheme = { id: SpaceId; accent: string; ink: string; soft: string; line: string; field: string };
export const spaces: Record<SpaceId, SpaceTheme> = {
  qg: { id: "qg", accent: colors.cy, ink: colors.cyInk, soft: colors.cySoft, line: colors.cyLine, field: "#0A1B21" },
  seance: { id: "seance", accent: colors.signal, ink: "#161C00", soft: "rgba(215,242,90,0.12)", line: "rgba(215,242,90,0.40)", field: "#14190A" },
  progres: { id: "progres", accent: colors.azur, ink: "#06142E", soft: "rgba(156,195,255,0.13)", line: "rgba(156,195,255,0.42)", field: "#0C1526" },
  aventure: { id: "aventure", accent: colors.mousse, ink: "#032012", soft: "rgba(127,224,176,0.12)", line: "rgba(127,224,176,0.40)", field: "#0A1B16" },
  profil: { id: "profil", accent: colors.craie, ink: "#0E1216", soft: "rgba(233,237,232,0.10)", line: "rgba(233,237,232,0.36)", field: "#14181D" },
  cercle: { id: "cercle", accent: colors.corail, ink: "#2A0B02", soft: "rgba(255,155,122,0.12)", line: "rgba(255,155,122,0.42)", field: "#20120E" },
};

/** Sport families: data visualisation only, never decoration. */
export const familyColors: Record<string, string> = {
  endurance: "#3DD9E8",
  force: "#7C93FF",
  technique: "#B693FF",
  jeu: "#57D39B",
  mobilite: "#8EA2B3",
};

/** 4 px grid. */
export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s7: 32, s8: 40, s9: 56 } as const;
/** Squared, precise shapes: small radii everywhere; only avatars and counters are round. */
export const radius = { r1: 4, r2: 8, r3: 12, r4: 18, pill: 999 } as const;

/** Archivo in three widths (tools/fonts/build-archivo-instances.py): display is condensed, text is normal, figures are extra-condensed. */
export const fonts = {
  display: "TitanDisplay-Heavy",
  displayBold: "TitanDisplay-Bold",
  text: "TitanText-Regular",
  textSemi: "TitanText-SemiBold",
  textBold: "TitanText-Bold",
  textHeavy: "TitanText-ExtraBold",
  figure: "TitanFigure-Light",
  figureBold: "TitanFigure-Bold",
} as const;

/** Minimum touch target recommended by Android accessibility guidelines. */
export const TOUCH = 48;
