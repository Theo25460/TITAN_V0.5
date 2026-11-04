/* Native rendering of the Atelier cosmetics (css/ascension-app.css on the website): frames, map ambiences, card styles.
   Purely visual: no cosmetic gives any sporting, ranking or progression advantage. */
export type FrameStyle = { rings: { color: string; width: number }[]; glow?: string };
export const FRAMES: Record<string, FrameStyle> = {
  "frame-standard": { rings: [] },
  "frame-neon": { rings: [{ color: "#3dd9e8", width: 3 }], glow: "rgba(61,217,232,0.45)" },
  "frame-crimson": { rings: [{ color: "#d9734a", width: 3 }], glow: "rgba(217,115,74,0.42)" },
  "frame-tide": { rings: [{ color: "#3dd9e8", width: 2 }, { color: "#2f6fc4", width: 2 }] },
  "frame-summit": { rings: [{ color: "#2a3440", width: 3 }, { color: "#e8eef3", width: 2.5 }] },
  "frame-sentinel": { rings: [{ color: "#8ea2b3", width: 3 }] },
  "frame-guardian": { rings: [{ color: "rgba(87,211,155,0.22)", width: 3 }, { color: "#57d39b", width: 3 }] },
  "frame-champion": { rings: [{ color: "#7c93ff", width: 3 }], glow: "rgba(124,147,255,0.45)" },
  "frame-titan": { rings: [{ color: "#f4bb54", width: 3.5 }], glow: "rgba(244,187,84,0.4)" },
  "frame-legend": { rings: [{ color: "#f4bb54", width: 2 }, { color: "#05070a", width: 2 }, { color: "#f4bb54", width: 2 }], glow: "rgba(244,187,84,0.5)" },
  "frame-aegis": { rings: [{ color: "#c9a85a", width: 1.5 }, { color: "#05070a", width: 2 }, { color: "#c9a85a", width: 1.5 }] },
  "frame-frost": { rings: [{ color: "#cfe9ff", width: 3 }], glow: "rgba(207,233,255,0.5)" },
};
export const MAP_OVERLAYS: Record<string, { color: string; opacity: number }> = {
  "map-default": { color: "#05070a", opacity: 0 },
  "map-mist": { color: "#cddce6", opacity: 0.22 },
  "map-night": { color: "#122456", opacity: 0.5 },
  "map-aurora": { color: "#57d39b", opacity: 0.22 },
};
export const CARD_STYLES: Record<string, { bg: string; tx: string; ac: string; line: string }> = {
  "card-default": { bg: "#0e141a", tx: "#eef3f7", ac: "#3dd9e8", line: "rgba(150,180,205,0.2)" },
  "card-chalk": { bg: "#e8ebe6", tx: "#1b2228", ac: "#2a6f7a", line: "#c9cfc8" },
  "card-ember": { bg: "#4a2010", tx: "#fff3e6", ac: "#f4bb54", line: "rgba(244,187,84,0.45)" },
  "card-obsidian": { bg: "#120f1e", tx: "#efeaff", ac: "#b693ff", line: "rgba(182,147,255,0.45)" },
};
