import { createAdsManager, type AdsSdk, type ConsentInfo } from "../src/ads/manager";

function sdk(over: Partial<{ info: ConsentInfo; reqFails: boolean; cfgFails: boolean }> = {}) {
  const calls: string[] = [];
  const info = over.info ?? { canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED", status: "OBTAINED" };
  const api: AdsSdk = {
    consent: {
      requestInfoUpdate: async (o) => {
        calls.push(`info:${JSON.stringify(o)}`);
        if (over.reqFails) throw new Error("network");
      },
      loadAndShowConsentFormIfRequired: async () => (calls.push("form"), info),
      showPrivacyOptionsForm: async () => void calls.push("options"),
      getConsentInfo: async () => info,
    },
    configure: async () => {
      calls.push("configure");
      if (over.cfgFails) throw new Error("sdk");
    },
  };
  return { api, calls };
}

test("the SDK starts only after consent: info, form if required, then configuration", async () => {
  const s = sdk();
  const m = createAdsManager(() => s.api);
  expect(m.get().phase).toBe("idle");
  const r = await m.start();
  expect(r).toEqual({ phase: "ready", canRequestAds: true, privacyOptions: true });
  expect(s.calls).toEqual(['info:{"tagForUnderAgeOfConsent":false}', "form", "configure"]);
  await m.start();
  expect(s.calls.filter((c) => c === "configure")).toHaveLength(1); // idempotent
});

test("a refusal never initialises the SDK, and is not asked again behind the user's back", async () => {
  const s = sdk({ info: { canRequestAds: false, status: "REQUIRED", privacyOptionsRequirementStatus: "REQUIRED" } });
  const m = createAdsManager(() => s.api);
  expect((await m.start()).phase).toBe("denied");
  expect(s.calls).not.toContain("configure");
  await m.start();
  expect(s.calls.filter((c) => c === "form")).toHaveLength(1);
});

test("an error leaves no ads and no exception, and retries at most once a minute", async () => {
  let t = 1000;
  const s = sdk({ reqFails: true });
  const m = createAdsManager(() => s.api, () => t);
  expect((await m.start()).phase).toBe("error");
  await m.start();
  expect(s.calls.filter((c) => c.startsWith("info")).length).toBe(1);
  t += 61_000;
  await m.start();
  expect(s.calls.filter((c) => c.startsWith("info")).length).toBe(2);
  expect(createAdsManager(() => { throw new Error("native module missing"); }).start()).resolves.toMatchObject({ phase: "error" });
});

test("two simultaneous starts share one run", async () => {
  const s = sdk();
  const m = createAdsManager(() => s.api);
  await Promise.all([m.start(), m.start()]);
  expect(s.calls.filter((c) => c === "form")).toHaveLength(1);
});

test("privacy options: changing the choice to allow ads starts the SDK, to refuse stops further requests", async () => {
  const s = sdk({ info: { canRequestAds: false, status: "REQUIRED", privacyOptionsRequirementStatus: "REQUIRED" } });
  let allow = false;
  s.api.consent.getConsentInfo = async () => ({ canRequestAds: allow, privacyOptionsRequirementStatus: "REQUIRED" });
  const m = createAdsManager(() => s.api);
  await m.start();
  expect(m.get().phase).toBe("denied");
  allow = true;
  expect((await m.openPrivacyOptions()).phase).toBe("ready");
  expect(s.calls).toContain("configure");
  allow = false;
  expect((await m.openPrivacyOptions()).phase).toBe("denied");
});

test("listeners hear every change", async () => {
  const m = createAdsManager(() => sdk().api);
  const seen: string[] = [];
  m.subscribe(() => seen.push(m.get().phase));
  await m.start();
  expect(seen).toEqual(["starting", "ready"]);
});
