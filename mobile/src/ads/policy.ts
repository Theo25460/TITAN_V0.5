/* Advertising pressure rules, in one place and pure. Every figure is a CEILING, not a target; tune them here only.
   Principles: never during effort, never before a confirmed save, never block results, never for Premium, never surprise. */
export const RULES = {
  /** No interstitial during the first sessions of an account (discovery). */
  discoverySessions: 2,
  /** At most one interstitial every N recorded sessions. */
  everySessions: 5,
  /** Minimum gap between two interstitials. */
  minGapMs: 30 * 60_000,
  /** At most this many interstitials per local day. */
  perDay: 2,
  /** A recorded session event id stays remembered this long (idempotent counting). */
  seenKeep: 60,
} as const;

export type AdState = {
  v: 1;
  sessions: number; // confirmed sessions recorded on this phone for this account
  seen: string[]; // event ids already counted
  lastShownAt: number | null;
  lastShownSession: number; // value of `sessions` at the last interstitial (0 = never)
  day: string; // local YYYY-MM-DD of `today`
  today: number; // interstitials shown today
};
export const freshState = (): AdState => ({ v: 1, sessions: 0, seen: [], lastShownAt: null, lastShownSession: 0, day: "", today: 0 });

export const localDay = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Counts a really recorded (server-confirmed) session once, whatever the number of screens that report it. */
export function countSession(s: AdState, eventId: string): AdState {
  if (!eventId || s.seen.includes(eventId)) return s;
  return { ...s, sessions: s.sessions + 1, seen: [...s.seen, eventId].slice(-RULES.seenKeep) };
}

export type Context = {
  now: number;
  premium: boolean; // server-validated right (own TITAN+, coach plan, or a seat included by a coach)
  profileKnown: boolean; // rights not known yet => no ad
  consent: boolean; // the consent framework allows ad requests
  sdkReady: boolean;
  online: boolean;
  sessionActive: boolean; // GPS recording, workout or any other effort in progress
  busy: boolean; // saving / syncing
};

export type Verdict = { ok: true } | { ok: false; why: string };
const no = (why: string): Verdict => ({ ok: false, why });

/** Banners: only the blocking conditions; the three placements are the only screens that ever host one. */
export function bannerAllowed(c: Context): Verdict {
  if (!c.profileKnown) return no("rights-unknown");
  if (c.premium) return no("premium");
  if (!c.consent) return no("no-consent");
  if (!c.sdkReady) return no("sdk-not-ready");
  if (!c.online) return no("offline");
  if (c.sessionActive) return no("session-active");
  return { ok: true };
}

/** Interstitial after a recorded session. `ready` = the ad is already loaded: never wait for one. */
export function interstitialAllowed(s: AdState, c: Context, ready: boolean): Verdict {
  const b = bannerAllowed(c);
  if (!b.ok) return b;
  if (c.busy) return no("busy");
  if (!ready) return no("not-ready");
  if (s.sessions <= RULES.discoverySessions) return no("discovery");
  if (s.lastShownSession > 0 && s.sessions - s.lastShownSession < RULES.everySessions) return no("every-n-sessions");
  if (s.lastShownAt !== null && c.now - s.lastShownAt < RULES.minGapMs) return no("min-gap");
  const today = s.day === localDay(c.now) ? s.today : 0;
  if (today >= RULES.perDay) return no("daily-cap");
  return { ok: true };
}

export function recordShown(s: AdState, now: number): AdState {
  const day = localDay(now);
  return { ...s, lastShownAt: now, lastShownSession: s.sessions, day, today: (s.day === day ? s.today : 0) + 1 };
}
