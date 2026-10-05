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

  /** Official progression for accounts, transparent estimate for discovery. */
  function progression() {
    const E = window.TitanEffort;
    const id = owner();
    if (isGuest(id)) {
      const P = window.TitanProgress;
      const perDay = new Map();
      for (const l of P ? P.activeLogs(logs()) : []) {
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
    return { guest: false, estimated: false, level, xp, next, total: E.totalForLevel(level) + xp, rank: E.rank(level), nextRank: E.nextRank(level) };
  }

  window.TitanData = { owner, isGuest, logs, archived, pending, goals, cadenceSettings, setCadenceTarget, togglePause, progression };
})();
