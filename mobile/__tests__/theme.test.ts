/* Visual accessibility guard: every colour used for TEXT keeps WCAG AA contrast (4.5:1) on every surface, and the very dim tone is never used as text. */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { colors, TOUCH } from "../src/theme/tokens";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
const surfaces = [colors.bg, colors.bg1, colors.bg2, colors.bg3];

test.each(["tx", "tx2", "tx3", "cy", "cy2", "am", "ok", "warn", "err"] as const)("text colour %s keeps AA contrast on every surface", (name) => {
  for (const s of surfaces) expect(ratio(colors[name], s)).toBeGreaterThanOrEqual(4.5);
});
test("dark ink on the cyan and amber buttons keeps AA contrast", () => {
  expect(ratio(colors.cyInk, colors.cy)).toBeGreaterThanOrEqual(4.5);
  expect(ratio("#1D1302", colors.am)).toBeGreaterThanOrEqual(4.5);
});
test("the dimmest tone (decorative only) is never a text or placeholder colour", () => {
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(f) && files.push(p); });
  walk(join(__dirname, "..", "src"));
  const bad = files.filter((f) => !f.endsWith("tokens.ts")).flatMap((f) => readFileSync(f, "utf8").split("\n").map((l, i) => ({ f, i, l })).filter(({ l }) => /colors\.tx4/.test(l) && /(placeholderTextColor|fill=|color:|<T\b)/.test(l) && !/<Icon\b/.test(l)));
  expect(bad.map((b) => `${b.f}:${b.i + 1}`)).toEqual([]);
});
test("the touch target token is the Android minimum", () => {
  expect(TOUCH).toBeGreaterThanOrEqual(48);
});
