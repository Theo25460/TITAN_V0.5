import { bannerAllowed, countSession, freshState, interstitialAllowed, localDay, recordShown, RULES, type AdState, type Context } from "../src/ads/policy";

const T = new Date(2026, 10, 2, 10, 0, 0).getTime();
const ctx = (o: Partial<Context> = {}): Context => ({ now: T, premium: false, profileKnown: true, consent: true, sdkReady: true, online: true, sessionActive: false, busy: false, ...o });
const after = (n: number): AdState => {
  let s = freshState();
  for (let i = 0; i < n; i++) s = countSession(s, `e${i}`);
  return s;
};

test("banners: shown only to a free account with consent, SDK ready, online and no effort in progress", () => {
  expect(bannerAllowed(ctx())).toEqual({ ok: true });
  expect(bannerAllowed(ctx({ premium: true }))).toEqual({ ok: false, why: "premium" });
  expect(bannerAllowed(ctx({ profileKnown: false }))).toEqual({ ok: false, why: "rights-unknown" });
  expect(bannerAllowed(ctx({ consent: false }))).toEqual({ ok: false, why: "no-consent" });
  expect(bannerAllowed(ctx({ sdkReady: false }))).toEqual({ ok: false, why: "sdk-not-ready" });
  expect(bannerAllowed(ctx({ online: false }))).toEqual({ ok: false, why: "offline" });
  expect(bannerAllowed(ctx({ sessionActive: true }))).toEqual({ ok: false, why: "session-active" });
});

test("a session is counted once, whatever the number of screens reporting it", () => {
  let s = freshState();
  s = countSession(s, "a");
  s = countSession(s, "a");
  s = countSession(s, "");
  expect(s.sessions).toBe(1);
  expect(after(80).seen).toHaveLength(RULES.seenKeep);
});

test("no interstitial during the first two sessions, first eligible at five and then at most one every five sessions", () => {
  expect(interstitialAllowed(after(1), ctx(), true)).toEqual({ ok: false, why: "discovery" });
  expect(interstitialAllowed(after(2), ctx(), true)).toEqual({ ok: false, why: "discovery" });
  for (const n of [3, 4]) expect(interstitialAllowed(after(n), ctx(), true)).toEqual({ ok: false, why: "every-n-sessions" });
  expect(interstitialAllowed(after(5), ctx(), true)).toEqual({ ok: true });
  let s = recordShown(after(5), T);
  for (const n of [6, 7, 8, 9]) s = countSession(s, `x${n}`);
  expect(interstitialAllowed(s, ctx({ now: T + 3 * 3600_000 }), true)).toEqual({ ok: false, why: "every-n-sessions" });
  s = countSession(s, "x10");
  expect(interstitialAllowed(s, ctx({ now: T + 3 * 3600_000 }), true)).toEqual({ ok: true });
});

test("at least 30 minutes between two, at most two a day, a new day resets the count only", () => {
  const base = after(3);
  const grown = (s: AdState, n: number) => Array.from({ length: n }, (_, i) => `g${i}${s.sessions}`).reduce(countSession, s);
  let s = recordShown(base, T);
  s = grown(s, 5);
  expect(interstitialAllowed(s, ctx({ now: T + 29 * 60_000 }), true)).toEqual({ ok: false, why: "min-gap" });
  expect(interstitialAllowed(s, ctx({ now: T + 31 * 60_000 }), true)).toEqual({ ok: true });
  s = recordShown(s, T + 31 * 60_000);
  s = grown(s, 5);
  expect(s.today).toBe(2);
  expect(interstitialAllowed(s, ctx({ now: T + 3 * 3600_000 }), true)).toEqual({ ok: false, why: "daily-cap" });
  const tomorrow = T + 24 * 3600_000;
  expect(localDay(tomorrow)).not.toBe(localDay(T));
  expect(interstitialAllowed(s, ctx({ now: tomorrow }), true)).toEqual({ ok: true });
});

test("never when not ready (no waiting), busy, premium, offline, or during an effort", () => {
  const s = after(4);
  expect(interstitialAllowed(s, ctx(), false)).toEqual({ ok: false, why: "not-ready" });
  expect(interstitialAllowed(s, ctx({ busy: true }), true)).toEqual({ ok: false, why: "busy" });
  expect(interstitialAllowed(s, ctx({ premium: true }), true)).toEqual({ ok: false, why: "premium" });
  expect(interstitialAllowed(s, ctx({ online: false }), true)).toEqual({ ok: false, why: "offline" });
  expect(interstitialAllowed(s, ctx({ sessionActive: true }), true)).toEqual({ ok: false, why: "session-active" });
  expect(interstitialAllowed(s, ctx({ consent: false }), true)).toEqual({ ok: false, why: "no-consent" });
});

test("the ceilings are the ones the owner set", () => {
  expect(RULES).toMatchObject({ discoverySessions: 2, everySessions: 5, minGapMs: 1_800_000, perDay: 2 });
});
