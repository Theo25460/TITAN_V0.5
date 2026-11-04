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
