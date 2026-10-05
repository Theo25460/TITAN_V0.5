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
  ]);
  const ONCE = new Set(["signup", "onboarding_completed", "first_session", "second_session", "premium_activated"]);
  const PROPS = { family: /^[a-z]{2,20}$/, sport: /^[a-z0-9_]{2,40}$/, step: /^[a-z0-9_-]{1,30}$/, source: /^[a-z0-9_-]{1,30}$/, plan: /^[a-z0-9_-]{1,30}$/, world: /^[a-z0-9_-]{1,30}$/, chapter: /^\d{1,2}$/, kind: /^[a-z_]{1,20}$/, count: /^\d{1,4}$/ };
  const PRIVACY_KEY = "titan_privacy_v1";
  const ONCE_KEY = "titan_analytics_once_v1";

  function consent() {
    try {
      const v = JSON.parse(localStorage.getItem(PRIVACY_KEY) || "null");
      return v?.analytics === "granted" ? "granted" : v?.analytics === "denied" ? "denied" : null;
    } catch {
      return null;
    }
  }
  function setConsent(granted) {
    try {
      const v = JSON.parse(localStorage.getItem(PRIVACY_KEY) || "{}") || {};
      v.analytics = granted ? "granted" : "denied";
      v.at = new Date().toISOString();
      localStorage.setItem(PRIVACY_KEY, JSON.stringify(v));
    } catch {}
  }

  function clean(props) {
    const out = {};
    for (const [k, v] of Object.entries(props || {})) {
      if (!PROPS[k] || v === null || v === undefined) continue;
      const s = String(v);
      if (PROPS[k].test(s)) out[k] = /^\d+$/.test(s) && k !== "sport" ? Number(s) : s;
    }
    return out;
  }

  function onceKey(name) {
    return `${window.state?.user?.id || "anon"}:${name}`;
  }
  function seen(name) {
    try {
      return (JSON.parse(localStorage.getItem(ONCE_KEY) || "[]") || []).includes(onceKey(name));
    } catch {
      return false;
    }
  }
  function remember(name) {
    try {
      const list = JSON.parse(localStorage.getItem(ONCE_KEY) || "[]") || [];
      list.push(onceKey(name));
      localStorage.setItem(ONCE_KEY, JSON.stringify(list.slice(-200)));
    } catch {}
  }

  async function track(name, props = {}) {
    if (!EVENTS.has(name)) return false;
    const c = consent();
    if (c === "denied") return false;
    if (ONCE.has(name)) {
      if (seen(name)) return false;
      remember(name);
    }
    if (!navigator.onLine || !window.titanClient) return false;
    try {
      let userId = null;
      if (c === "granted") {
        const session = (await window.titanClient.auth.getSession())?.data?.session;
        userId = session?.user?.id || null;
      }
      const { error } = await window.titanClient.from("analytics_events").insert({
        user_id: userId,
        event_name: name,
        page: location.pathname.slice(0, 80),
        source: c === "granted" ? new URLSearchParams(location.search).get("utm_source")?.slice(0, 40) || null : null,
        referrer: null,
        metadata: { ...clean(props), consent: c === "granted" ? "granted" : "anonymous", v: 300 },
      });
      return !error;
    } catch {
      return false;
    }
  }

  window.TitanAnalytics = { track, consent, setConsent, EVENTS };
  // Legacy callers (landing pages) keep working, through the same filter.
  if (!window.titanTrackEvent) window.titanTrackEvent = (name, metadata) => track(name, metadata);
})();
