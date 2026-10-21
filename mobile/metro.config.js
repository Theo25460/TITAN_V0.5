// Default Expo Metro config. With TITAN_PREVIEW=1 (web preview only, never the Android build),
// the data, auth and Supabase layers are swapped for local fixtures so screens can be inspected visually.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (process.env.TITAN_PREVIEW === "1") {
  const swaps = {
    "src/App": "preview/PreviewApp.tsx",
    "src/data/hooks": "preview/mocks/hooks.ts",
    "src/data/auth": "preview/mocks/auth.tsx",
    "src/lib/supabase": "preview/mocks/supabase.ts",
  };
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolved = context.resolveRequest(context, moduleName, platform);
    if (resolved.type !== "sourceFile") return resolved;
    const rel = path.relative(__dirname, resolved.filePath).split(path.sep).join("/").replace(/\.(tsx?|jsx?)$/, "");
    const swap = swaps[rel];
    const fromPreview = path.relative(__dirname, context.originModulePath).startsWith("preview");
    return swap && !fromPreview ? { type: "sourceFile", filePath: path.join(__dirname, swap) } : resolved;
  };
}

module.exports = config;
