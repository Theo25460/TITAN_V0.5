/* TITAN 300 — data access for Ascension pages.
   Reads the existing state/sync engine (state.js, main.js, IndexedDB queue). Never writes rewards:
   official XP, level and campaigns come from the server; discovery values are labelled as estimates. */
(function () {
  "use strict";
  let goalContext = null;
  let goalReadSequence = 0;
  let goalCache = null;

  function invalidateGoals() {
    goalContext = null;
    goalCache = null;
    goalReadSequence++;
  }
  window.addEventListener("titan:account-changing", invalidateGoals);

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

  const sessionDraftKey = (id = owner()) => `titan_seance_draft_v3:${id}`;
  function sessionDraft() {
    const id = owner();
    if (!id || window.titanAccountTransition?.active) return null;
    try {
      const draft = JSON.parse(localStorage.getItem(sessionDraftKey(id)) || "null");
      return draft?.sport && window.TitanSports?.conf(draft.sport) && Date.now() - draft.updatedAt < 2 * 86400000 ? draft : null;
    } catch {
      return null;
    }
  }

  async function goals({ force = false } = {}) {
    const id = owner();
    if (!id || window.titanAccountTransition?.active) {
      invalidateGoals();
      return [];
    }
    const client = window.titanClient;
    const epoch = window.titanAccountTransition?.epoch;
    if (!goalContext || goalContext.owner !== id || goalContext.client !== client || goalContext.epoch !== epoch) {
      invalidateGoals();
      goalContext = { owner: id, client, epoch };
    }
    const ctx = goalContext;
    if (!force && goalCache) return goalCache;
    const request = ++goalReadSequence;
    const current = () => goalContext === ctx && request === goalReadSequence && owner() === id
      && window.titanClient === client && window.titanAccountTransition?.epoch === epoch
      && !window.titanAccountTransition?.active;
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
    if (!isGuest(id) && client && navigator.onLine) {
      try {
        const { data, error } = await client.from("sport_goals").select("*").eq("user_id", id).order("id").limit(500);
        if (!current()) return [];
        if (!error && Array.isArray(data)) {
          list = data;
          try {
            localStorage.setItem(key, JSON.stringify(data));
          } catch {}
        }
      } catch {}
    }
    if (!current()) return [];
    goalCache = list;
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
  const WP = () => window.TitanWeekPlan;
  const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };
  const todayKey = (now = new Date()) => window.TitanFormat.dateKey(now);

  /* ---------- V1.7.2 — Planifié et réalisé (js/core/week-plan.js) ----------
     The week as planned on its Monday, the athlete's decisions (move, replace, skip, tie a session) and the sessions really done. */
  function weekPlan(day, now = new Date()) {
    if (!WP()) return null;
    return WP().week(window.state?.user?.schedule || {}, logs(), { week: day ? window.TitanFormat.dateKey(day) : undefined, today: todayKey(now), zone: deviceZone(), pauses: cadenceSettings().pauses });
  }
  /** The sport of each day of this week once moves and replacements are applied (the programme grid and the QG read it). */
  function weekPlanSports(now = new Date()) {
    const v = weekPlan(null, now);
    if (!v) return plan().map((p) => p.sport);
    const out = [null, null, null, null, null, null, null];
    for (const o of v.occurrences) {
      if (o.status === "skipped") continue;
      const i = WP().dayIndex(o.effective.day);
      if (!out[i]) out[i] = o.effective.sport;
    }
    return out;
  }
  function decideOccurrence(id, decision) {
    if (!window.state?.user || !WP()) throw new Error("WEEK_PLAN_UNAVAILABLE");
    const schedule = WP().decide(window.state.user.schedule || {}, id, decision, { today: todayKey() });
    saveSettings({ schedule });
  }

  /* ---------- V1.7.3 — Bilan et ajustements (js/core/week-review.js) ----------
     The bilan of a week: one observation with its source sessions, the actions on the week after (keep, move a slot, pause), the
     preview, the confirmed choice with its origin, its undo, and at the next bilan what was observed once it applied. */
  const WR = () => window.TitanWeekReview;
  const reviewOpts = (day, now = new Date()) => ({ week: day ? window.TitanFormat.dateKey(day) : undefined, today: todayKey(now), zone: deviceZone(), pauses: cadenceSettings().pauses });
  function weekReview(day, now = new Date()) {
    if (!WR() || !WP()) return null;
    return WR().review(window.state?.user?.schedule || {}, logs(), reviewOpts(day, now));
  }
  function previewAdjustment(day, action) {
    return WR().preview(window.state?.user?.schedule || {}, logs(), reviewOpts(day), action);
  }
  function applyAdjustment(day, action) {
    if (!window.state?.user || !WR()) throw new Error("WEEK_REVIEW_UNAVAILABLE");
    const r = WR().apply(window.state.user.schedule || {}, logs(), reviewOpts(day), action);
    saveSettings({ schedule: r.schedule, cadencePauses: r.pauses });
    return r.review;
  }
  function undoAdjustment(day) {
    if (!window.state?.user || !WR()) throw new Error("WEEK_REVIEW_UNAVAILABLE");
    const r = WR().undo(window.state.user.schedule || {}, cadenceSettings().pauses, { week: window.TitanFormat.dateKey(day), today: todayKey() });
    saveSettings({ schedule: r.schedule, cadencePauses: r.pauses });
    return r;
  }
  function adjustments(day) {
    if (!WR()) return [];
    return WR().adjustments(window.state?.user?.schedule || {}, { week: day ? window.TitanFormat.dateKey(day) : undefined, today: todayKey() });
  }

  /* ---------- V1.7.4 — Objectifs et blocs d’entraînement (js/core/training-block.js) ----------
     Multi-week blocks on the planning: each week of a block is the programme of that week (week-plan.js reads it). Every change is
     previewed first, applies from the first week that has not begun, and writes the schedule only (sessions are never changed). */
  const TB = () => window.TitanTrainingBlock;
  const blockOpts = (now = new Date()) => ({ today: todayKey(now), zone: deviceZone(), pauses: cadenceSettings().pauses, logs: logs() });
  function blocks(now = new Date()) {
    if (!TB() || !WP()) return [];
    return TB().list(window.state?.user?.schedule || {}, logs(), blockOpts(now));
  }
  function blockContext(day, now = new Date()) {
    if (!TB() || !WP()) return null;
    return TB().weekContext(window.state?.user?.schedule || {}, logs(), { ...blockOpts(now), week: day ? window.TitanFormat.dateKey(day) : undefined });
  }
  /** kind: create | week | copy | shift | milestone | remove | duplicate | declare. Returns the module's result; confirm writes it. */
  function blockChange(kind, id, args, { confirm = false } = {}) {
    if (!window.state?.user || !TB()) throw new Error("TRAINING_BLOCK_UNAVAILABLE");
    const schedule = window.state.user.schedule || {};
    const o = { ...blockOpts(), at: new Date().toISOString() };
    const r = kind === "create" ? TB().create(schedule, args, o)
      : kind === "week" ? TB().editWeek(schedule, id, args, o)
      : kind === "copy" ? TB().duplicateWeek(schedule, id, args, o)
      : kind === "shift" ? TB().shift(schedule, id, args, o)
      : kind === "milestone" ? TB().setMilestone(schedule, id, args, o)
      : kind === "remove" ? TB().remove(schedule, id, o)
      : kind === "duplicate" ? TB().duplicate(schedule, id, args, o)
      : kind === "declare" ? TB().declare(schedule, id, args, o)
      : null;
    if (!r) throw new Error("TRAINING_BLOCK_BAD_ACTION");
    if (confirm) saveSettings({ schedule: r.schedule });
    return r;
  }
  function blockMeasure() {
    if (!TB() || !WP()) return null;
    return TB().measure(window.state?.user?.schedule || {}, logs(), blockOpts());
  }

  function planToday(now = new Date()) {
    if (WP()) {
      const v = weekPlan(null, now);
      const o = v?.occurrences.find((x) => x.effective.day === todayKey(now) && (x.status === "today" || x.status === "ask"));
      if (!o) return null;
      // V1.7.4: in a training block, the minutes and the note are the block week's (its reference), not the typical week's.
      const p = v.reference.block ? { ...plan()[o.index], sport: o.planned.sport, minutes: o.planned.minutes, note: o.planned.note || "" } : plan()[o.index];
      return { ...p, sport: o.effective.sport, minutes: o.effective.sport === p.sport ? p.minutes : null, note: o.effective.sport === p.sport ? p.note : "", occurrence: o.id, moved: o.decision?.kind === "move" || o.decision?.kind === "replace", ...(v.reference.block ? { block: v.reference.block } : {}) };
    }
    const p = plan()[(new Date(now).getDay() + 6) % 7];
    return p.sport ? p : null;
  }
  /** Edit the typical week. V1.7.2: an edit during a week applies from the next Monday (this week keeps its start); a first plan in a
      week with nothing planned applies at once. Returns the Monday the change applies from. */
  function setPlanDay(key, value) {
    if (!window.state?.user || !DAY_KEYS.includes(key)) return null;
    if (WP()) {
      const r = WP().editType(window.state.user.schedule || {}, key, value, { today: todayKey() });
      saveSettings({ schedule: r.schedule });
      return r.appliesFrom;
    }
    const schedule = { ...(window.state.user.schedule || {}) };
    const old = schedule[key] || {};
    schedule[key] = value?.sport
      ? { ...old, sport: value.sport, minutes: Number(value.minutes) > 0 ? Math.min(600, Math.round(Number(value.minutes))) : null, note: String(value.note || "").trim().slice(0, 80) }
      : { ...old, sport: null, minutes: null, note: "" };
    saveSettings({ schedule });
    return null;
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

  window.TitanData = { owner, isGuest, logs, archived, pending, sessionDraftKey, sessionDraft, goals, cadenceSettings, setCadenceTarget, togglePause, plan, planToday, setPlanDay, weekPlan, weekPlanSports, decideOccurrence, weekReview, previewAdjustment, applyAdjustment, undoAdjustment, adjustments, blocks, blockContext, blockChange, blockMeasure, progression, rulesV300, guestCandidates, importGuestSessions };
})();
