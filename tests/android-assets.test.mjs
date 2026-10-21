// AND10 / AND11: the Android launcher icon and the splash come from the current logo and survive the adaptive-icon mask.
// Pure Node PNG decoding (no image library): dimensions, opacity, size, safe zone of the glyph and colour coherence.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname;
const twa = JSON.parse(readFileSync(`${root}android/twa-manifest.json`, "utf8"));
const local = (url) => `${root}${new URL(url).pathname.replace(/^\//, "")}`;

function decode(path) {
  const buf = readFileSync(path);
  assert.equal(buf.subarray(1, 4).toString(), "PNG", `${path} is a PNG`);
  let pos = 8, width = 0, height = 0, depth = 0, color = 0, interlace = 0;
  const data = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos), type = buf.subarray(pos + 4, pos + 8).toString();
    const body = buf.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; color = body[9]; interlace = body[12]; }
    if (type === "IDAT") data.push(body);
    pos += 12 + length;
  }
  assert.equal(depth, 8, "8-bit channels");
  assert.equal(interlace, 0, "not interlaced");
  assert.ok(color === 2 || color === 6, "RGB or RGBA");
  const bpp = color === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(data)), out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const predictor = [0, a, b, (a + b) >> 1, (() => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })()][filter];
      out[y * stride + x] = (row[x] + predictor) & 255;
    }
  }
  return { width, height, bpp, pixels: out };
}
const pixel = (img, x, y) => [...img.pixels.subarray((y * img.width + x) * img.bpp, (y * img.width + x) * img.bpp + img.bpp)];

// The launcher icon is judged on the W3C safe circle (80 %); the maskable one becomes the 108 dp adaptive foreground, whose
// guaranteed-visible circle is 66 dp, about 61 % of the icon: it gets its own, smaller glyph.
for (const [label, url, safe] of [["launcher icon", twa.iconUrl, 0.4], ["maskable icon", twa.maskableIconUrl, 0.305]]) {
  test(`${label} meets the Play and adaptive-icon rules`, () => {
    const path = local(url);
    assert.ok(statSync(path).size <= 1024 * 1024, "at most 1 MB");
    const img = decode(path);
    assert.deepEqual([img.width, img.height], [512, 512]);
    const corner = pixel(img, 2, 2);
    let farthest = 0;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const p = pixel(img, x, y);
        if (img.bpp === 4) assert.equal(p[3], 255, "fully opaque (the mask supplies the shape)");
        if (Math.abs(p[0] - corner[0]) + Math.abs(p[1] - corner[1]) + Math.abs(p[2] - corner[2]) > 40) farthest = Math.max(farthest, Math.hypot(x - 256, y - 256));
      }
    }
    assert.ok(farthest > 50, "the glyph is present");
    assert.ok(farthest <= safe * 512, `the glyph stays inside the safe circle (${Math.round(safe * 200)} % of the icon): ${Math.round(farthest)} px from the centre, limit ${Math.round(safe * 512)}`);
  });
}

test("the manifest maskable icons are the padded variants and share the background", () => {
  const manifest = JSON.parse(readFileSync(`${root}manifest.json`, "utf8"));
  const maskable = manifest.icons.filter((i) => /maskable/.test(i.purpose || ""));
  assert.ok(maskable.length >= 2);
  const bg = pixel(decode(local(twa.iconUrl)), 2, 2).join();
  for (const icon of maskable) {
    assert.match(icon.src, /logo-maskable-/, `${icon.src} is a dedicated maskable icon`);
    const img = decode(`${root}${icon.src.replace(/^\//, "")}`);
    assert.equal(img.width, Number(icon.sizes.split("x")[0]), `${icon.src} has the declared size`);
    assert.equal(pixel(img, 1, 1).join(), bg, `${icon.src} shares the launcher background`);
  }
  assert.equal(new URL(twa.maskableIconUrl).pathname, "/image/logo-maskable-512.png");
});

test("the splash and system colours match the icon background", () => {
  const img = decode(local(twa.iconUrl));
  const [r, g, b] = pixel(img, 2, 2);
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toLowerCase();
  for (const key of ["backgroundColor", "themeColor", "themeColorDark", "navigationColor", "navigationColorDark", "navigationDividerColor", "navigationDividerColorDark"]) {
    assert.equal(String(twa[key]).toLowerCase(), hex, `${key} equals the icon background ${hex}`);
  }
  assert.ok(twa.splashScreenFadeOutDuration > 0 && twa.splashScreenFadeOutDuration <= 500, "a short splash fade");
  for (const shortcut of twa.shortcuts || []) assert.ok(statSync(local(shortcut.chosenIconUrl)).size > 500, `${shortcut.name}: icon exists`);
});
