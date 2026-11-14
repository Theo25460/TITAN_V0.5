/* RPG artwork shipped inside the app (from assets/renaissance on the website), so the Adventure works offline. */
/* eslint-disable @typescript-eslint/no-require-imports */
export const worldImages: Record<string, number> = {
  valley: require("../../assets/rpg/valley-small.webp"),
  archipelago: require("../../assets/rpg/archipelago-small.webp"),
  forge: require("../../assets/rpg/forge-small.webp"),
  aurora: require("../../assets/rpg/aurora-small.webp"),
};
export const guardianImages: Record<string, number> = {
  aube: require("../../assets/rpg/guardian-aube-s.webp"),
  marees: require("../../assets/rpg/guardian-marees-s.webp"),
  forge: require("../../assets/rpg/guardian-forge-s.webp"),
  aurores: require("../../assets/rpg/guardian-aurores-s.webp"),
};
export const avatarImages: Record<string, number> = {
  scout: require("../../assets/rpg/scout-s.webp"),
  ranger: require("../../assets/rpg/ranger-s.webp"),
  keeper: require("../../assets/rpg/keeper-s.webp"),
  artisan: require("../../assets/rpg/artisan-s.webp"),
  navigator: require("../../assets/rpg/navigator-s.webp"),
  sentinel: require("../../assets/rpg/sentinel-s.webp"),
};
export const heroImage: number = require("../../assets/rpg/hero-small.webp");

/* Sculpted rank badges approved in design/titan-visual-library/global-v2/approved (transparent WebP). A rank absent from this map keeps
   the vector crest of components/Crest.tsx until its badge is approved. `small` serves crests up to 86 dp, `large` the big reveals. */
export const rankImages: Record<string, { small: number; large: number }> = {
  eclaireur: { small: require("../../assets/rank/eclaireur-256.webp"), large: require("../../assets/rank/eclaireur-512.webp") },
  explorateur: { small: require("../../assets/rank/explorateur-256.webp"), large: require("../../assets/rank/explorateur-512.webp") },
  sentinelle: { small: require("../../assets/rank/sentinelle-256.webp"), large: require("../../assets/rank/sentinelle-512.webp") },
  gardien: { small: require("../../assets/rank/gardien-256.webp"), large: require("../../assets/rank/gardien-512.webp") },
};
