// TITAN — Google Play Billing Library detection in Play Console.
// This prepares the signed AAB to unlock subscriptions in Play Console.
// It DOES NOT launch purchases, validate receipts, grant TITAN+ or activate billing UI.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// titan-play-billing-library-9.1.0";
const DEPENDENCY = 'implementation "com.android.billingclient:billing:9.1.0"';

function apply(gradle) {
  if (gradle.includes(MARKER)) {
    if (!gradle.includes(DEPENDENCY)) throw new Error("with-play-billing: marker without Billing dependency");
    return gradle;
  }
  const dependencies = /\bdependencies\s*\{/;
  if (!dependencies.test(gradle)) throw new Error("with-play-billing: dependencies block missing in app/build.gradle");
  return gradle.replace(dependencies, (match) => `${match}\n    ${MARKER}\n    ${DEPENDENCY}`);
}

module.exports = function withPlayBilling(config) {
  return withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== "groovy") throw new Error("with-play-billing: expected Groovy app/build.gradle");
    c.modResults.contents = apply(c.modResults.contents);
    return c;
  });
};
module.exports.apply = apply;
