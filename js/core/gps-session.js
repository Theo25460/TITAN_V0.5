/* TITAN — V1.7.7 what a GPS outing shows and aims at: the dashboard fields of each sport, optional goals (time, distance, be back
   by a chosen hour), structured sessions (warm-up, repeats, recovery, cool-down) and the line that ties a confirmed outing to the
   adventure. Pure, shared by the website and the Android app. Loaded after gps-engine.js.

   Nothing here prescribes an intensity or reads a fatigue or a health state: a structured session is the durations and distances the
   athlete typed, and the alerts are a change of step — never a judgement. No heart rate, no power: TITAN has no authorised source for
   them, so no field pretends to show them. */
(function (root) {
  "use strict";
  const E = root.TitanGpsEngine || (typeof require === "function" ? require("./gps-engine.js") : null);

  /* ---- Dashboard ---- */
  const FIELDS = {
    moving: { label: "En mouvement", short: "Mouvement", kind: "time" },
    elapsed: { label: "Temps total", short: "Total", kind: "time" },
    stopped: { label: "À l’arrêt", short: "Arrêt", kind: "time" },
    distance: { label: "Distance", short: "Distance", kind: "distance" },
    speed: { label: "Vitesse", short: "Vitesse", kind: "speed" },
    avgMoving: { label: "Moyenne en mouvement", short: "Moy. mouv.", kind: "speed" },
    avgOverall: { label: "Moyenne globale", short: "Moy. globale", kind: "speed" },
    ascent: { label: "Dénivelé positif", short: "D+", kind: "climb" },
    altitude: { label: "Altitude", short: "Altitude", kind: "altitude" },
    remaining: { label: "Reste à parcourir", short: "Reste", kind: "distance" },
    clock: { label: "Heure", short: "Heure", kind: "clock" },
  };
  /** The figures a sport shows first (big) and next. Foot sports read a pace (min/km), wheels and water a speed. */
  const LAYOUTS = {
    walk: { pace: true, main: ["distance", "moving"], more: ["speed", "ascent", "elapsed", "avgMoving"] },
    run: { pace: true, main: ["distance", "moving"], more: ["speed", "avgMoving", "ascent", "elapsed"] },
    bike: { pace: false, main: ["speed", "distance"], more: ["moving", "avgMoving", "ascent", "elapsed"] },
    mtb: { pace: false, main: ["speed", "distance"], more: ["moving", "ascent", "avgMoving", "altitude"] },
    roll: { pace: false, main: ["speed", "distance"], more: ["moving", "avgMoving", "elapsed", "stopped"] },
    snow: { pace: false, main: ["distance", "moving"], more: ["speed", "ascent", "altitude", "elapsed"] },
    water: { pace: false, main: ["speed", "distance"], more: ["moving", "avgMoving", "elapsed", "stopped"] },
  };
  const ALL_FIELDS = Object.keys(FIELDS);
  /** The layout of a sport, with the athlete's own choice of the four secondary fields when it is valid. */
  function layout(sport, chosen) {
    const base = LAYOUTS[E.familyOf(sport)] || LAYOUTS.run;
    const own = Array.isArray(chosen) ? [...new Set(chosen.filter((k) => FIELDS[k] && !base.main.includes(k)))].slice(0, 4) : [];
    return { pace: base.pace, main: base.main, more: own.length ? own : base.more, options: ALL_FIELDS.filter((k) => !base.main.includes(k)) };
  }

  const two = (n) => String(n).padStart(2, "0");
  /** 1:02:07 or 12:07 — a chronometer, read at a glance. */
  const chrono = (seconds) => { const s = Math.max(0, Math.round(seconds || 0)), h = Math.floor(s / 3600); return `${h ? `${h}:${two(Math.floor((s % 3600) / 60))}` : Math.floor(s / 60)}:${two(s % 60)}`; };
  const comma = (x, d) => x.toFixed(d).replace(".", ",");
  const km = (m) => (m >= 100000 ? String(Math.round(m / 1000)) : comma(m / 1000, m >= 10000 ? 1 : 2));
  /** A speed as the sport reads it: « 5:12 /km » or « 24,3 km/h »; « – » when unknown or stopped. */
  function speedText(ms, pace) {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return { value: "–", unit: pace ? "/km" : "km/h" };
    if (pace) { if (ms < 0.4) return { value: "–", unit: "/km" }; const s = Math.round(1000 / ms); return { value: `${Math.floor(s / 60)}:${two(s % 60)}`, unit: "/km" }; }
    return { value: comma(ms * 3.6, 1), unit: "km/h" };
  }
  /** One dashboard cell: { key, label, value, unit, note }. `a` is the engine's analysis, `live` what only exists while recording. */
  function cellOf(key, a, live, pace) {
    const f = FIELDS[key], l = live || {};
    const kmh = (v) => (v === null || v === undefined ? null : v / 3.6);
    switch (key) {
      case "moving": return { key, label: f.label, value: chrono(a.movingS), unit: "" };
      case "elapsed": return { key, label: f.label, value: chrono(a.elapsedS), unit: "" };
      case "stopped": return { key, label: f.label, value: chrono(a.stoppedS), unit: "" };
      case "distance": return { key, label: f.label, value: km(a.distanceM), unit: "km" };
      case "speed": return { key, label: pace ? "Allure" : f.label, ...speedText(l.speedMs === undefined ? null : l.speedMs, pace) };
      case "avgMoving": return { key, label: pace ? "Allure moy. en mouvement" : f.label, ...speedText(kmh(a.avgMovingKmh), pace) };
      case "avgOverall": return { key, label: pace ? "Allure moy. globale" : f.label, ...speedText(kmh(a.avgOverallKmh), pace) };
      case "ascent": return a.ascentM === null ? { key, label: f.label, value: "–", unit: "m", note: "Altitude pas assez fiable" } : { key, label: f.label, value: String(a.ascentM), unit: "m" };
      case "altitude": return l.altitudeM === null || l.altitudeM === undefined ? { key, label: f.label, value: "–", unit: "m", note: "Altitude indisponible" } : { key, label: f.label, value: String(Math.round(l.altitudeM)), unit: "m", note: "Altitude du GPS, non corrigée" };
      case "remaining": return l.remainingM === null || l.remainingM === undefined ? { key, label: f.label, value: "–", unit: "km", note: "Aucun parcours suivi" } : { key, label: f.label, value: km(l.remainingM), unit: "km" };
      case "clock": { const d = new Date(l.now || Date.now()); return { key, label: f.label, value: `${two(d.getHours())}:${two(d.getMinutes())}`, unit: "" }; }
      default: return { key, label: key, value: "–", unit: "" };
    }
  }

  const SHORT_PACE = { speed: "Allure", avgMoving: "Allure moy. mouv.", avgOverall: "Allure moy. globale" };
  /** The cell with its `short` label, for the small tiles where the full one would be cut. */
  const cell = (key, a, live, pace) => ({ ...cellOf(key, a, live, pace), short: (pace && SHORT_PACE[key]) || (FIELDS[key] ? FIELDS[key].short : key) });

  /* ---- Goals ---- */
  /** A goal is optional: { kind: "distance", km } | { kind: "time", minutes } | { kind: "return", at } (epoch ms). Null when it is not usable. */
  function goalOf(g) {
    if (!g || typeof g !== "object") return null;
    if (g.kind === "distance" && g.km > 0 && g.km <= 1000) return { kind: "distance", km: Math.round(g.km * 10) / 10 };
    if (g.kind === "time" && g.minutes > 0 && g.minutes <= 1440) return { kind: "time", minutes: Math.round(g.minutes) };
    if (g.kind === "return" && Number.isFinite(g.at)) return { kind: "return", at: g.at };
    return null;
  }
  const hhmm = (t) => { const d = new Date(t); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
  const span = (s) => { const m = Math.max(0, Math.round(s / 60)); return m >= 60 ? `${Math.floor(m / 60)} h ${two(m % 60)}` : `${m} min`; };
  /** Where the outing stands against its goal. `ctx`: { now, eta(distanceM) → {seconds, lowS, highS} | null, backM (way back to the start, or null) }.
      Every estimate is a range and says what it ignores; nothing is shown as exact. */
  function goalProgress(goal, a, ctx) {
    const g = goalOf(goal), c = ctx || {};
    if (!g) return null;
    if (g.kind === "distance") {
      const target = g.km * 1000, left = Math.max(0, target - a.distanceM), e = left > 0 && c.eta ? c.eta(left) : null;
      return { kind: g.kind, ratio: Math.min(1, a.distanceM / target), reached: left <= 0, title: `Objectif ${comma(g.km, g.km % 1 ? 1 : 0)} km`,
        line: left <= 0 ? "Objectif de distance atteint." : `Reste ${km(left)} km`,
        estimate: left <= 0 ? null : e ? `Environ ${span(e.lowS)} à ${span(e.highS)} à ton rythme en mouvement, hors arrêts.` : "Estimation disponible après 5 min de mouvement.", note: e ? e.note : null };
    }
    if (g.kind === "time") {
      const target = g.minutes * 60, left = Math.max(0, target - a.effortS);
      return { kind: g.kind, ratio: Math.min(1, a.effortS / target), reached: left <= 0, title: `Objectif ${span(target)}`,
        line: left <= 0 ? "Objectif de durée atteint." : `Reste ${span(left)} ${a.autoPause ? "en mouvement" : "d’enregistrement"}`,
        estimate: null, note: a.autoPause ? "Compté sur le temps en mouvement : arrêts et pauses ne font pas avancer l’objectif." : "Pause automatique désactivée : les arrêts détectés comptent." };
    }
    const now = c.now || Date.now(), left = Math.round((g.at - now) / 1000);
    const back = Number.isFinite(c.backM) ? c.backM : null, e = back !== null && c.eta ? c.eta(back) : null;
    const base = { kind: g.kind, title: `Retour pour ${hhmm(g.at)}`, ratio: null, reached: false };
    if (left <= 0) return { ...base, status: "late", line: `L’heure de retour (${hhmm(g.at)}) est passée.`, estimate: null, note: null };
    if (back === null || !e) return { ...base, status: "unknown", line: `Il reste ${span(left)} avant ${hhmm(g.at)}.`, estimate: back === null ? "Chemin du retour inconnu pour l’instant." : "Estimation du retour disponible après 5 min de mouvement.", note: null };
    const margin = left - e.highS, status = margin < 0 ? (left - e.lowS < 0 ? "late" : "tight") : margin < 600 ? "tight" : "ok";
    return { ...base, status, marginS: margin,
      line: status === "ok" ? `Tu peux encore avancer environ ${span(margin / 2)} avant de faire demi-tour (vers ${hhmm(now + (margin / 2) * 1000)}).` : status === "tight" ? "Il est temps de rentrer pour tenir l’heure prévue." : "À ce rythme, tu rentreras après l’heure prévue.",
      estimate: `Retour par le même chemin : ${km(back)} km, environ ${span(e.lowS)} à ${span(e.highS)}.`,
      note: "Estimation à ton rythme en mouvement, hors arrêts, sans tenir compte du relief ni de la fatigue. Garde une marge." };
  }
  /** The duration planned today for this sport in the week plan (V1.7.2 / V1.7.4), as a goal the athlete may accept. Null when nothing is planned. */
  function plannedGoal(weekView, sport) {
    const occ = ((weekView && weekView.occurrences) || []).find((o) => o.status === "today" && o.effective && o.effective.sport === sport && o.planned && o.planned.minutes > 0);
    return occ ? { goal: { kind: "time", minutes: occ.planned.minutes }, occurrence: occ.id, label: `Prévu aujourd’hui : ${span(occ.planned.minutes * 60)}` } : null;
  }

  /* ---- Structured session ---- */
  const STEP_KINDS = { warmup: "Échauffement", work: "Effort", recover: "Récupération", cooldown: "Retour au calme", free: "Libre" };
  const MAX_STEPS = 60;
  /** One step: { kind, by: "time" | "distance" | "manual", value (seconds or metres), label }. Null when it cannot be used. */
  function stepOf(s) {
    if (!s || !STEP_KINDS[s.kind]) return null;
    const by = s.by === "distance" || s.by === "manual" ? s.by : "time";
    const value = by === "manual" ? 0 : Math.round(Number(s.value));
    if (by === "time" && !(value >= 5 && value <= 21600)) return null;
    if (by === "distance" && !(value >= 50 && value <= 200000)) return null;
    return { kind: s.kind, by, value, label: String(s.label || STEP_KINDS[s.kind]).slice(0, 40) };
  }
  /** Builds the steps from the form: warm-up, N × (effort + recovery), cool-down. The last recovery is dropped (the cool-down follows). */
  function buildPlan(f) {
    const steps = [], n = Math.max(0, Math.min(30, Math.round(f.reps || 0)));
    const part = (kind, x, label) => { if (!x) return; const s = stepOf({ kind, by: x.by, value: x.by === "distance" ? x.value : x.by === "manual" ? 0 : x.value, label }); if (s) steps.push(s); };
    part("warmup", f.warmup);
    for (let i = 1; i <= n; i++) { part("work", f.work, n > 1 ? `Effort ${i}/${n}` : "Effort"); if (i < n) part("recover", f.recover, `Récupération ${i}/${n - 1}`); }
    part("cooldown", f.cooldown);
    return steps.slice(0, MAX_STEPS);
  }
  const planOf = (steps) => (Array.isArray(steps) ? steps.map(stepOf).filter(Boolean).slice(0, MAX_STEPS) : []);
  const startPlan = () => ({ index: 0, fromS: 0, fromM: 0, laps: [] });
  /** Reads the plan against the outing. Time steps run on recording time (pauses excluded, stops included: a recovery standing still is a
      recovery); distance steps on measured distance. Returns the cursor moved past every finished step, and what to show.
      `changed` is true when a step just ended: the client may then vibrate or flash, if the athlete kept the alerts on. */
  function runPlan(steps, cursor, a) {
    const plan = planOf(steps);
    let c = cursor || startPlan(), changed = false;
    const done = (s, k) => (s.by === "time" ? a.recordingS - k.fromS >= s.value : s.by === "distance" ? a.distanceM - k.fromM >= s.value : false);
    while (c.index < plan.length && done(plan[c.index], c)) {
      const s = plan[c.index];
      const endS = s.by === "time" ? c.fromS + s.value : a.recordingS, endM = s.by === "distance" ? c.fromM + s.value : a.distanceM;
      c = { index: c.index + 1, fromS: endS, fromM: endM, laps: [...c.laps, { index: c.index, kind: s.kind, label: s.label, seconds: Math.round(endS - c.fromS), metres: Math.round(endM - c.fromM), manual: false }] };
      changed = true;
    }
    return { cursor: c, changed, ...viewPlan(plan, c, a) };
  }
  function viewPlan(plan, c, a) {
    if (c.index >= plan.length) return { finished: plan.length > 0, step: null, next: null, remaining: null, ratio: 1, position: plan.length ? `${plan.length}/${plan.length}` : "" };
    const s = plan[c.index], spentS = Math.max(0, a.recordingS - c.fromS), spentM = Math.max(0, a.distanceM - c.fromM);
    const remaining = s.by === "time" ? { value: chrono(s.value - spentS), unit: "" } : s.by === "distance" ? { value: km(Math.max(0, s.value - spentM)), unit: "km" } : { value: chrono(spentS), unit: "", manual: true };
    return { finished: false, step: s, next: plan[c.index + 1] || null, remaining, ratio: s.by === "time" ? Math.min(1, spentS / s.value) : s.by === "distance" ? Math.min(1, spentM / s.value) : null, position: `${c.index + 1}/${plan.length}` };
  }
  /** The athlete ends the current step by hand (a step « au signal », or one cut short). */
  function skipStep(steps, cursor, a) {
    const plan = planOf(steps), c = cursor || startPlan();
    if (c.index >= plan.length) return c;
    const s = plan[c.index];
    return { index: c.index + 1, fromS: a.recordingS, fromM: a.distanceM, laps: [...c.laps, { index: c.index, kind: s.kind, label: s.label, seconds: Math.round(a.recordingS - c.fromS), metres: Math.round(a.distanceM - c.fromM), manual: true }] };
  }
  /** What was done of the plan, for the summary: every lap with its real duration and distance, and the steps that were not reached.
      An unfinished plan never cancels the outing: the session is saved with what was done. */
  function planSummary(steps, cursor) {
    const plan = planOf(steps), c = cursor || startPlan();
    return { total: plan.length, done: c.laps.length, complete: plan.length > 0 && c.laps.length >= plan.length,
      laps: c.laps.map((l) => ({ ...l, text: `${l.label} · ${chrono(l.seconds)}${l.metres >= 50 ? ` · ${km(l.metres)} km` : ""}${l.manual ? " · passé à la main" : ""}` })),
      missed: plan.slice(c.laps.length).map((s) => s.label) };
  }
  const describeStep = (s) => `${s.label} · ${s.by === "time" ? chrono(s.value) : s.by === "distance" ? `${km(s.value)} km` : "au signal"}`;

  /* ---- Adventure ---- */
  const WORLD_NAMES = { aube: "la Vallée de l’Aube", marees: "les Îles des Marées", forge: "la Forge des Titans", aurores: "les Hauts des Aurores" };
  /** What a CONFIRMED outing changed in the athlete's expedition, read from the server's own adventure snapshots (before and after the
      session). Nothing is computed or granted here: the adventure engine already counts confirmed effort once per session, capped per day,
      and pays nothing for a pause, a re-import or a second synchronisation. No coordinate ever enters this text. Null when the adventure
      is not started or not available — the outing then simply lives in the journal. */
  function expedition(world, before, after) {
    if (!after || !WORLD_NAMES[world]) return null;
    const gained = before ? Math.max(0, Math.round((after.effort || 0) - (before.effort || 0))) : null;
    const ms = Array.isArray(after.milestones) ? after.milestones : [];
    const wasReady = new Set((before && Array.isArray(before.milestones) ? before.milestones : []).filter((m) => m.ready || m.earned).map((m) => m.ordinal));
    const opened = ms.filter((m) => (m.ready || m.earned) && before && !wasReady.has(m.ordinal));
    const next = ms.find((m) => !m.ready && !m.earned);
    const KIND = { discovery: "une découverte", choice: "un choix", monster: "une rencontre", lore: "un fragment de chronique", treasure: "un trésor", miniboss: "un gardien" };
    return {
      world, title: `Expédition · ${WORLD_NAMES[world]}`,
      line: gained === null ? "Cette sortie confirmée compte pour ton expédition." : gained > 0 ? `Cette sortie confirmée fait avancer ton expédition de ${gained} min d’effort.` : "Cette sortie n’ajoute pas d’effort à l’expédition aujourd’hui (plafond du jour atteint ou séance non retenue).",
      opened: opened.map((m) => ({ ordinal: m.ordinal, kind: m.kind, text: `Palier ${m.ordinal} atteint : ${KIND[m.kind] || "une étape"} t’attend dans l’Aventure.` })),
      next: next ? `Prochain palier : ${Math.max(0, Math.round((next.effortTarget || 0) - (after.effort || 0)))} min d’effort${next.daysTarget > (after.days || 0) ? ` et ${next.daysTarget - (after.days || 0)} jour(s) actif(s)` : ""}.` : "Tous les paliers de ce monde sont atteints.",
      note: "L’aventure avance avec l’effort confirmé, quel que soit le sport. Ta trace et tes lieux n’y apparaissent jamais.",
    };
  }

  const api = { FIELDS, LAYOUTS, STEP_KINDS, WORLD_NAMES, layout, cell, chrono, km, speedText, span, hhmm, goalOf, goalProgress, plannedGoal, stepOf, buildPlan, planOf, startPlan, runPlan, skipStep, planSummary, describeStep, expedition };
  /** @type {any} */ (root).TitanGpsSession = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
