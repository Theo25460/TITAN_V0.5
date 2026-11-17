/** Keeps a short figure with its unit on one line (« 1 h 01 », « 12 km ») by making its spaces non-breaking. */
export const unbreakable = (text: string) => text.replace(/ /g, "\u00a0");
