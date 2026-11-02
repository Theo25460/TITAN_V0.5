const { apply } = require("../plugins/with-play-billing");

describe("Google Play Billing Library app bundle prerequisite", () => {
  const gradle = `plugins { id "com.android.application" }\nandroid { namespace "fr.titanapp.app" }\ndependencies {\n    implementation("com.facebook.react:react-android")\n}`;
  test("adds Play Billing 9.1.0 without affecting existing Android dependency", () => {
    const out = apply(gradle);
    expect(out).toContain('implementation "com.android.billingclient:billing:9.1.0"');
    expect(out).toContain('implementation("com.facebook.react:react-android")');
    expect(out).toContain("// titan-play-billing-library-9.1.0");
  });
  test("remains idempotent across Expo prebuilds", () => {
    const once = apply(gradle);
    expect(apply(once)).toBe(once);
  });
  test("fails closed when the Gradle template is incompatible", () => {
    expect(() => apply("android { }")).toThrow(/dependencies block missing/);
  });
});
