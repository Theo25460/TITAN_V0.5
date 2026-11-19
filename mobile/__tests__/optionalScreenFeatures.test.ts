// Play Console (19 Nov 2026) refused the review while android.hardware.screen.portrait was an implied REQUIRED feature.
const { applyManifest, OPTIONAL } = require("../plugins/with-optional-screen-features");

test("both screen orientations are declared optional, once, and an existing required entry is relaxed", () => {
  const fresh = applyManifest({ manifest: { $: {}, application: [{}] } });
  expect(fresh.manifest["uses-feature"]).toEqual(OPTIONAL.map((name: string) => ({ $: { "android:name": name, "android:required": "false" } })));
  const again = applyManifest(fresh);
  expect(again.manifest["uses-feature"]).toHaveLength(2);
  const forced = applyManifest({ manifest: { "uses-feature": [{ $: { "android:name": "android.hardware.screen.portrait", "android:required": "true" } }] } });
  expect(forced.manifest["uses-feature"].find((f: { $: Record<string, string> }) => f.$["android:name"] === "android.hardware.screen.portrait").$["android:required"]).toBe("false");
});

test("the plugin is registered in the app config", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../app.config.ts"), "utf8");
  expect(src).toContain("./plugins/with-optional-screen-features");
  expect(src).toMatch(/orientation: "portrait"/);
});
