// Real served brand assets in Chromium. Separate from the shared profile smoke suite.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(BASE + "/")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "local brand-asset server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage() {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

test("SEO branding: served icons decode at their declared sizes and maskable marks fit the safe zone", async () => {
  const { page, context } = await newPage();
  try {
    await page.goto(BASE + "/");
    const manifestResponse = await page.request.get(BASE + "/manifest.json");
    assert.equal(manifestResponse.status(), 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.short_name, "TITAN");
    assert.deepEqual(manifest.icons.filter(icon => icon.purpose?.split(/\s+/).includes("maskable")).map(icon => icon.sizes).sort(), ["192x192", "512x512"]);
    const resources = [...manifest.icons, { src: "/favicon.ico", sizes: "48x48" }, { src: "/image/apple-touch-icon.png", sizes: "180x180" }, { src: "/image/og-titan.jpg", sizes: "1200x630" }];
    for (const resource of resources) {
      assert.match(resource.src, /^\/(?!\/)/, "same-origin brand asset");
      const response = await page.request.get(BASE + resource.src);
      assert.equal(response.status(), 200, resource.src);
      assert.match(response.headers()["content-type"], /^image\//, resource.src);
      if (resource.src === "/favicon.ico") {
        const decodeResponse = await page.request.get(BASE + resource.src + "?brand-contract=1");
        assert.equal(decodeResponse.status(), 200);
        assert.deepEqual(await decodeResponse.body(), await response.body(), "favicon decode URL serves the canonical file bytes");
      }
    }
    const decoded = await page.evaluate(async resources => {
      const result = [];
      for (const resource of resources) {
        const image = new Image();
        // Playwright 1.56 aborts URLs ending in /favicon.ico when routing is on.
        // Keep third-party traffic blocked; the local server serves the same file
        // for this query variant. The canonical URL is checked with APIRequest above.
        image.src = resource.src === "/favicon.ico" ? resource.src + "?brand-contract=1" : resource.src;
        try { await image.decode(); } catch (error) { throw new Error(resource.src + ": " + error.message); }
        const item = { src: resource.src, width: image.naturalWidth, height: image.naturalHeight };
        if (resource.purpose?.split(/\s+/).includes("maskable")) {
          const canvas = document.createElement("canvas");
          canvas.width = item.width; canvas.height = item.height;
          const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
          const pixels = ctx.getImageData(0, 0, item.width, item.height).data;
          item.transparent = 0; item.foreground = 0; item.outsideSafeZone = 0;
          // Existing Titan PNGs have a flat opaque background. A contrast threshold
          // ignores antialiasing noise; it is a guard for these assets, not a general logo detector.
          const radius = 0.4 * Math.min(item.width, item.height);
          for (let y = 0; y < item.height; y++) for (let x = 0; x < item.width; x++) {
            const i = (y * item.width + x) * 4;
            if (pixels[i + 3] !== 255) item.transparent++;
            if (Math.max(...[0, 1, 2].map(c => Math.abs(pixels[i + c] - pixels[c]))) <= 24) continue;
            item.foreground++;
            if (Math.hypot(x + 0.5 - item.width / 2, y + 0.5 - item.height / 2) > radius) item.outsideSafeZone++;
          }
        }
        result.push(item);
      }
      return result;
    }, resources);
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i], image = decoded[i];
      assert.equal(`${image.width}x${image.height}`, resource.sizes, resource.src);
      if (resource.purpose?.split(/\s+/).includes("maskable")) {
        assert.equal(image.transparent, 0, resource.src + ": opaque background");
        assert.ok(image.foreground > 0, resource.src + ": a visible mark");
        assert.equal(image.outsideSafeZone, 0, resource.src + ": mark fits the 40% radius");
      }
    }
  } finally { await context.close(); }
});
