/* TITAN 300 — first-party product analytics, consent-aware and minimal.
   - Only the events below, only the whitelisted properties (never health, weight, GPS, notes or free text).
   - Consent granted: the event is linked to the account so funnels (first → second session) can be read.
   - No answer yet: anonymous count only (no account, no referrer).  Refused: nothing is sent at all. */
(function () {
  "use strict";
  const EVENTS = new Set([
    "signup",
    "onboarding_completed",
    "first_session",
    "second_session",
    "goal_created",
    "record_unlocked",
    "campaign_started",
    "campaign_progress",
    "challenge_joined",
    "weekly_recap_viewed",
    "premium_checkout_started",
    "premium_activated",
    "sport_navigation_searched",
    "sport_navigation_filtered",
    "analysis_comparison_viewed",
    "analysis_report_viewed",
    "analysis_report_exported",
    "analysis_view_created",
    "analysis_view_renamed",
    "analysis_view_deleted",
    "analysis_view_opened",
  ]);
  const ANALYSIS = new Set([...EVENTS].filter(name => name.startsWith("analysis_")));
  const ONCE = new Set(["signup", "onboarding_completed", "first_session", "second_session", "premium_activated"]);
  const PROPS = { family: /^[a-z]{2,20}$/, sport: /^[a-z0-9_]{2,40}$/, step: /^[a-z0-9_-]{1,30}$/, source: /^[a-z0-9_-]{1,30}$/, plan: /^[a-z0-9_-]{1,30}$/, world: /^[a-z0-9_-]{1,30}$/, chapter: /^\d{1,2}$/, kind: /^[a-z_]{1,20}$/, count: /^\d{1,4}$/ };
  const PRIVACY_KEY = "titan_privacy_v1";
  const ONCE_KEY = "titan_analytics_once_v1";
  const sending = new Set();
  let consentSequence = 0;
  let authClient = null, authSequence = 0, authSubscription = null;

  function observeAuth(client) {
    if (client === authClient) return;
    authSubscription?.unsubscribe();
    authClient = client; authSequence++;
    authSubscription = client.auth.onAuthStateChange?.(event => {
      if (client === authClient && event !== "INITIAL_SESSION" && event !== "TOKEN_REFRESHED") authSequence++;
    })?.data?.subscription || null;
  }

  function consent() {
    try {
      const v = JSON.parse(localStorage.getItem(PRIVACY_KEY) || "null");
      return v?.analytics === "granted" ? "granted" : v?.analytics === "denied" ? "denied" : null;
    } catch {
      return null;
    }
  }
  function setConsent(granted) {
    consentSequence++;
    try {
      const v = JSON.parse(localStorage.getItem(PRIVACY_KEY) || "{}") || {};
      v.analytics = granted ? "granted" : "denied";
      v.at = new Date().toISOString();
      localStorage.setItem(PRIVACY_KEY, JSON.stringify(v));
    } catch {}
  }

  function clean(props, name) {
    if (ANALYSIS.has(name)) {
      return name.startsWith("analysis_view_") && ["report", "comparison"].includes(props?.kind) ? { kind: props.kind } : {};
    }
    const out = {};
    for (const [k, v] of Object.entries(props || {})) {
      if (!PROPS[k] || v === null || v === undefined) continue;
      const s = String(v);
      if (PROPS[k].test(s)) out[k] = /^\d+$/.test(s) && k !== "sport" ? Number(s) : s;
    }
    return out;
  }

  function onceKey(name, owner) {
    return `${owner || "anon"}:${name}`;
  }
  function seen(key) {
    try {
      return (JSON.parse(localStorage.getItem(ONCE_KEY) || "[]") || []).includes(key);
    } catch {
      return false;
    }
  }
  function remember(key) {
    try {
      const list = JSON.parse(localStorage.getItem(ONCE_KEY) || "[]") || [];
      list.push(key);
      localStorage.setItem(ONCE_KEY, JSON.stringify(list.slice(-200)));
    } catch {}
  }

  async function track(name, props = {}, attribution = {}) {
    if (!EVENTS.has(name)) return false;
    const c = consent();
    if (c === "denied") return false;
    if (!navigator.onLine || !window.titanClient || window.titanAccountTransition?.active) return false;
    const client = window.titanClient, owner = window.state?.user?.id, epoch = window.titanAccountTransition?.epoch, revision = consentSequence;
    try { observeAuth(client); } catch { return false; }
    const sessionRevision = authSequence, signupOwner = name === "signup" ? attribution?.owner || null : null;
    const current = () => client === window.titanClient && owner === window.state?.user?.id && epoch === window.titanAccountTransition?.epoch
      && !window.titanAccountTransition?.active && revision === consentSequence && sessionRevision === authSequence && consent() === c && navigator.onLine;
    const unique = ONCE.has(name); let key, locked = false;
    try {
      let userId = null, token = null;
      if (c === "granted") {
        const { data, error } = await client.auth.getSession();
        if (error) return false;
        userId = data?.session?.user?.id || null;
        token = data?.session?.access_token || null;
        if (userId && !token) return false;
        if (signupOwner && userId && userId !== signupOwner) return false;
        if (owner && !window.TitanData?.isGuest?.() && userId !== owner) return false;
      }
      key = onceKey(name, c === "granted" ? userId || signupOwner || owner : owner);
      if (!current() || (unique && (seen(key) || sending.has(key)))) return false;
      if (unique) { sending.add(key); locked = true; }
      // This token-only client has no persisted auth or refresh loop. The guard runs after
      // every SDK await, immediately before native dispatch; the shared client is untouched.
      const transport = window.supabase.createClient(window.TITAN_SUPABASE_URL, window.TITAN_SUPABASE_ANON_KEY, {
        accessToken: async () => token,
        db: { retry: false },
        global: { fetch: (input, init) => {
          if (!current()) throw new Error("STALE_ANALYTICS");
          return fetch(input, init);
        } },
      });
      const { error } = await transport.from("analytics_events").insert({
        user_id: userId,
        event_name: name,
        page: location.pathname.slice(0, 80),
        source: c === "granted" && !ANALYSIS.has(name) ? new URLSearchParams(location.search).get("utm_source")?.slice(0, 40) || null : null,
        referrer: null,
        metadata: { ...clean(props, name), consent: c === "granted" ? "granted" : "anonymous", v: 300 },
      });
      if (!error && unique) remember(key);
      return !error;
    } catch {
      return false;
    } finally {
      if (locked) sending.delete(key);
    }
  }

  window.addEventListener?.("storage", e => { if (e.key === PRIVACY_KEY || e.key === null) consentSequence++; });

  window.TitanAnalytics = { track, consent, setConsent, EVENTS };
  // Legacy callers (landing pages) keep working, through the same filter.
  if (!window.titanTrackEvent) window.titanTrackEvent = (name, metadata) => track(name, metadata);
})();
