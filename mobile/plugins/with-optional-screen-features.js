// TITAN — the interface stays locked in portrait (app.config.ts `orientation`), but a locked orientation makes Google Play infer a
// REQUIRED hardware feature android.hardware.screen.portrait, which blocks the release review ("Les déclarations de fonctionnalités
// matérielles requises limitent la disponibilité de votre appli", Play Console, 19 Nov 2026) and hides the app from tablets, desktops
// and Android XR. Declaring both screen orientations as optional keeps the portrait layout and lets every device install the app.
const { withAndroidManifest } = require("expo/config-plugins");

const OPTIONAL = ["android.hardware.screen.portrait", "android.hardware.screen.landscape"];

/** Adds <uses-feature android:name="…" android:required="false"/> once per feature (an existing entry is set to not required). */
function applyManifest(manifest) {
  const root = manifest.manifest;
  root["uses-feature"] = root["uses-feature"] || [];
  for (const name of OPTIONAL) {
    const existing = root["uses-feature"].find((f) => f.$?.["android:name"] === name);
    if (existing) existing.$["android:required"] = "false";
    else root["uses-feature"].push({ $: { "android:name": name, "android:required": "false" } });
  }
  return manifest;
}

module.exports = function withOptionalScreenFeatures(config) {
  return withAndroidManifest(config, (c) => {
    c.modResults = applyManifest(c.modResults);
    return c;
  });
};
module.exports.applyManifest = applyManifest;
module.exports.OPTIONAL = OPTIONAL;
