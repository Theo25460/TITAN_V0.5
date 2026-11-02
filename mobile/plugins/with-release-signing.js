// Release signing from environment variables, so no key, password or keystore ever lives in the repository.
// CI sets TITAN_UPLOAD_STORE_FILE / TITAN_UPLOAD_STORE_PASSWORD / TITAN_UPLOAD_KEY_ALIAS / TITAN_UPLOAD_KEY_PASSWORD
// either from the Play upload key secrets or from a throwaway key generated for test builds.
// Without them (local development) the release build keeps the debug signature and Gradle prints a warning.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// titan-release-signing";

const SIGNING = `
    ${MARKER}
    signingConfigs {
        titanRelease {
            def storePath = System.getenv("TITAN_UPLOAD_STORE_FILE")
            if (storePath) {
                storeFile file(storePath)
                storePassword System.getenv("TITAN_UPLOAD_STORE_PASSWORD")
                keyAlias System.getenv("TITAN_UPLOAD_KEY_ALIAS") ?: "titan"
                keyPassword System.getenv("TITAN_UPLOAD_KEY_PASSWORD")
            }
        }
    }
`;

function apply(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  // Declare the extra signing configuration right after the android { line.
  let out = gradle.replace(/android\s*\{/, (m) => `${m}${SIGNING}`);
  // In the release build type, use it when the variables are present.
  const release = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;
  if (!release.test(out)) throw new Error("with-release-signing: release signingConfig not found in app/build.gradle");
  out = out.replace(
    release,
    `$1signingConfig System.getenv("TITAN_UPLOAD_STORE_FILE") ? signingConfigs.titanRelease : signingConfigs.debug
            if (!System.getenv("TITAN_UPLOAD_STORE_FILE")) logger.warn("TITAN: release build signed with the DEBUG key (local only, never publish)")`,
  );
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = apply(c.modResults.contents);
    return c;
  });
};
module.exports.apply = apply;
