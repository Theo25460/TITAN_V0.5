/* TITAN LIVE — what a live session may compare itself with, shared unchanged by the website and the Android app.
   « Se dépasser » promises a reasonable progress against a really comparable performance. This module builds that
   reference from the athlete's own journal, with the rules of the sport rework (docs/SPORT_EXCELLENCE.md):
   - only sessions the server counted and whose measures are plausible (TitanTraining.counted / plausible): a held,
     refused or impossible session is never a reference;
   - same discipline only, the ten most recent ones;
   - strength and bodyweight: the top set of the LAST session in which each exercise was done (TitanInsights.sets), never
     an estimated maximum; a session whose reward the server holds back is never one;
   - nothing is invented: no reference means no threshold, and the engine says so.
   Pure: no I/O, no clock other than the `now` it is given. */
(function (root) {
  "use strict";

  const T = () => root.TitanTraining;
  const I = () => root.TitanInsights;

  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const time = (l) => new Date(l?.date).getTime();
  /** A session whose reward the server holds back is under review: like in endurance.js, it is never a reference. */
  const held = (l) => !!(l.details?.rewardHeld || l.details?.reward_held || l.details?.held || l.details?.serverReward?.reward_held);
  const usable = (l) => !!l && !l.archived_at && !l.is_suspicious && !held(l) && Number.isFinite(time(l))
    && (T()?.counted ? T().counted(l) : true) && (T()?.plausible ? T().plausible(l) : true);
  const minutesOf = (l) => {
    const d = T()?.duration ? T().duration(l) : null;
    const v = num(d) ?? num(l?.details?.duration) ?? num(l?.details?.val2);
    return v !== null && v > 0 ? v : 0;
  };
  const median = (xs) => {
    const s = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    if (!s.length) return 0;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const exKey = (name) => String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 40);

  /** Rows of one exercise as { weight, reps }: the journal's own reader when it is loaded, a plain one otherwise. */
  function rowsOf(ex) {
    if (I()?.sets) return I().sets(ex);
    return (Array.isArray(ex?.setRows) ? ex.setRows : [])
      .map((s) => ({ weight: num(s.weight) ?? 0, reps: num(s.reps) ?? 0 }))
      .filter((s) => s.weight >= 0 && s.reps > 0);
  }

  /** Top set of each exercise in the last session where it was done: heaviest load, then most repetitions. */
  function exerciseReference(sessions) {
    const out = Object.create(null);
    let count = 0;
    for (const l of sessions.slice().reverse()) {
      // The same exercise entered twice in one session (two variants, two blocks) is one exercise: its best row counts.
      const session = Object.create(null);
      for (const ex of l?.details?.exercises || []) {
        const key = exKey(ex?.name);
        if (!key || ex.kind === "hold") continue;
        for (const r of rowsOf(ex)) {
          const best = session[key];
          if (!best || r.weight > best.load || (r.weight === best.load && r.reps > best.reps)) session[key] = { name: String(ex.name).slice(0, 40), load: r.weight || 0, reps: r.reps };
        }
      }
      for (const key of Object.keys(session)) {
        if (out[key]) continue;
        out[key] = session[key];
        if (++count >= 30) return { ...out };
      }
    }
    return { ...out };
  }

  /**
   * Everything TitanLiveEngine.create needs from the journal for one discipline.
   * @returns {{baseline:object|null, echo:object|null, reference:object|null, knownExercises:string[], comparable:number, basis:string}}
   */
  function context(sportId, logs, { now = Date.now() } = {}) {
    const same = (Array.isArray(logs) ? logs : [])
      .filter((l) => l && l.sport === sportId && usable(l) && time(l) <= now)
      .sort((a, b) => time(a) - time(b));
    const recent = same.slice(-10);
    const baseline = recent.length ? {
      sessions: recent.length,
      medianMinutes: median(recent.map(minutesOf)),
      medianBeats: median(recent.map((l) => num(l.details?.live?.beats) ?? 0)),
      medianElevationM: median(recent.map((l) => num(l.details?.elevation) ?? num(l.details?.extras?.elevation) ?? 0)),
    } : null;
    const lastLive = recent.slice().reverse().find((l) => num(l.details?.live?.beats) > 0 && num(l.details?.live?.activeMin) > 0);
    const echo = lastLive ? { minutes: num(lastLive.details.live.activeMin), beats: num(lastLive.details.live.beats) } : null;
    const exercises = exerciseReference(recent);
    const names = Object.keys(exercises).length;
    const knownExercises = [...new Set(same.flatMap((l) => (l.details?.exercises || []).map((e) => e?.name).filter(Boolean)))].slice(0, 30);
    const basis = !recent.length ? "Aucune séance comparable enregistrée pour cette discipline."
      : names ? `Ta dernière série la plus haute sur ${names} exercice${names > 1 ? "s" : ""}, parmi tes ${recent.length} dernière${recent.length > 1 ? "s" : ""} séance${recent.length > 1 ? "s" : ""} comptée${recent.length > 1 ? "s" : ""}.`
        : `La médiane de tes ${recent.length} dernière${recent.length > 1 ? "s" : ""} séance${recent.length > 1 ? "s" : ""} comptée${recent.length > 1 ? "s" : ""} de cette discipline.`;
    return { baseline, echo, reference: names ? { exercises, basis } : null, knownExercises, comparable: recent.length, basis };
  }

  const api = { version: 1, context, exerciseReference, exKey };
  root.TitanLivePrepare = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
