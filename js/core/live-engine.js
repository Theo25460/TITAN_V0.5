/* TITAN LIVE — the shared session engine.
   One pure, serialisable state machine for every sport: step(state, input, now) → {state, out}. No timers, no I/O, no
   randomness outside a seeded hash, so the same inputs always replay to the same state (resume after a crash, tests,
   server re-verification). The companion is rule-based: a cue needs a reason, a free channel and a quiet period.
   Nothing here grants XP, credits or rewards: the server settles the session journal (titan_live_settle_v1). */
(function (root) {
  "use strict";

  const V = () => root.TitanLiveVoies || (typeof require === "function" ? require("./live-voies.js") : null);
  const E = () => root.TitanEffort || null;

  const VERSION = 1;
  const MAX_OFFERS = 3;
  const MAX_DONE = 3;
  const OFFER_GAP_S = 360;
  const LEVEL_GAP_S = { 0: Infinity, 1: 150, 2: 210, 3: 100 };
  const INTERRUPT_S = 90;
  const MAX_BEATS = 400;
  const MAX_CUES = 60;

  /* ------------------------------------------------------------------ hashing (mirrored in SQL) */
  /** FNV-1a 32-bit over UTF-16 code units, unsigned. Same algorithm as private.titan_live_hash in SQL. */
  function hash(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  /** Deterministic draw in [0,1). */
  const draw = (seed, key) => hash(`${seed}:${key}`) / 4294967296;

  /* ------------------------------------------------------------------ helpers */
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function activeMs(state, now) {
    return state.activeMs + (state.status === "active" && state.runStart != null ? Math.max(0, now - state.runStart) : 0);
  }
  const activeMin = (state, now) => activeMs(state, now) / 60000;

  /** Counted effort-minutes, same diminishing curve as the server (90 full minutes, then half). Intensity unknown live = 1. */
  function countedMinutes(minutes, rpe) {
    const intensity = rpe == null ? 1 : 0.6 + 0.08 * clamp(num(rpe), 1, 10);
    const counted = Math.min(minutes, 90) + 0.5 * Math.min(Math.max(minutes - 90, 0), 90);
    return Math.round(counted * intensity * 10) / 10;
  }

  /* ------------------------------------------------------------------ creation */
  /**
   * @param {{sportId:string, intent?:string, immersion?:string, goal?:{kind:string,value:number}|null, plan?:object,
   *   baseline?:{medianMinutes?:number, medianBeats?:number, medianElevationM?:number, sessions?:number}|null,
   *   echo?:{minutes:number, beats:number}|null, seed:string, owner?:string, project?:boolean, recovery?:boolean,
   *   knownExercises?:string[], knownTechniques?:string[], knownConditions?:string[]}} opts
   */
  function create(opts) {
    const voies = V();
    const conf = voies.resolve(opts.sportId);
    const intent = voies.INTENTS[opts.intent] ? opts.intent : "atteindre";
    const requested = voies.IMMERSION[opts.immersion] ? voies.IMMERSION[opts.immersion].level : 1;
    const level = Math.min(requested, conf.maxImmersion);
    const goal = intent === "explorer" && !opts.goal ? null : normGoal(opts.goal);
    return {
      v: VERSION, seed: String(opts.seed || ""), owner: opts.owner || null,
      sport: conf.sport, voie: conf.voie, intent, immersion: opts.immersion || "notifications", level,
      safety: conf.safety, offerMode: conf.offerMode, recovery: !!opts.recovery,
      goal, plan: { ...conf.plan, ...(opts.plan || {}) },
      baseline: opts.baseline || null, echo: opts.echo || null, project: !!opts.project,
      known: { exercises: opts.knownExercises || [], techniques: opts.knownTechniques || [], conditions: opts.knownConditions || [] },
      status: "ready", createdAt: null, startedAt: null, runStart: null, activeMs: 0, lastSeenAt: null, interrupted: 0,
      gps: { distanceM: 0, elevationM: 0, newPlaces: 0, available: conf.data.gps },
      beats: [], rest: { since: null, targetS: num(conf.plan.restS, 0) },
      fields: {}, feel: null,
      missions: { offered: [], active: [], done: [], declined: [], lastOfferAt: null },
      events: [], cues: [], lastCueAt: null, firedRules: {},
      ended: null,
    };
  }

  function normGoal(goal) {
    if (!goal || !goal.kind) return null;
    const value = num(goal.value, 0);
    if (!(value > 0)) return null;
    if (!["time", "distance", "beats"].includes(goal.kind)) return null;
    return { kind: goal.kind, value };
  }

  /* ------------------------------------------------------------------ derived metrics */
  function loggedBeats(state, kind) {
    return state.beats.filter((b) => !kind || b.kind === kind).length;
  }

  /** Progress beats of the Voie: logged beats when the sport logs them, otherwise the time/elevation equivalent. */
  function beatCount(state, now) {
    const conf = V().resolve(state.sport);
    const every = conf.beat.every || {};
    const eff = countedMinutes(activeMin(state, now), null);
    const fromTime = every.effortMin ? Math.floor(eff / every.effortMin) : 0;
    const fromElev = every.elevationM ? Math.floor(state.gps.elevationM / every.elevationM) : 0;
    const logged = every.beat ? loggedBeats(state, every.beat) : 0;
    if (every.beat) return logged > 0 || !every.effortMin ? logged : fromTime;
    return Math.max(fromTime, fromElev);
  }

  function goalProgress(state, now) {
    const g = state.goal;
    if (!g) return null;
    let value = 0;
    if (g.kind === "time") value = activeMin(state, now);
    else if (g.kind === "distance") value = state.gps.distanceM / 1000 || num(state.fields.declaredKm, 0);
    else value = beatCount(state, now);
    return { value: Math.round(value * 100) / 100, target: g.value, ratio: clamp(value / g.value, 0, 1) };
  }

  /** Session phase used to time mission offers: start, warm, mid, late. */
  function phaseOf(state, now) {
    const min = activeMin(state, now);
    const p = goalProgress(state, now);
    const planMin = state.plan.minutes || (state.plan.count && state.plan.workS ? (state.plan.count * (state.plan.workS + num(state.plan.restS))) / 60 : null);
    const ratio = p ? p.ratio : planMin ? min / planMin : min / 45;
    if (min < 3) return "start";
    if (ratio >= 0.75) return "late";
    if (ratio >= 0.4) return "mid";
    return "warm";
  }

  function streak(state, where) {
    let best = 0, cur = 0;
    for (const b of state.beats) {
      if (matches(b, where)) { cur++; best = Math.max(best, cur); } else if (!where?.kind || b.kind === where.kind) cur = 0;
    }
    return best;
  }

  function matches(b, where = {}) {
    if (where.kind && b.kind !== where.kind) return false;
    const d = b.data || {};
    if (where.rirMin != null && !(num(d.rir, -1) >= where.rirMin)) return false;
    if (where.rirMax != null && !(d.rir != null && num(d.rir) <= where.rirMax)) return false;
    if (where.result && d.result !== where.result) return false;
    if (where.project && !d.project) return false;
    if (where.won != null && !!d.won !== where.won) return false;
    if (where.clean && !d.clean) return false;
    if (where.tag && d.tag !== where.tag) return false;
    return true;
  }

  /** Resolve a relative target: {goal:f} | {baseline:f} | {plan:f, plus}. Returns null when the reference is missing. */
  function target(state, gte, metric) {
    if (typeof gte === "number") return gte;
    if (!gte || typeof gte !== "object") return null;
    if (gte.goal != null) {
      if (!state.goal) return null;
      if (metric === "activeMin" && state.goal.kind !== "time") return null;
      if (metric === "beats" && state.goal.kind !== "beats") return null;
      return state.goal.value * gte.goal;
    }
    if (gte.baseline != null) {
      const b = state.baseline;
      if (!b || !(num(b.sessions) >= 3)) return null;
      const ref = metric === "activeMin" ? b.medianMinutes : metric === "elevationM" ? b.medianElevationM : b.medianBeats;
      return ref > 0 ? Math.ceil(ref * gte.baseline) : null;
    }
    if (gte.plan != null) {
      const c = num(state.plan.count, 0);
      return c > 0 ? Math.max(1, Math.round(c * gte.plan) + num(gte.plus, 0)) : null;
    }
    return null;
  }

  function metricValue(state, check, now) {
    switch (check.metric) {
      case "activeMin": return activeMin(state, now);
      case "beats": return check.where ? state.beats.filter((b) => matches(b, check.where)).length : beatCount(state, now);
      case "beatStreak": return streak(state, check.where);
      case "distanceM": return state.gps.distanceM;
      case "elevationM": return state.gps.elevationM;
      case "restsRespected": return state.beats.filter((b) => b.restOk).length;
      case "distinct": return new Set([...state.beats.map((b) => b.data?.[check.key]), ...((state.notes && state.notes[check.key]) || [])].filter(Boolean)).size;
      case "field": return num(state.fields[check.field], 0);
      case "report": return reportOk(state, check) ? 1 : 0;
      default: return 0;
    }
  }

  /** A report mission holds when the after-session statistic meets its condition (same test as the server). */
  function reportOk(state, c) {
    const v = state.fields[`r_${c.field}`];
    if (typeof v !== "number") return false;
    if (c.requires && typeof state.fields[`r_${c.requires}`] !== "number") return false;
    if (c.per) { const d = state.fields[`r_${c.per.field}`]; return typeof d === "number" && d > 0 && v <= d * c.per.max; }
    if (c.gte != null && !(v >= c.gte)) return false;
    if (c.lte != null && !(v <= c.lte)) return false;
    return true;
  }

  function missionTarget(state, mission) {
    if (mission.check.metric === "declared" || mission.check.metric === "report") return 1;
    return target(state, mission.check.gte, mission.check.metric);
  }

  function missionAvailable(state, mission, now, { before = false } = {}) {
    if (!mission.intents.includes(state.intent)) return false;
    const w = mission.when || {};
    if (w.needs === "echo" && !state.echo) return false;
    if (w.needs === "baseline" && !(num(state.baseline?.sessions) >= 3)) return false;
    if (w.needs === "project" && !state.project) return false;
    if (w.needs === "gps" && !state.gps.available) return false;
    if (w.painBelow != null && num(state.fields.pain_before, 0) >= w.painBelow) return false;
    if (state.recovery && mission.intents.length === 1 && mission.intents[0] === "depasser") return false;
    if (missionTarget(state, mission) == null) return false;
    if (before) return true;
    if (w.afterMin && activeMin(state, now) < w.afterMin) return false;
    if (w.afterBeats && state.beats.length < w.afterBeats) return false;
    const order = ["start", "warm", "mid", "late"];
    return order.indexOf(phaseOf(state, now)) >= order.indexOf(w.phase || "start");
  }

  /** Missions the athlete may pick before starting (always available, and the only way when taps are unsafe). */
  function preparable(state) {
    const conf = V().resolve(state.sport);
    return conf.missions.filter((mi) => missionAvailable(state, mi, 0, { before: true }));
  }

  /* ------------------------------------------------------------------ companion */
  const RULES = [
    { id: "goal_half", minLevel: 1, priority: 2, once: true,
      when: (s, n) => { const p = goalProgress(s, n); return p && p.ratio >= 0.5 && p.ratio < 1; },
      text: (s, n) => `La moitié de ton cap est derrière toi (${fmtGoal(s, n)}).`, why: "50 % de l’objectif choisi avant la séance." },
    { id: "goal_done", minLevel: 1, priority: 3, once: true,
      when: (s, n) => { const p = goalProgress(s, n); return p && p.ratio >= 1; },
      text: () => "Cap tenu. Tout ce qui suit est du bonus, ou du repos.", why: "Objectif de la séance atteint." },
    { id: "beyond_baseline", minLevel: 1, priority: 2, once: true,
      when: (s, n) => s.intent === "depasser" && num(s.baseline?.sessions) >= 3 && num(s.baseline?.medianBeats) > 0 && beatCount(s, n) > s.baseline.medianBeats,
      text: (s, n) => `Au-delà de ta médiane récente : ${beatCount(s, n)} ${beatWord(s, beatCount(s, n))} contre ${s.baseline.medianBeats}.`,
      why: "Comparaison avec la médiane de tes séances comparables du même sport." },
    { id: "echo_level", minLevel: 1, priority: 1, cooldownS: 900,
      when: (s, n) => !!s.echo && s.echo.minutes > 0 && Math.abs(beatCount(s, n) - echoBeats(s, n)) <= 0 && activeMin(s, n) > 5,
      text: () => "Ton Écho est à ta hauteur sur la carte d’aventure.", why: "Ta séance comparable, ramenée au même temps écoulé." },
    { id: "echo_ahead", minLevel: 2, priority: 1, cooldownS: 900,
      when: (s, n) => s.intent === "depasser" && !!s.echo && echoBeats(s, n) - beatCount(s, n) >= 2 && phaseOf(s, n) !== "late",
      text: (s, n) => `Ton Écho a ${echoBeats(s, n) - beatCount(s, n)} ${beatWord(s, 2)} d’avance. Il reste du temps pour le rejoindre, à ton rythme.`,
      why: "Écart avec ta séance comparable au même temps écoulé." },
    { id: "rest_over", minLevel: 1, priority: 2, cooldownS: 30,
      when: (s, n) => s.rest.since != null && s.rest.targetS > 0 && (n - s.rest.since) / 1000 >= s.rest.targetS && !s.firedRules[`rest:${s.rest.since}`],
      text: (s) => restDoneText(s), why: "Le repos conseillé pour ce format est écoulé.", mark: (s) => `rest:${s.rest.since}` },
    { id: "hydrate", minLevel: 1, priority: 1, once: true,
      when: (s, n) => activeMin(s, n) >= 45 && !["nage", "elements", "pilotage"].includes(s.voie),
      text: () => "45 minutes d’effort : une gorgée d’eau quand c’est possible.", why: "Rappel d’hydratation au-delà de 45 minutes d’effort." },
    { id: "feel_high", minLevel: 1, priority: 3, cooldownS: 600,
      when: (s) => num(s.feel, 0) >= 8 && (s.intent === "depasser" || s.missions.active.length > 0),
      text: () => "Effort ressenti élevé. Les missions de dépassement sont mises de côté : la fin peut se faire en douceur.",
      why: "Tu as indiqué un effort ressenti de 8 ou plus." },
    { id: "recovery", minLevel: 1, priority: 1, once: true,
      when: (s, n) => s.recovery && activeMin(s, n) >= 10,
      text: () => "Séance de récupération : rien à prouver aujourd’hui, le monde avance aussi avec le calme.", why: "Séance marquée comme récupération." },
    { id: "long_pause", minLevel: 1, priority: 1, cooldownS: 1200,
      when: (s, n) => s.status === "paused" && s.pausedAt != null && n - s.pausedAt >= 10 * 60000,
      text: () => "Séance en pause depuis 10 minutes. Elle t’attend ; tu peux aussi la terminer, rien n’est perdu.", why: "Pause prolongée." },
  ];

  function restDoneText(s) {
    if (s.voie === "forge") return "La braise est retombée. Frappe suivante quand tu veux.";
    if (s.voie === "paroi") return "Avant-bras reposés : l’essai suivant peut partir.";
    if (s.voie === "stade") return "Récupération complète : la tentative suivante sera pleine.";
    if (s.voie === "dojo" || s.voie === "brasier") return "Fin du repos.";
    return "Repos terminé.";
  }

  function beatWord(s, n) {
    const b = V().resolve(s.sport).beat;
    return n > 1 ? b.many : b.one;
  }
  function echoBeats(s, now) {
    if (!s.echo || !(s.echo.minutes > 0)) return 0;
    return Math.floor((s.echo.beats * Math.min(activeMin(s, now), s.echo.minutes)) / s.echo.minutes);
  }
  function fmtGoal(s, now) {
    const p = goalProgress(s, now);
    if (!p) return "";
    if (s.goal.kind === "time") return `${Math.round(p.value)} min sur ${p.target}`;
    if (s.goal.kind === "distance") return `${p.value.toFixed(1).replace(".", ",")} km sur ${p.target}`;
    return `${Math.round(p.value)} ${beatWord(s, p.target)} sur ${p.target}`;
  }

  function channelsFor(level) {
    if (level <= 0) return [];
    if (level === 1) return ["screen", "notification"];
    return ["screen", "notification", "audio"];
  }

  /** May a cue be sent now? Safety, immersion and the quiet period decide. Priority 3 skips the quiet period. */
  function canSpeak(state, rule, now) {
    if (state.level < rule.minLevel) return false;
    if (state.status === "ended") return false;
    const safety = V().SAFETY[state.safety];
    const gap = Math.max(LEVEL_GAP_S[state.level] ?? 150, safety.minGapS);
    if (rule.priority >= 3) return true;
    return state.lastCueAt == null || (now - state.lastCueAt) / 1000 >= gap;
  }

  function runCompanion(state, now, out) {
    for (const rule of RULES) {
      const key = rule.mark ? rule.mark(state) : rule.id;
      if (rule.once && state.firedRules[rule.id]) continue;
      if (rule.cooldownS && state.firedRules[key] && (now - state.firedRules[key]) / 1000 < rule.cooldownS) continue;
      if (!rule.when(state, now)) continue;
      if (!canSpeak(state, rule, now)) continue;
      const cue = { id: rule.id, at: now, text: rule.text(state, now), why: rule.why, channels: channelsFor(state.level), priority: rule.priority };
      state.firedRules[rule.id] = now;
      if (rule.mark) state.firedRules[key] = now;
      state.lastCueAt = now;
      state.cues.push(cue);
      if (state.cues.length > MAX_CUES) state.cues.shift();
      out.push({ type: "cue", cue });
      break; // one cue per step at most: never a burst.
    }
  }

  /* ------------------------------------------------------------------ events */
  function runEvents(state, now, out, prevBeats) {
    const conf = V().resolve(state.sport);
    const beats = beatCount(state, now);
    for (const ev of conf.events) {
      const w = ev.when || {};
      let fire = false;
      let key = ev.id;
      if (w.everyBeats && beats > prevBeats) {
        for (let b = prevBeats + 1; b <= beats; b++) if (b % w.everyBeats === 0) { fire = true; key = `${ev.id}:${b}`; }
      } else if (w.elevationEveryM) {
        const step = Math.floor(state.gps.elevationM / w.elevationEveryM);
        if (step > 0) { key = `${ev.id}:${step}`; fire = true; }
      } else if (w.field) {
        const v = num(state.fields[w.field], 0);
        if (v > 0) { key = `${ev.id}:${v}`; fire = true; }
      } else if (w.needs) {
        fire = (w.needs === "echo" && !!state.echo && activeMin(state, now) >= 1) || (w.needs === "team" && !!state.fields.team);
      } else if (w.beatsLeft && state.plan.count) {
        fire = state.plan.count - loggedBeats(state, "round") === w.beatsLeft;
      } else if (w.random && beats > prevBeats) {
        key = `${ev.id}:${beats}`;
        fire = draw(state.seed, key) < w.random;
      }
      if (!fire || state.events.some((e) => e.key === key)) continue;
      const event = { id: ev.id, key, at: Math.round(activeMs(state, now) / 1000), text: ev.text };
      state.events.push(event);
      if (state.events.length > 40) state.events.shift();
      out.push({ type: "event", event, narrate: state.level >= 3 });
    }
  }

  /* ------------------------------------------------------------------ missions */
  function runMissions(state, now, out) {
    const conf = V().resolve(state.sport);
    // Completion.
    for (const id of [...state.missions.active]) {
      const mission = conf.missions.find((mi) => mi.id === id);
      if (!mission || mission.check.metric === "declared") continue;
      const t = missionTarget(state, mission);
      if (t != null && metricValue(state, mission.check, now) >= t) complete(state, mission, now, out);
    }
    // Feel guard: drop surpassing missions when the athlete says it is hard.
    if (num(state.feel, 0) >= 8) {
      for (const id of [...state.missions.active]) {
        const mission = conf.missions.find((mi) => mi.id === id);
        if (mission && mission.intents.length === 1 && mission.intents[0] === "depasser") {
          state.missions.active = state.missions.active.filter((x) => x !== id);
          state.missions.declined.push(id);
          out.push({ type: "mission_set_aside", id });
        }
      }
    }
    // Live offers, only when the screen may ask and the companion is allowed to.
    if (state.offerMode !== "live" || state.level < 1 || state.status !== "active") return;
    if (state.missions.offered.length >= MAX_OFFERS || state.missions.active.length >= 1) return;
    if (state.missions.done.length >= MAX_DONE) return;
    if (state.missions.lastOfferAt != null && (now - state.missions.lastOfferAt) / 1000 < OFFER_GAP_S) return;
    if (num(state.feel, 0) >= 8) return;
    const seen = new Set([...state.missions.offered, ...state.missions.declined, ...state.missions.done.map((d) => d.id)]);
    const candidates = conf.missions.filter((mi) => !seen.has(mi.id) && missionAvailable(state, mi, now));
    if (!candidates.length) return;
    // Deterministic choice among the candidates of the current phase.
    const pick = candidates[Math.floor(draw(state.seed, `offer:${state.missions.offered.length}`) * candidates.length)];
    state.missions.offered.push(pick.id);
    state.missions.lastOfferAt = now;
    out.push({ type: "mission_offer", mission: publicMission(state, pick) });
  }

  function complete(state, mission, now, out) {
    state.missions.active = state.missions.active.filter((x) => x !== mission.id);
    if (state.missions.done.length >= MAX_DONE || state.missions.done.some((d) => d.id === mission.id)) return;
    const done = { id: mission.id, at: Math.round(activeMs(state, now) / 1000), declared: mission.check.metric === "declared" };
    state.missions.done.push(done);
    out.push({ type: "mission_done", mission: publicMission(state, mission) });
  }

  function publicMission(state, mission) {
    return { id: mission.id, label: mission.label, text: mission.text, target: missionTarget(state, mission), metric: mission.check.metric, safetyNote: mission.safetyNote || null };
  }

  /* ------------------------------------------------------------------ step */
  /**
   * Inputs: start · pause · resume · tick · gps{distanceM, elevationM, newPlaces?} · beat{kind, data} · rest_start ·
   * field{id, value} · feel{value} · accept{id} · decline{id} · declare{id} · end{rpe?}.
   */
  function step(prev, input, now) {
    const state = clone(prev);
    const out = [];
    const prevBeats = beatCount(prev, now);
    // After the end, only the report (statistics and declared missions) may still change the session.
    if (state.status === "ended" && !["tick", "field", "declare"].includes(input.type)) return { state: prev, out };
    switch (input.type) {
      case "start":
        if (state.status !== "ready") break;
        state.status = "active"; state.startedAt = now; state.runStart = now; state.createdAt = state.createdAt || now;
        for (const id of (input.missions || []).slice(0, 2)) accept(state, id, out);
        break;
      case "pause":
        if (state.status !== "active") break;
        state.activeMs = activeMs(state, now); state.runStart = null; state.status = "paused"; state.pausedAt = now;
        break;
      case "resume":
        if (state.status !== "paused") break;
        state.status = "active"; state.runStart = now; state.pausedAt = null;
        break;
      case "gps":
        state.gps.distanceM = Math.max(state.gps.distanceM, num(input.distanceM, state.gps.distanceM));
        state.gps.elevationM = Math.max(state.gps.elevationM, num(input.elevationM, state.gps.elevationM));
        if (input.newPlaces != null) { state.gps.newPlaces = Math.max(state.gps.newPlaces, num(input.newPlaces)); state.fields.newPlaces = state.gps.newPlaces; }
        break;
      case "beat": {
        if (state.status === "ready" || state.beats.length >= MAX_BEATS) break;
        const data = sanitizeBeat(input.data || {});
        const restOk = state.rest.since != null && state.rest.targetS > 0 ? (now - state.rest.since) / 1000 >= state.rest.targetS * 0.9 : false;
        state.beats.push({ kind: String(input.kind || "beat").slice(0, 16), at: Math.round(activeMs(state, now) / 1000), data, restOk });
        derive(state, data, input.kind);
        if (state.rest.targetS > 0 && ["set", "attempt", "round"].includes(input.kind)) state.rest.since = now;
        break;
      }
      case "rest_start":
        state.rest.since = now;
        if (input.targetS) state.rest.targetS = clamp(num(input.targetS), 10, 900);
        break;
      case "field":
        if (/^[a-z_]{2,32}$/.test(String(input.id || ""))) state.fields[input.id] = typeof input.value === "number" ? clamp(input.value, -1e6, 1e6) : String(input.value).slice(0, 40);
        if (input.id === "conditions") deriveConditions(state, input.value);
        if (input.id === "technique_note") noteTechnique(state, String(input.value || "").trim().slice(0, 40));
        break;
      case "feel":
        state.feel = clamp(num(input.value, 5), 1, 10);
        break;
      case "accept": accept(state, input.id, out); break;
      case "decline":
        if (state.missions.offered.includes(input.id) && !state.missions.declined.includes(input.id)) state.missions.declined.push(input.id);
        break;
      case "declare": {
        const mission = V().resolve(state.sport).missions.find((mi) => mi.id === input.id);
        if (mission && mission.check.metric === "declared" && state.missions.active.includes(mission.id)) {
          if (state.missions.done.filter((d) => d.declared).length < 1) complete(state, mission, now, out);
          else { state.missions.active = state.missions.active.filter((x) => x !== mission.id); out.push({ type: "mission_capped", id: mission.id }); }
        }
        break;
      }
      case "end":
        if (state.status === "ready") break;
        state.activeMs = activeMs(state, now); state.runStart = null; state.status = "ended";
        state.ended = { at: now, rpe: input.rpe == null ? null : clamp(num(input.rpe), 1, 10) };
        break;
      default: break;
    }
    state.lastSeenAt = now;
    if (state.status === "active" || input.type === "end") autoRounds(state, now);
    if (state.status === "ended" && input.type !== "end") runMissions(state, now, out);
    else if (state.status === "active" || input.type === "end") {
      runMissions(state, now, out);
      runEvents(state, now, out, prevBeats);
      if (state.status !== "ended") runCompanion(state, now, out);
    } else if (state.status === "paused") runCompanion(state, now, out);
    return { state, out };
  }

  /** With a bell (combat rounds, intervals), each finished work period is a round: no tap needed. */
  function autoRounds(state, now) {
    const work = num(state.plan.workS), rest = num(state.plan.restS), count = num(state.plan.count, 0);
    if (!(work > 0) || !(count > 0) || !["rounds"].includes(V().resolve(state.sport).panel)) return;
    if (state.plan.kind !== "round") return;
    const t = activeMs(state, now) / 1000;
    const done = t < work ? 0 : Math.min(count, Math.floor((t - work) / (work + rest)) + 1);
    const have = state.beats.filter((b) => b.kind === "round").length;
    for (let i = have; i < done && state.beats.length < MAX_BEATS; i++)
      state.beats.push({ kind: "round", at: Math.round(i * (work + rest) + work), data: { auto: true }, restOk: i > 0 });
  }

  function accept(state, id, out) {
    const conf = V().resolve(state.sport);
    const mission = conf.missions.find((mi) => mi.id === id);
    if (!mission || state.missions.active.includes(id) || state.missions.done.some((d) => d.id === id)) return;
    if (state.missions.active.length >= 2) return;
    if (!missionAvailable(state, mission, 0, { before: true })) return;
    if (!state.missions.offered.includes(id)) state.missions.offered.push(id);
    state.missions.active.push(id);
    out.push({ type: "mission_active", mission: publicMission(state, mission) });
  }

  function sanitizeBeat(d) {
    const o = {};
    for (const [k, v] of Object.entries(d)) {
      if (!/^[a-z_]{1,20}$/.test(k)) continue;
      if (typeof v === "number" && Number.isFinite(v)) o[k] = clamp(v, -1e5, 1e5);
      else if (typeof v === "boolean") o[k] = v;
      else if (typeof v === "string") o[k] = v.slice(0, 40);
    }
    return o;
  }

  /** Domain facts derived from beats: thresholds, comebacks, steady ends, new exercises… */
  function derive(state, d, kind) {
    const f = state.fields;
    const inc = (k, n = 1) => { f[k] = num(f[k], 0) + n; };
    if (kind === "set") {
      if (d.exercise && !state.known.exercises.includes(d.exercise)) { state.known.exercises.push(d.exercise); inc("newExercises"); }
      if (d.threshold && num(d.rir, 0) >= 1) inc("thresholdSets");
    }
    if (kind === "attempt") {
      if (d.result === "fall") inc("falls");
      if (d.result === "send" || d.result === "flash") inc("sends");
      if (d.project && (d.result === "send" || d.result === "flash")) inc("projectSent");
      if (d.threshold) inc("thresholdMarks");
    }
    if (kind === "point") {
      const won = state.beats.filter((b) => b.kind === "point" && b.data.won).length;
      f.pointsWon = won; f.pointsLost = state.beats.filter((b) => b.kind === "point" && !b.data.won).length;
      if (streak(state, { kind: "point", won: true }) >= 3) f.momentum = Math.max(num(f.momentum), 1);
    }
    if (kind === "game") {
      inc(d.won ? "gamesWon" : "gamesLost");
      if (d.won && d.trailing) inc("comebacks");
    }
    if (kind === "end") {
      const scores = state.beats.filter((b) => b.kind === "end" && Number.isFinite(b.data.score)).map((b) => b.data.score);
      if (scores.length >= 3) {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const tol = Math.max(1, Math.abs(mean) * 0.1);
        let run = 0, best = 0;
        for (const s of scores) { run = Math.abs(s - mean) <= tol ? run + 1 : 0; best = Math.max(best, run); }
        f.steadyEnds = best >= 3 ? best : 0;
      }
    }
    if (kind === "round" && d.technique && !state.known.techniques.includes(d.technique)) { state.known.techniques.push(d.technique); inc("newTechniques"); }
    if (kind === "routine" && d.clean) inc("cleanRuns");
    if (kind === "period") f.period = loggedBeats(state, "period");
    if (kind === "leg") f.leg = loggedBeats(state, "leg");
    if (kind === "lap") f.laps = loggedBeats(state, "lap");
  }

  /** A technique noted between rounds (the bell logs the rounds itself). */
  function noteTechnique(state, name) {
    if (!name) return;
    state.notes = state.notes || { technique: [] };
    if (!state.notes.technique.includes(name) && state.notes.technique.length < 20) state.notes.technique.push(name);
    if (!state.known.techniques.includes(name)) { state.known.techniques.push(name); state.fields.newTechniques = num(state.fields.newTechniques, 0) + 1; }
  }

  function deriveConditions(state, value) {
    const list = String(value || "").split("|").map((x) => x.trim()).filter(Boolean).slice(0, 4);
    state.fields.conditionsRead = list.length ? 1 : 0;
    const fresh = list.filter((c) => !state.known.conditions.includes(c));
    state.fields.newConditions = fresh.length;
  }

  /* ------------------------------------------------------------------ resume */
  /** Reopen a saved state after the app was killed or the phone slept. Wall-clock time keeps counting (like the
   *  existing stopwatch); an unattended gap is reported so the athlete can choose to remove it. */
  function resume(saved, now) {
    if (!saved || saved.v !== VERSION) return null;
    const state = clone(saved);
    const gapS = state.lastSeenAt ? Math.round((now - state.lastSeenAt) / 1000) : 0;
    const out = [];
    if (state.status === "active" && gapS >= INTERRUPT_S) {
      state.interrupted++;
      out.push({ type: "interrupted", gapS, since: state.lastSeenAt });
    }
    state.lastSeenAt = now;
    return { state, out };
  }

  /** The athlete says they were stopped during the gap: remove it from the active time. */
  function trimGap(saved, since, now) {
    const state = clone(saved);
    if (state.status !== "active" || state.runStart == null || since == null) return state;
    state.activeMs = Math.max(0, state.activeMs + Math.max(0, since - state.runStart));
    state.runStart = now;
    return state;
  }

  /* ------------------------------------------------------------------ views */
  /** Everything a live screen needs, computed once per render. */
  function view(state, now) {
    const conf = V().resolve(state.sport);
    const beats = beatCount(state, now);
    const minutes = activeMin(state, now);
    const restLeftS = state.rest.since != null && state.rest.targetS > 0 ? Math.max(0, Math.round(state.rest.targetS - (now - state.rest.since) / 1000)) : null;
    const bell = state.plan.workS ? bellState(state, now) : null;
    return {
      status: state.status, sport: conf.label, voie: conf.voie, voieName: conf.voieName, panel: conf.panel,
      intent: state.intent, level: state.level, safety: state.safety, tapsAllowed: V().SAFETY[state.safety].tapsWhileActive || state.status !== "active",
      activeS: Math.floor(minutes * 60), effortMin: countedMinutes(minutes, null),
      elan: { value: Math.min(90, countedMinutes(minutes, null)), max: 90 },
      beats, beatOne: conf.beat.one, beatMany: conf.beat.many, beatLabel: beatWordFor(conf, beats),
      planCount: state.plan.count || null, goal: goalProgress(state, now),
      gps: state.gps, restLeftS, bell,
      echo: state.echo ? { beats: echoBeats(state, now), delta: beats - echoBeats(state, now) } : null,
      missions: {
        active: state.missions.active.map((id) => conf.missions.find((mi) => mi.id === id)).filter(Boolean).map((mi) => ({ ...publicMission(state, mi), value: mi.check.metric === "declared" ? null : Math.floor(metricValue(state, mi.check, now)) })),
        done: state.missions.done.length,
      },
      lastEvent: state.events[state.events.length - 1] || null,
      lastCue: state.cues[state.cues.length - 1] || null,
      fields: state.fields,
    };
  }
  function beatWordFor(conf, n) { return n > 1 ? conf.beat.many : conf.beat.one; }

  /** Round/interval bell: which round, work or rest, seconds left. Driven by active time, so pause freezes it. */
  function bellState(state, now) {
    const work = num(state.plan.workS), rest = num(state.plan.restS), count = num(state.plan.count, 1);
    const cycle = work + rest;
    if (!(work > 0)) return null;
    const t = activeMs(state, now) / 1000;
    const idx = Math.floor(t / cycle);
    if (idx >= count) return { round: count, of: count, phase: "done", leftS: 0 };
    const inCycle = t - idx * cycle;
    return inCycle < work ? { round: idx + 1, of: count, phase: "work", leftS: Math.ceil(work - inCycle) } : { round: idx + 1, of: count, phase: "rest", leftS: Math.ceil(cycle - inCycle) };
  }

  /* ------------------------------------------------------------------ journal */
  /** Compact, bounded journal stored in the session details (details.live) and settled by the server. */
  function journal(state) {
    const conf = V().resolve(state.sport);
    const beatsByKind = {};
    for (const b of state.beats) beatsByKind[b.kind] = (beatsByKind[b.kind] || 0) + 1;
    const end = state.ended?.at ?? state.lastSeenAt ?? 0;
    const pick = ["pointsWon", "pointsLost", "gamesWon", "gamesLost", "comebacks", "falls", "sends", "projectSent", "thresholdSets",
      "thresholdMarks", "steadyEnds", "newExercises", "newTechniques", "cleanRuns", "newPlaces", "conditionsRead", "newConditions", "pain_before", "pain_after"];
    const fields = {};
    for (const k of pick) if (state.fields[k] != null && Number.isFinite(Number(state.fields[k]))) fields[k] = Math.round(Number(state.fields[k]));
    return {
      v: VERSION, seed: state.seed.slice(0, 64), voie: conf.voie, sport: conf.sport, intent: state.intent,
      immersion: state.immersion, goal: state.goal, activeMin: Math.round(activeMin(state, end) * 10) / 10,
      beats: beatCount(state, end), beatsByKind, restsRespected: state.beats.filter((b) => b.restOk).length,
      gps: { distanceM: Math.round(state.gps.distanceM), elevationM: Math.round(state.gps.elevationM), newPlaces: state.gps.newPlaces },
      missions: state.missions.done.slice(0, MAX_DONE).map((d) => ({ id: d.id, at: d.at, declared: !!d.declared })),
      events: state.events.slice(-12).map((e) => e.id), fields, interrupted: state.interrupted, recovery: state.recovery,
    };
  }

  /** Fields to prefill the regular session form: the live never bypasses the existing save path. */
  function toDraft(state) {
    const conf = V().resolve(state.sport);
    const end = state.ended?.at ?? state.lastSeenAt ?? 0;
    const minutes = activeMin(state, end);
    const draft = { sport: conf.sport, durationMin: Math.max(1, Math.round(minutes)), rpe: state.ended?.rpe ?? null, extras: {} };
    if (state.gps.distanceM > 0 && conf.unit === "km") draft.distanceKm = Math.round(state.gps.distanceM / 10) / 100;
    if (state.gps.elevationM > 0) draft.elevationM = Math.round(state.gps.elevationM);
    const k = (id) => state.beats.filter((b) => b.kind === id).length;
    const fieldIds = new Set((V().resolve(state.sport).data.afterFields) || []);
    const put = (id, v) => { if (fieldIds.has(id) && v > 0) draft.extras[id] = v; };
    put("rounds", k("round")); put("attempts", k("attempt")); put("successful_routes", num(state.fields.sends));
    put("flashes", state.beats.filter((b) => b.kind === "attempt" && b.data.result === "flash").length);
    put("fall_count", num(state.fields.falls)); put("falls", num(state.fields.falls));
    put("sets_won", state.beats.filter((b) => b.kind === "game" && b.data.won && b.data.set).length);
    put("ends", k("end")); put("routines", k("routine")); put("laps", k("lap")); put("runs", k("run"));
    if (fieldIds.has("pain_before") && state.fields.pain_before != null) draft.extras.pain_before = state.fields.pain_before;
    if (fieldIds.has("pain_after") && state.fields.pain_after != null) draft.extras.pain_after = state.fields.pain_after;
    const sets = state.beats.filter((b) => b.kind === "set");
    if (sets.length) {
      const byEx = new Map();
      for (const s of sets) {
        const name = s.data.exercise || "Exercice";
        if (!byEx.has(name)) byEx.set(name, []);
        byEx.get(name).push({ reps: s.data.reps ?? null, load: s.data.load ?? null, rir: s.data.rir ?? null, hold: s.data.hold ?? null });
      }
      draft.exercises = [...byEx.entries()].map(([name, rows]) => ({ name, setRows: rows }));
    }
    return draft;
  }

  const api = { VERSION, MAX_OFFERS, MAX_DONE, hash, draw, create, step, resume, trimGap, view, journal, toDraft, preparable,
    beatCount, goalProgress, phaseOf, countedMinutes, activeMs, bellState, RULES };
  root.TitanLiveEngine = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
