// TITAN — static Android app shortcuts (AUD-14): a long press on the launcher icon offers « Nouvelle séance », « Journal » and
// « Progrès ». Each opens an existing titan:// route handled by src/navigation/linking.ts; nothing new is exposed.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const SHORTCUTS = [
  { id: "seance", short: "Séance", long: "Nouvelle séance", url: "titan://seance" },
  { id: "journal", short: "Journal", long: "Mon journal", url: "titan://journal" },
  { id: "progres", short: "Progrès", long: "Mes progrès", url: "titan://progres" },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "\\'");

function shortcutsXml(pkg) {
  const items = SHORTCUTS.map((s) => `  <shortcut android:shortcutId="${s.id}" android:enabled="true" android:icon="@mipmap/ic_launcher" android:shortcutShortLabel="@string/titan_shortcut_${s.id}_short" android:shortcutLongLabel="@string/titan_shortcut_${s.id}_long">
    <intent android:action="android.intent.action.VIEW" android:data="${s.url}" android:targetPackage="${pkg}" android:targetClass="${pkg}.MainActivity" />
  </shortcut>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>\n<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">\n${items}\n</shortcuts>\n`;
}

function stringsXml() {
  const rows = SHORTCUTS.flatMap((s) => [`  <string name="titan_shortcut_${s.id}_short">${esc(s.short)}</string>`, `  <string name="titan_shortcut_${s.id}_long">${esc(s.long)}</string>`]);
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${rows.join("\n")}\n</resources>\n`;
}

/** Adds <meta-data android.app.shortcuts> to the launcher activity, once. */
function applyManifest(manifest) {
  const app = manifest.manifest.application?.[0];
  const activity = (app?.activity || []).find((a) => (a["intent-filter"] || []).some((f) => (f.category || []).some((c) => c.$["android:name"] === "android.intent.category.LAUNCHER")));
  if (!activity) throw new Error("with-app-shortcuts: launcher activity not found");
  activity["meta-data"] = activity["meta-data"] || [];
  if (!activity["meta-data"].some((m) => m.$["android:name"] === "android.app.shortcuts"))
    activity["meta-data"].push({ $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/shortcuts" } });
  return manifest;
}

module.exports = function withAppShortcuts(config) {
  const pkg = config.android?.package;
  if (!pkg) throw new Error("with-app-shortcuts: android.package is required");
  config = withAndroidManifest(config, (c) => {
    c.modResults = applyManifest(c.modResults);
    return c;
  });
  return withDangerousMod(config, ["android", (c) => {
    const res = path.join(c.modRequest.platformProjectRoot, "app", "src", "main", "res");
    fs.mkdirSync(path.join(res, "xml"), { recursive: true });
    fs.mkdirSync(path.join(res, "values"), { recursive: true });
    fs.writeFileSync(path.join(res, "xml", "shortcuts.xml"), shortcutsXml(pkg));
    fs.writeFileSync(path.join(res, "values", "titan_shortcuts.xml"), stringsXml());
    return c;
  }]);
};
module.exports.SHORTCUTS = SHORTCUTS;
module.exports.shortcutsXml = shortcutsXml;
module.exports.stringsXml = stringsXml;
module.exports.applyManifest = applyManifest;
