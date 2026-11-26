// Opens the Three.js reward viewer in Chromium (WebGL via SwiftShader), waits for the GLB, captures it, logs WebGL renderer.
import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [w, h, suffix, reduce] of [[1280, 720, "desktop", false], [390, 844, "phone", true]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: reduce ? "reduce" : "no-preference" });
  const logs = []; p.on("console", m => logs.push(m.text())); p.on("pageerror", e => logs.push("ERR " + e.message)); p.on("response", r => { if (r.status() >= 400) logs.push(r.status() + " " + r.url()); });
  // the page imports three@0.186.0 from jsDelivr; the browser here has no route to the CDN, so the same version is served
  // from a local npm install (THREE_DIR) under the same URLs. The bytes are the published package.
  if (process.env.THREE_DIR) await p.route("https://cdn.jsdelivr.net/npm/three@0.186.0/**", async r => { const rel = new URL(r.request().url()).pathname.replace("/npm/three@0.186.0/", ""); const { readFileSync } = await import("node:fs"); r.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(process.env.THREE_DIR + "/" + rel) }); });
  await p.goto(url); await p.waitForFunction(() => window.__ready, null, { timeout: 60000 }).catch(() => logs.push("timeout"));
  await p.waitForTimeout(2500);
  const gl = await p.evaluate(() => { const c = document.createElement("canvas").getContext("webgl2"); const d = c && c.getExtension("WEBGL_debug_renderer_info"); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : (c ? "webgl2" : "none"); });
  const ready = await p.evaluate(() => window.__ready);
  await p.screenshot({ path: out.replace(".png", `-${suffix}.png`) });
  console.log(suffix, "ready:", ready, "gl:", gl, logs.slice(0, 4).join(" | "));
}
await b.close();
