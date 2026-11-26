/* The interstitial controller alone, with a fake ad: never shows an ad that is not loaded or too old, survives SDK errors. */
import { createInterstitial, INTERSTITIAL_MAX_AGE_MS, type FullscreenAd } from "../src/ads/interstitial";

function fakeAd() {
  const l: Record<string, (() => void)[]> = { loaded: [], closed: [], error: [] };
  const on = (k: string) => (f: () => void) => { l[k].push(f); return () => { l[k] = l[k].filter((g) => g !== f); }; };
  const ad: FullscreenAd & { emit(k: string): void; loads: number } = {
    loads: 0,
    load() { ad.loads++; },
    show: jest.fn(async () => {}),
    onLoaded: on("loaded"), onClosed: on("closed"), onError: on("error"),
    emit: (k) => l[k].forEach((f) => f()),
  };
  return ad;
}

test("a loaded ad older than Google's one-hour validity is not shown: it is dropped and a fresh one is requested", async () => {
  let t = 0;
  const made: ReturnType<typeof fakeAd>[] = [];
  const c = createInterstitial(() => { const a = fakeAd(); made.push(a); return a; }, () => t);
  c.prepare();
  made[0].emit("loaded");
  expect(c.isReady()).toBe(true);
  t = INTERSTITIAL_MAX_AGE_MS + 1;
  expect(c.isReady()).toBe(false);
  expect(await c.show()).toBe(false);
  expect(made[0].show).not.toHaveBeenCalled();
  c.prepare();
  expect(made).toHaveLength(2);
  expect(made[1].loads).toBe(1);
});

test("an ad that is still loading is never awaited, and a load error leaves the controller reusable", async () => {
  const made: ReturnType<typeof fakeAd>[] = [];
  const c = createInterstitial(() => { const a = fakeAd(); made.push(a); return a; });
  c.prepare();
  expect(await c.show()).toBe(false);
  made[0].emit("error");
  c.prepare();
  expect(made).toHaveLength(2);
});

test("an SDK that throws while creating the ad changes nothing for the user", async () => {
  const c = createInterstitial(() => { throw new Error("no native module"); });
  expect(() => c.prepare()).not.toThrow();
  expect(c.isReady()).toBe(false);
  expect(await c.show()).toBe(false);
});
