/* AUD-14: static launcher shortcuts point only at existing titan:// routes, and the plugin wires them once. */
/* eslint-disable @typescript-eslint/no-require-imports */
const plugin = require("../plugins/with-app-shortcuts");
import { linking } from "../src/navigation/linking";

test("every shortcut opens a route the app already handles", () => {
  for (const s of plugin.SHORTCUTS) {
    const state = linking.getStateFromPath!(s.url.replace("titan://", "/"), linking.config as never);
    expect(state).toBeTruthy();
  }
});

test("the XML targets the app's own activity and uses string resources", () => {
  const xml = plugin.shortcutsXml("fr.titanapp.app");
  expect(xml).toContain('android:targetClass="fr.titanapp.app.MainActivity"');
  expect(xml.match(/<shortcut /g)).toHaveLength(3);
  expect(plugin.stringsXml()).toContain("Nouvelle séance");
});

test("the launcher activity gets the shortcuts meta-data exactly once", () => {
  const manifest = { manifest: { application: [{ activity: [{ $: { "android:name": ".MainActivity" }, "intent-filter": [{ category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }] }] }] }] } };
  plugin.applyManifest(manifest);
  plugin.applyManifest(manifest);
  const meta = (manifest.manifest.application[0].activity[0] as Record<string, unknown>)["meta-data"];
  expect(meta).toEqual([{ $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/shortcuts" } }]);
});
