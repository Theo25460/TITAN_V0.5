/* TITAN 300 — data access for Ascension pages.
   Reads the existing state/sync engine (state.js, main.js, IndexedDB queue). Never writes rewards:
   official XP, level and campaigns come from the server; discovery values are labelled as estimates. */
(function () {
  "use strict";
  const goalCache = new Map();

  const owner = () => window.state?.user?.id || null;
  const isGuest = (id = owner()) => !id || String(id).startsWith("guest_");

  function logs() {
    return Array.isArray(window.state?.history) ? window.state.history : [];
  }
  function archived() {
    return Array.isArray(window.state?.archivedHistory) ? window.state.archivedHistory : [];
  }
  function pending() {
    return window.TitanQueue?.list?.() || [];
  }

  async function goals({ force = false } = {}) {
    const id = owner();
    if (!id) return [];
    if (!force && goalCache.has(id)) return goalCache.get(id);
    const key = `titan_goals_v1:${id}`;
    const fromCache = () => {
      try {
        const g = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(g) ? g : [];
      } catch {
        return [];
      }
    };
    let list = fromCache();
    if (!isGuest(id) && window.titanClient && navigator.onLine) {
      try {
        const { data, error } = await window.titanClient.from("sport_goals").select("*").eq("user_id", id).order("id").limit(500);
        if (!error && Array.isArray(data) && owner() === id) {
          list = data;
          try {
            localStorage.setItem(key, JSON.stringify(data));
          } catch {}
        }
      } catch {}
    }
    if (owner() !== id) return [];
    goalCache.set(id, list);
    return list;
  }

  function cadenceSettings() {
    const u = window.state?.user || {};
    const target = Math.min(7, Math.max(1, parseInt(u.weeklyGoalSessions, 10) || 3));
    const pauses = Array.isArray(u.cadencePauses) ? u.cadencePauses.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)) : [];
    return { target, pauses };
  }

  function saveSettings(patch) {
    if (!window.state?.user) return;
    Object.assign(window.state.user, patch);
    window.saveState?.({ forceCloud: true });
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  }

  function setCadenceTarget(n) {
    saveSettings({ weeklyGoalSessions: Math.min(7, Math.max(1, Math.round(n))) });
  }

  function togglePause(weekKey) {
    const { pauses } = cadenceSettings();
    const next = pauses.includes(weekKey) ? pauses.filter((p) => p !== weekKey) : [...pauses, weekKey].slice(-52);
    saveSettings({ cadencePauses: next });
    return next.includes(weekKey);
  }

  /* ---------- Planned week ----------
     Same storage as before (state.user.schedule[monday…sunday]); the habits field of older
     versions is kept untouched. A day holds { sport, minutes?, note? }. */
  const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  function plan() {
    const raw = window.state?.user?.schedule || {};
    return DAY_KEYS.map((key, i) => {
      const d = raw[key] || {};
      const sport = d.sport && window.SPORTS_CONFIG?.[d.sport] ? d.sport : null;
      const minutes = Number(d.minutes) > 0 && Number(d.minutes) <= 600 ? Math.round(Number(d.minutes)) : null;
      return { key, index: i, sport, minutes: sport ? minutes : null, note: sport ? String(d.note || "").slice(0, 80) : "" };
    });
  }
  function planToday(now = new Date()) {
    const p = plan()[(new Date(now).getDay() + 6) % 7];
    return p.sport ? p : null;
  }
  function setPlanDay(key, value) {
    if (!window.state?.user || !DAY_KEYS.includes(key)) return;
    const schedule = { ...(window.state.user.schedule || {}) };
    const old = schedule[key] || {};
    schedule[key] = value?.sport
      ? { ...old, sport: value.sport, minutes: Number(value.minutes) > 0 ? Math.min(600, Math.round(Number(value.minutes))) : null, note: String(value.note || "").trim().slice(0, 80) }
      : { ...old, sport: null, minutes: null, note: "" };
    saveSettings({ schedule });
  }

  /** True when XP follows the effort rules (1 min ≈ 10 XP): discovery estimates, or an account whose server
      snapshot says v300 (version 2). Before the server update, the server computes XP with its former rules. */
  function rulesV300() {
    const id = owner();
    if (isGuest(id)) return true;
    const s = window.TitanAdventure?.snapshot;
    return Boolean(s && s.owner === id && !s.local && Number(s.version) >= 2);
  }

  /** Official progression for accounts, transparent estimate for discovery. */
  function progression() {
    const E = window.TitanEffort;
    const id = owner();
    if (isGuest(id)) {
      const P = window.TitanProgress;
      const perDay = new Map();
      for (const l of P ? P.activeLogs(logs()) : []) {
        if (E.isHistorical(l.date, new Date(l.created_at || Date.now()).getTime())) continue;
        const day = window.TitanFormat.dateKey(l.date);
        const xp = P.effortOf(l).xp || 0;
        perDay.set(day, Math.min(E.DAILY_XP_CAP, (perDay.get(day) || 0) + xp));
      }
      const total = [...perDay.values()].reduce((a, b) => a + b, 0);
      const lv = E.levelFromTotal(total);
      return { guest: true, estimated: true, level: lv.level, xp: lv.xp, next: lv.next, total, rank: E.rank(lv.level), nextRank: E.nextRank(lv.level) };
    }
    const s = window.TitanAdventure?.snapshot;
    const fromSnapshot = s && s.owner === id && !s.local;
    const level = Number(fromSnapshot ? s.level : window.state?.user?.level) || 1;
    const xp = Number(fromSnapshot ? s.xp : window.state?.user?.xp) || 0;
    const next = Number(fromSnapshot && s.next_level_xp) || E.levelRequirement(level);
    // `confirmed`: XP and the next threshold both come from the server snapshot, on the server's own curve.
    return { guest: false, estimated: false, confirmed: Boolean(fromSnapshot), level, xp, next, total: E.totalForLevel(level) + xp, rank: E.rank(level), nextRank: E.nextRank(level) };
  }

  /* ---------- Discovery → account ----------
     Sessions saved in discovery mode on this device can join the account once, through the
     regular sync queue (same client_event_id, so a retry never duplicates them). Sessions older
     than 30 days become history without rewards, by the server's rules. */
  const IMPORTED_KEY = "titan_guest_imported_v1";
  function importedIds() {
    try {
      const v = JSON.parse(localStorage.getItem(IMPORTED_KEY) || "{}");
      return new Set(Array.isArray(v.ids) ? v.ids : []);
    } catch {
      return new Set();
    }
  }
  async function guestCandidates() {
    const id = owner();
    const guestId = (() => {
      try {
        return localStorage.getItem("titan_guest_device_id_v1");
      } catch {
        return null;
      }
    })();
    if (isGuest(id) || !guestId || !window.TitanQueue?.readHistory) return [];
    const done = importedIds();
    const list = (await window.TitanQueue.readHistory(guestId)) || [];
    // Before the server update, sessions older than 30 days are refused: keep them on the device, not imported.
    const v300 = rulesV300();
    return list.filter((l) => !l.archived_at && !done.has(l.client_event_id || l.id) && Number(l.val) > 0 && (v300 || !window.TitanEffort.isHistorical(l.date)));
  }
  async function importGuestSessions() {
    const id = owner();
    if (isGuest(id)) throw new Error("ACCOUNT_REQUIRED");
    const list = await guestCandidates();
    const done = importedIds();
    for (const l of list) {
      const eventId = l.client_event_id || l.details?.client_event_id || l.id;
      if (!/^[0-9a-f-]{36}$/i.test(eventId)) continue;
      const details = { ...(l.details || {}), client_event_id: eventId, importedFromDiscovery: true };
      delete details.serverReward;
      await window.TitanQueue.put({
        key: `${id}:${eventId}`,
        ownerId: id,
        payload: { sport: l.sport, category: l.category || l.cat || "training", val: Number(l.val), unit: l.unit || "", date: l.date, details },
        reason: "Import depuis la découverte",
        status: "pending",
        queuedAt: new Date().toISOString(),
      });
      done.add(eventId);
    }
    try {
      localStorage.setItem(IMPORTED_KEY, JSON.stringify({ account: id, at: new Date().toISOString(), ids: [...done].slice(-2000) }));
    } catch {}
    await window.flushPendingTrainingLogs?.({ retry: true }).catch(() => {});
    await window.syncWithSupabase?.().catch?.(() => {});
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
    return list.length;
  }

  window.TitanData = { owner, isGuest, logs, archived, pending, goals, cadenceSettings, setCadenceTarget, togglePause, plan, planToday, setPlanDay, progression, rulesV300, guestCandidates, importGuestSessions };
})();
