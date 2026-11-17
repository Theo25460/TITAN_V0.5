/* TITAN — sport measure contracts (shared, unchanged, by the website and the Android app).
   The catalogue (public.sports.extra_fields, offline snapshot in sports-catalog.js) keeps every field a discipline ever had, so
   that old sessions stay readable and the server keeps validating them. Not all of them should still be ASKED: the 2026-10
   rework appended the historical ones (priority ≥ 100) to each curated group, which put « Qualité exécution 1–10 » under walking,
   a cadence under freediving, a positive elevation under figure skating and a « top set » under a strength form that already
   records every set. This module decides, per family and per discipline, which fields a NEW entry asks for. It never deletes a
   value: a field that already holds one in the session being edited is always shown again, and the server catalogue is
   untouched (validation, history and rewards are unchanged).

   Contract by entry form — what the form itself measures (structured keys, never asked twice as an extra) and the figure that
   progress is compared on. Each discipline then adds the curated fields of its group (tools/data/sport-metrics.mjs). */
(function (root) {
  "use strict";

  const FORM_CONTRACTS = {
    distance: { label: "Distance, durée, dénivelé", structured: ["distance", "elevation", "avg_speed", "avg_pace"], progress: "distance" },
    swim: { label: "Distance nagée, durée, bassin", structured: ["distance", "pool", "pool_length", "avg_pace", "pace_100m"], progress: "meters" },
    strength: { label: "Exercices, séries, charges, répétitions, RIR", structured: ["sets", "reps", "top_load", "volume", "top_set_weight", "top_set_reps", "working_sets", "rir", "exercise", "lift"], progress: "load" },
    bodyweight: { label: "Mouvements, séries, répétitions, maintiens", structured: ["sets", "best_set", "reps"], progress: "reps" },
    climbing: { label: "Discipline, lieu, cotation, essais, réussites", structured: ["attempts", "successful_routes", "routes", "grade_max", "max_done", "max_tried", "climbing_discipline", "grade_system", "location", "belay", "climb_type", "difficulty"], progress: "grade" },
    practice: { label: "Durée et mesures propres à la discipline", structured: [], progress: "duration" },
  };

  /** Self-rated 1–10 scores that duplicate the session's effort rating or describe health (pain): kept on old sessions, never asked. */
  const SELF_RATED = new Set(["rally_quality_score", "control_score", "sparring_intensity", "breathing_quality", "mobility_score", "balance_score", "navigation_quality", "technical_difficulty", "pain_before", "pain_after"]);

  const set = (s) => new Set(s.split(" "));
  const BOARD_WATER = set("bodyboarding skimboarding water_skiing wakeboard canoe_slalom surfing");
  const MULTISPORT = set("triathlon duathlon aquathlon swimrun adventure_racing modern_pentathlon obstacle_course");
  const BALL_CYCLING = set("cycle_ball cycle_polo artistic_cycling");
  const LAP_SKATING = set("figure_skating speed_skating short_track_speed_skating inline_speed_skating");
  const NORDIC = set("cross_country_skiing roller_ski biathlon nordic_combined ski_orienteering");
  const HALF_SCORE = set("beach_volleyball futnet sepak_takraw sitting_volleyball roller_derby");
  const TARGET_GAMES = set("shooting billiards_pool snooker bocce boccia petanque croquet disc_golf");
  const NO_LOAD_DUEL = set("tug_of_war arm_wrestling highland_games grip_sport");
  const POOL_GAMES = set("underwater_hockey underwater_rugby");

  /* Historical fields that do not describe the discipline they sit under. Each rule returns a short reason (kept for the audit
     test and the documentation), or nothing when the field is relevant. Only fields outside the curated group are judged. */
  const RETIRED = {
    cadence: (id, p) => (p.profile === "water" ? "la cadence d'un bateau est sa fréquence de coups, déjà mesurée" : BALL_CYCLING.has(id) ? "pas de pédalage régulier dans ce jeu" : id === "stair_climbing" ? "les marches se comptent en dénivelé" : ["freediving", "snorkeling", "lifesaving_sport"].includes(id) ? "sans objet sous l'eau" : ""),
    falls: (id, p) => (p.profile === "water" && !BOARD_WATER.has(id) ? "on ne chute pas d'un bateau ni sous l'eau" : ""),
    conditions: (id) => (POOL_GAMES.has(id) ? "se joue en bassin" : ""),
    elevation: (id, p) => (p.form === "practice" && id !== "stair_climbing" ? "ni montée ni descente mesurable dans cette pratique" : ""),
    avg_speed: (id) => (BALL_CYCLING.has(id) ? "pas de vitesse de déplacement significative" : ""),
    avg_power: (id) => (BALL_CYCLING.has(id) ? "pas de puissance mesurée dans ce jeu" : ""),
    ride_type: (id) => (BALL_CYCLING.has(id) ? "pas de type de sortie" : ""),
    avg_pace: (id, p) => (p.form !== "distance" ? "une allure se calcule depuis une distance et une durée" : ""),
    pool_length: (id) => (id === "artistic_swimming" ? "pas de longueurs en natation artistique" : ""),
    stroke: (id) => (["aquagym", "artistic_swimming"].includes(id) ? "pas de nage de longueurs" : ""),
    stroke_rate: (id) => (["aquagym", "artistic_swimming"].includes(id) ? "pas de nage de longueurs" : ""),
    swolf: (id) => (id === "aquagym" ? "pas de nage de longueurs" : ""),
    pace_100m: (id) => (id === "aquagym" ? "pas de nage de longueurs" : ""),
    drills: (id) => (id === "aquagym" ? "pas de nage de longueurs" : ""),
    runs: (id) => (LAP_SKATING.has(id) || NORDIC.has(id) ? "on compte des tours ou une distance, pas des descentes" : ""),
    rounds: (id) => (MULTISPORT.has(id) ? "un enchaînement multisport ne se découpe pas en rounds" : ""),
    stations: (id) => (MULTISPORT.has(id) ? "un enchaînement multisport ne se découpe pas en ateliers" : ""),
    work_time: (id) => (MULTISPORT.has(id) ? "la durée de la séance suffit" : ""),
    top_set_weight: (id) => (["farmers_walk", "strongman", "trx"].includes(id) ? "la charge propre à l'épreuve est déjà demandée" : ""),
    top_set_reps: (id) => (["farmers_walk", "strongman"].includes(id) ? "pas de séries de répétitions dans cette épreuve" : ""),
    working_sets: (id) => (["farmers_walk", "strongman"].includes(id) ? "déjà compté en passages ou essais" : ""),
    rir: (id) => (["farmers_walk", "strongman"].includes(id) ? "pas de séries de répétitions" : ""),
    tempo: () => "le tempo d'une répétition est déjà demandé en secondes",
    lift: (id) => (id === "strongman" ? "l'épreuve est déjà demandée" : ""),
    exercise: (id) => (NO_LOAD_DUEL.has(id) ? "l'épreuve est déjà demandée" : ""),
    sets: (id) => (NO_LOAD_DUEL.has(id) ? "pas de séries dans cette épreuve" : ""),
    reps: (id) => (NO_LOAD_DUEL.has(id) ? "pas de répétitions dans cette épreuve" : ""),
    volume: (id) => (NO_LOAD_DUEL.has(id) ? "pas de tonnage dans cette épreuve" : ""),
    top_load: (id) => (["tug_of_war", "arm_wrestling"].includes(id) ? "pas de charge soulevée" : ""),
    attempts: (id) => (TARGET_GAMES.has(id) ? "déjà compté en tirs, coups ou mènes" : ""),
    average_score: (id) => (TARGET_GAMES.has(id) ? "le score est déjà demandé" : ""),
    accuracy: (id) => (TARGET_GAMES.has(id) && id !== "shooting" ? "se déduit des coups réussis" : ""),
    score_for: (id) => (HALF_SCORE.has(id) ? "un score sans celui de l'adversaire ne se compare pas ; les sets ou points sont demandés" : ""),
    pack_weight: () => "le poids du sac est déjà demandé",
    focus_area: () => "la zone travaillée est déjà demandée",
    submissions: (id) => (["krav_maga", "kung_fu"].includes(id) ? "pas de soumission dans cette pratique" : ""),
    intervals: (id) => (["walking", "nordic_walk"].includes(id) ? "une marche ne se fractionne pas" : ""),
    water: (id) => (id === "rowing_machine" ? "rameur d'intérieur" : ""),
    repetitions: (id) => (["elliptical", "stair_climbing"].includes(id) ? "pas de répétitions sur cet appareil" : ""),
  };
  /* Curated fields that a few disciplines of a group do not share (same rules, applied even below priority 100). */
  const CURATED_EXCEPTIONS = new Set(["intervals", "water", "repetitions"]);

  const sports = () => root.TitanSports;
  const filled = (v) => v !== undefined && v !== null && v !== "";

  function profileOf(id) {
    const S = sports();
    return { form: S ? S.formOf(id) : "practice", profile: S ? S.profileOf(id) : "" };
  }

  /** Why a field is not asked anymore for this discipline, or "" when it is. */
  function retiredReason(id, field) {
    if (!field || !field.id) return "champ invalide";
    if (field.legacy === true) return "note générique d'avant le catalogue par discipline";
    if (SELF_RATED.has(field.id)) return "auto-évaluation redondante avec l'effort ressenti, ou donnée de santé";
    const curated = (Number(field.priority) || 0) < 100;
    if (curated && !CURATED_EXCEPTIONS.has(field.id)) return "";
    const rule = RETIRED[field.id];
    return rule ? rule(id, profileOf(id)) || "" : "";
  }

  function contract(id) {
    const { form, profile } = profileOf(id);
    const base = FORM_CONTRACTS[form] || FORM_CONTRACTS.practice;
    return { form, profile, label: base.label, structured: base.structured.slice(), progress: base.progress };
  }

  function structuredKeys(id) {
    return contract(id).structured;
  }

  /** Fields a form shows for a discipline: relevant, not owned by the form itself; a field that already holds a value stays. */
  function entryFields(id, fields, { values = {}, skip } = {}) {
    const own = new Set(skip || structuredKeys(id));
    return (Array.isArray(fields) ? fields : [])
      .filter((f) => f && f.id && !own.has(f.id))
      .filter((f) => filled(values[f.id]) || !retiredReason(id, f))
      .slice()
      .sort((a, b) => (a.priority || 99) - (b.priority || 99));
  }

  /** For tests and documentation: what each discipline asks and what it no longer asks, with the reason. */
  function audit(id, fields) {
    const own = new Set(structuredKeys(id));
    const asked = [];
    const retired = [];
    for (const f of fields || []) {
      if (!f || !f.id || own.has(f.id)) continue;
      const why = retiredReason(id, f);
      if (why) retired.push({ id: f.id, why });
      else asked.push(f.id);
    }
    return { sport: id, ...contract(id), asked, retired };
  }

  /* ---------- Same effort recorded twice ----------
     A watch, Health Connect, a GPX file and a hand-typed entry can describe the same effort under neighbouring sport ids (a treadmill
     run sent as « running », a mountain-bike ride as « cycling »). The server links imports to the journal within one sport id only;
     before a NEW entry is saved, the clients look for the same effort in the account's own journal and ask. Nothing is ever merged
     or deleted automatically. */
  const DEDUPE_GROUPS = {
    run: "running treadmill trail fell_running orienteering race_walking",
    ride: "cycling cycling_road cycling_indoor spinning mountain_bike gravel cyclocross velotaf handbike para_cycling",
    swim: "swimming open_water_swimming para_swimming finswimming",
    walk: "walking nordic_walk hiking trekking rucking snowshoeing",
    strength: "muscu_gym muscu_home muscu_builder powerlifting weightlifting kettlebell",
    row: "rowing rowing_machine coastal_rowing",
    yoga: "yoga yoga_mobility stretching pilates",
  };
  const GROUP_OF = new Map();
  for (const [group, ids] of Object.entries(DEDUPE_GROUPS)) for (const id of ids.split(" ")) GROUP_OF.set(id, group);
  const dedupeGroup = (sport) => GROUP_OF.get(sport) || String(sport || "");

  const minutesOfLog = (l) => {
    const d = root.TitanTraining?.duration?.(l);
    return d && d > 0 ? d : l && l.unit === "min" && Number(l.val) > 0 ? Number(l.val) : 30;
  };
  /** Readings of an effort: always from its date; also up to its date when it was saved « now » with no trace (older entries). */
  function readings(l, minutes) {
    const t = new Date(l.date).getTime();
    const out = [[t, t + minutes * 60000]];
    const created = new Date(l.created_at || l.date).getTime();
    const traced = l.details?.hasGpx || l.details?.gpxStats || l.details?.source || l.details?.import_source;
    if (Number.isFinite(created) && Math.abs(created - t) <= 10 * 60000 && !traced) out.push([t - minutes * 60000, t]);
    return out;
  }
  /** The journal session that very likely records the same effort as `candidate` ({ sport, date, minutes }), or null. */
  function findDuplicate(candidate, logs) {
    if (!candidate || !candidate.sport) return null;
    const start = new Date(candidate.date).getTime();
    if (!Number.isFinite(start)) return null;
    const minutes = Number(candidate.minutes) > 0 ? Number(candidate.minutes) : 30;
    const group = dedupeGroup(candidate.sport);
    const own = [start, start + minutes * 60000];
    let best = null;
    for (const l of logs || []) {
      if (!l || l.archived_at || dedupeGroup(l.sport) !== group) continue;
      if (candidate.id && (l.id === candidate.id || l.client_event_id === candidate.id)) continue;
      const t = new Date(l.date).getTime();
      if (!Number.isFinite(t) || Math.abs(t - start) > 86400000) continue;
      const m = minutesOfLog(l);
      const need = 0.5 * Math.min(m, minutes) * 60000;
      for (const [a, b] of readings(l, m)) {
        const shared = Math.min(b, own[1]) - Math.max(a, own[0]);
        if (shared >= need && (!best || shared > best.shared)) best = { log: l, shared };
      }
    }
    return best ? best.log : null;
  }

  const api = { version: 1, FORM_CONTRACTS, SELF_RATED, DEDUPE_GROUPS, contract, structuredKeys, retiredReason, entryFields, audit, dedupeGroup, findDuplicate };
  root.TitanSportContracts = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
