/* TITAN Ascension design tokens, taken from css/ascension.css on the website:
   blue-black surfaces, steel text, cyan for action and progression only, amber for records and rare moments. */
export const colors = {
  bg: "#05070A",
  bg1: "#090D12",
  bg2: "#0E141A",
  bg3: "#141C24",
  bg4: "#1B2530",
  line: "rgba(150,180,205,0.11)",
  line2: "rgba(150,180,205,0.20)",
  line3: "rgba(150,180,205,0.32)",
  tx: "#EEF3F7",
  tx2: "#A8B6C3",
  tx3: "#7F909F",
  tx4: "#4C5966",
  cy: "#3DD9E8",
  cy2: "#8CEAF2",
  cyInk: "#02181B",
  cySoft: "rgba(61,217,232,0.12)",
  cyLine: "rgba(61,217,232,0.38)",
  am: "#F4BB54",
  amSoft: "rgba(244,187,84,0.12)",
  amLine: "rgba(244,187,84,0.40)",
  ok: "#57D39B",
  okSoft: "rgba(87,211,155,0.12)",
  warn: "#F0A24A",
  warnSoft: "rgba(240,162,74,0.12)",
  err: "#F2665F",
  errSoft: "rgba(242,102,95,0.12)",
  scrim: "rgba(2,4,6,0.72)",
} as const;

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
export const radius = { r1: 8, r2: 12, r3: 18, r4: 26, pill: 999 } as const;

export const fonts = {
  display: "TitanDisplay-Heavy",
  displayBold: "TitanDisplay-Bold",
  text: "Manrope-Regular",
  textSemi: "Manrope-SemiBold",
  textBold: "Manrope-Bold",
  textHeavy: "Manrope-ExtraBold",
} as const;

/** Minimum touch target recommended by Android accessibility guidelines. */
export const TOUCH = 48;
