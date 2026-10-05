// TITAN 300 — small WebP variants for portraits and guardians shown at 32–128 px (dev only, Chromium canvas).
//   node tools/serve-public.mjs 4173 &  node tools/make-thumbs.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
let chromium;
for (const id of ["playwright", "/opt/node-tools/node_modules/playwright"]) {
  try {
    ({ chromium } = require(id));
    break;
  } catch {}
}
const BASE = process.env.PREVIEW || "http://127.0.0.1:4173";
const JOBS = [
  ...["scout", "ranger", "keeper", "artisan", "navigator", "sentinel"].map((id) => [id, 192]),
  ...["aube", "marees", "forge", "aurores"].map((id) => [`guardian-${id}`, 256]),
  // World cards: keep the 16:9 frame, 480 px wide.
  ...["valley", "archipelago", "forge", "aurora"].map((id) => [id, 480, "wide"]),
];
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/404`);
for (const [name, size, shape] of JOBS) {
  const data = await page.evaluate(
    async ({ src, size, wide }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      if (wide) {
        c.width = size;
        c.height = Math.round((size * img.naturalHeight) / img.naturalWidth);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, c.width, c.height);
      } else {
        c.width = c.height = size;
        ctx.imageSmoothingQuality = "high";
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      }
      return c.toDataURL("image/webp", 0.8);
    },
    { src: `/assets/renaissance/${name}.webp`, size, wide: shape === "wide" },
  );
  const buf = Buffer.from(data.split(",")[1], "base64");
  writeFileSync(`assets/renaissance/${name}-${shape === "wide" ? "xs" : "s"}.webp`, buf);
  console.log(`${name}-${shape === "wide" ? "xs" : "s"}.webp ${size}px ${Math.round(buf.length / 1024)} KB`);
}
await browser.close();
