/* TITAN — personal progression, shared unchanged by the website and the Android app.
   Three questions an athlete actually asks, answered only from what was measured:
   1. compare(log, logs)      « Par rapport à ma dernière séance comparable ? » — same sport, comparable size (a 10 km run against
                              a 8–12 km run, a squat against the last squat), with the figure that discipline progresses on.
   2. disciplines(logs, opts) « Est-ce que je progresse en course, en musculation, en escalade ? » — the same figure over the
                              last weeks, first half against second half, with the number of sessions behind each value.
   3. periods(logs, opts)     « Ce mois-ci par rapport au précédent ? » across sports with different units: sessions, active days and
                              DECLARED minutes per family and discipline; minutes TITAN estimates are counted apart, never mixed in.
   Rules: only sessions the server did not hold or refuse, with plausible measures (TitanTraining.counted / plausible); no value
   is invented (no estimated 1RM, no score, no zone, no advice); « significant » means a change beyond a stated threshold, not a
   statistical test; every result carries the sessions it comes from. */
(function (root) {
  "use strict";
  const DAY = 86400000;
  const T = () => root.TitanTraining;
  const S = () => root.TitanSports;
  const I = () => root.TitanInsights;

  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const time = (l) => new Date(l?.date).getTime();
  const usable = (l) => l && Number.isFinite(time(l)) && (T()?.counted ? T().counted(l) : !l.archived_at) && (T()?.plausible ? T().plausible(l) : true);
  const declared = (l) => (T()?.duration ? T().duration(l) : num(l?.details?.duration));
  const median = (xs) => {
    const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const round = (v, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

  /* Thresholds under which a change is reported as « stable » rather than better or worse (stated in the result). */
  const THRESHOLD = { pace: 0.02, speed: 0.02, swimPace: 0.02, load: 0.025, volume: 0.1, reps: 0.1, grade: 1, duration: 0.15 };

  /* ---------- The figure each family progresses on ---------- */
  /** The session's own performance figure, or null when it was not measured. */
  function figureOf(log) {
    if (!log || !S()) return null;
    const form = S().formOf(log.sport);
    const minutes = declared(log);
    if (form === "distance" && log.unit === "km") {
      const km = num(log.val);
      if (!(km > 0) || !(minutes > 0) || log.details?.extras?.distance_unknown) return null;
      return S().paceMode(log.sport) === "pace"
        ? { kind: "pace", value: minutes / km, unit: "min/km", better: "lower", size: km, label: "Allure" }
        : { kind: "speed", value: km / (minutes / 60), unit: "km/h", better: "higher", size: km, label: "Vitesse moyenne" };
    }
    if (form === "swim" && log.unit === "m") {
      const m = num(log.val);
      if (!(m > 0) || !(minutes > 0)) return null;
      return { kind: "swimPace", value: minutes / (m / 100), unit: "min/100 m", better: "lower", size: m, label: "Allure aux 100 m" };
    }
    if (form === "climbing") {
      const e = log.details?.extras || {};
      const g = I()?.grade?.(e.max_done, e.grade_system);
      if (!g) return null;
      return { kind: "grade", value: g.score, display: g.label, unit: "", better: "higher", label: "Meilleure cotation réussie", context: [e.grade_system, e.climbing_discipline || ""].join("|") };
    }
    return minutes > 0 ? { kind: "duration", value: minutes, unit: "min", better: null, size: minutes, label: "Durée" } : null;
  }

  /** Per exercise of a strength or bodyweight session: top set and volume (load × reps), or best set and total reps. */
  function exercisesOf(log) {
    const out = new Map();
    for (const ex of log?.details?.exercises || []) {
      if (!ex?.name || ex.kind === "hold") continue;
      const rows = I()?.sets ? I().sets(ex) : [];
      if (!rows.length) continue;
      const key = I().exerciseKey(ex);
      const top = rows.reduce((b, r) => (r.weight > b.weight || (r.weight === b.weight && r.reps > b.reps) ? r : b), rows[0]);
      const volume = rows.reduce((n, r) => n + r.weight * r.reps, 0);
      const reps = rows.reduce((n, r) => n + r.reps, 0);
      out.set(key, { key, name: ex.name, variant: String(ex.variant || "").trim(), equipment: String(ex.equipment || "").trim(), topWeight: top.weight, topReps: top.reps, volume, reps, sets: rows.length, loaded: top.weight > 0 });
    }
    return out;
  }

  function verdict(better, current, previous, threshold) {
    if (current === null || previous === null || !better) return { direction: "neutral", significant: false };
    if (previous === 0) return { direction: current > 0 ? (better === "higher" ? "better" : "worse") : "stable", significant: false };
    const change = (current - previous) / Math.abs(previous);
    if (Math.abs(change) < threshold) return { direction: "stable", significant: false, change };
    const improved = better === "higher" ? change > 0 : change < 0;
    return { direction: improved ? "better" : "worse", significant: true, change };
  }

  const comparableSize = (a, b) => a && b && a.size > 0 && b.size > 0 && Math.abs(a.size - b.size) / Math.max(a.size, b.size) <= 0.25;

  /* ---------- 1. Against the last comparable session ---------- */
  /* V1.7.1 — Comparaisons justes. Which sessions a comparison rests on, by a versioned rule per family, with the sessions kept,
     the sessions set aside and why, the sample size and the limit when a criterion depends on a value that was not recorded.
     Pilot families: running-type distance sports (distance and documented route), strength (exercise and variant), climbing
     (scale and discipline). Other sports keep the rule they had (same sport, comparable size or declared duration).
     Only the server's shared history is a reference: a session still waiting to be sent exists on one device only, so it would make
     two devices with the same account disagree. Estimates (a duration TITAN derives for XP, a grade only tried) are never compared.
     RULES_VERSION changes with any criterion; tests/fixtures/comparables-v171.json is the shared test set of Web and Android. */
  const RULES_VERSION = "2026.11-v1";
  const SELECTION = { sizeGap: 0.25, elevationGapPerKm: 20, maxConsidered: 500, listed: 12 };
  /** Fields that document the kind of route of a distance session, in the order they are read (catalogue field ids). */
  const ROUTE_FIELDS = ["surface", "terrain"];
  /** Grade scales TitanInsights.grade orders. No conversion between scales: a grade is compared within its own scale only. */
  const SCALES = ["Fontainebleau bloc", "Français voie", "V-scale bloc"];
  const REASONS = {
    archived: "archivée",
    refused: "refusée par le serveur",
    held: "en vérification",
    unsent: "en attente d’envoi",
    implausible: "mesure hors limites",
    no_duration: "durée non saisie",
    no_distance: "distance non mesurée",
    kind: "autre mesure",
    size: "distance trop différente",
    route_other: "autre parcours",
    route_unknown: "parcours non renseigné",
    elevation: "dénivelé trop différent",
    no_exercise: "aucun exercice en commun",
    sets_missing: "séries non mesurées",
    variant_other: "même nom, autre variante",
    variant_unknown: "variante non renseignée",
    scale_unknown: "échelle non renseignée",
    scale_other: "autre échelle de cotation",
    discipline_other: "autre discipline",
    discipline_unknown: "discipline non renseignée",
    grade_missing: "aucune réussite cotée",
  };
  /** Reasons tied to the state of a session in the journal: counted, not listed one by one (they are not a criterion). */
  const STATE_REASONS = new Set(["archived", "refused", "held", "unsent", "implausible"]);
  /** Reasons only listed in the counts: a session with nothing in common is not a near miss. */
  const QUIET_REASONS = new Set(["no_exercise", "kind"]);
  /** A missing value that relaxes a criterion when nothing passes it: the comparison then says so (status « limited »). */
  const RELAXABLE = new Set(["route_unknown", "discipline_unknown"]);

  const fr = (v, d = 1) => String(round(v, d)).replace(".", ",");
  const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
  const eventKey = (l) => String(l?.client_event_id || l?.details?.client_event_id || l?.id || "");
  const refOf = (l) => eventKey(l).slice(0, 8);
  const norm = (v) => String(v ?? "").trim().toLocaleLowerCase("fr-FR");
  const hasField = (sport, id) => (root.SPORTS_CONFIG?.[sport]?.extraFields || []).some((f) => f?.id === id);
  const fieldLabel = (sport, id) => (root.SPORTS_CONFIG?.[sport]?.extraFields || []).find((f) => f?.id === id)?.label || id;

  /** Why a session can be no reference whatever the rule (its state), or null. */
  function stateReason(l) {
    const status = String(l.status || "");
    if (l.archived_at) return "archived";
    if (l.syncStatus === "error" || status === "rejected") return "refused";
    if (l.is_suspicious || status === "flagged" || status === "pending_review") return "held";
    if (l.syncStatus === "pending" || l.syncStatus === "sending") return "unsent";
    if (T()?.plausible && !T().plausible(l)) return "implausible";
    return null;
  }
  const estimateOf = (l) => {
    const e = root.TitanProgress?.minutesOf?.(l);
    return e?.estimated && e.minutes > 0 ? Math.round(e.minutes) : null;
  };
  function elevationPerKm(l) {
    const km = num(l?.val), e = num(l?.details?.elevation);
    return l?.unit === "km" && km > 0 && e !== null && e >= 0 ? e / km : null;
  }
  const variantText = (e) => [e.variant, e.equipment].filter(Boolean).join(", ");

  /* Each judge describes its rule and tells, for one earlier session of the same sport, whether it is kept and why not. */
  function distanceJudge(log, mine) {
    const sport = log.sport;
    const routeField = ROUTE_FIELDS.find((f) => hasField(sport, f)) || null;
    const route = routeField ? String(log.details?.extras?.[routeField] ?? "").trim() : "";
    const elev = elevationPerKm(log);
    const unit = mine.kind === "swimPace" ? "m" : "km";
    const size = (v, d = 1) => (unit === "m" ? `${Math.round(v)} m` : `${fr(v, d)} km`);
    const lo = mine.size * (1 - SELECTION.sizeGap), hi = mine.size / (1 - SELECTION.sizeGap);
    const criteria = [`Même sport : ${S().label(sport)}`, `Distance entre ${size(lo, 2)} et ${size(hi, 2)} (à 25 % près)`];
    if (routeField) criteria.push(route ? `Parcours (${fieldLabel(sport, routeField)}) : ${route}` : `Parcours (${fieldLabel(sport, routeField)}) : non renseigné sur cette séance, donc non vérifié`);
    if (unit === "km") criteria.push(`Dénivelé : écart d’au plus ${SELECTION.elevationGapPerKm} m/km quand il est renseigné des deux côtés`);
    criteria.push("Durée déclarée des deux côtés : une durée estimée n’est jamais comparée");
    const limits = [];
    if (routeField && !route) limits.push(`Le parcours de cette séance n’est pas renseigné (${fieldLabel(sport, routeField)}) : TITAN ne peut pas écarter une sortie sur un autre terrain. Renseigne-le pour une comparaison resserrée.`);
    return {
      id: route ? "distance.taille-parcours" : "distance.taille",
      label: route ? `Distance voisine et même parcours (${route})` : "Distance voisine",
      criteria, limits, routeField, route,
      /** The elevation criterion is checked only where both sessions recorded it: the others are said unchecked. */
      unchecked: (kept) => {
        if (elev === null) return null;
        const n = kept.filter(({ l }) => elevationPerKm(l) === null).length;
        return n ? `Dénivelé non renseigné sur ${n} des ${kept.length} séances retenues : il n’est pas vérifié pour ${n > 1 ? "elles" : "elle"}.` : null;
      },
      test(l) {
        const f = figureOf(l);
        if (!f) {
          if (l.unit === unit && (!(num(l.val) > 0) || l.details?.extras?.distance_unknown)) return { reason: "no_distance" };
          if (l.unit === unit && !(declared(l) > 0)) return { reason: "no_duration", estimate: estimateOf(l) };
          return { reason: "kind" };
        }
        if (f.kind !== mine.kind) return { reason: "kind" };
        if (!comparableSize(mine, f)) return { reason: "size", detail: size(f.size) };
        if (routeField && route) {
          const theirs = String(l.details?.extras?.[routeField] ?? "").trim();
          if (!theirs) return { reason: "route_unknown", figure: f };
          if (norm(theirs) !== norm(route)) return { reason: "route_other", detail: theirs };
        }
        const e = elevationPerKm(l);
        if (elev !== null && e !== null && Math.abs(elev - e) > SELECTION.elevationGapPerKm) return { reason: "elevation", detail: `${Math.round(e)} m/km contre ${Math.round(elev)}` };
        return { ok: true, figure: f };
      },
      summary(l, f) {
        const theirs = routeField ? String(l.details?.extras?.[routeField] ?? "").trim() : "";
        const e = num(l.details?.elevation);
        return [size(f.size), formatValue({ unit: f.unit, current: f.value }), theirs, e !== null ? `D+ ${Math.round(e)} m` : ""].filter(Boolean).join(" · ");
      },
    };
  }

  function strengthJudge(log, mine) {
    const names = new Map([...mine.values()].map((e) => [norm(e.name), e]));
    const list = [...mine.values()];
    return {
      id: "force.exercice-variante",
      label: "Même exercice et même variante",
      criteria: [
        `Même sport : ${S().label(log.sport)}`,
        `Même exercice, même variante et même matériel : ${list.map((e) => `${String(e.name).trim()}${variantText(e) ? ` (${variantText(e)})` : ""}`).join(", ")}`,
        "Séries mesurées (charge et répétitions) : aucun 1RM estimé",
      ],
      limits: [],
      test(l) {
        const theirs = exercisesOf(l);
        const shared = list.filter((e) => theirs.has(e.key));
        if (shared.length) return { ok: true, shared };
        for (const t of theirs.values()) {
          const e = names.get(norm(t.name));
          if (!e) continue;
          const unknown = !variantText(e) || !variantText(t);
          return { reason: unknown ? "variant_unknown" : "variant_other", detail: `${String(t.name).trim()} · ${variantText(t) || "sans variante"}`, exercise: String(e.name).trim() };
        }
        if ((l.details?.exercises || []).some((ex) => ex?.name && names.has(norm(ex.name)))) return { reason: "sets_missing" };
        return { reason: "no_exercise" };
      },
      summary(l, f, kept) {
        const theirs = exercisesOf(l);
        return (kept?.shared || []).map((e) => theirs.get(e.key)).filter(Boolean)
          .map((t) => `${String(t.name).trim()}${variantText(t) ? ` (${variantText(t)})` : ""} ${t.loaded ? `${fr(t.topWeight)} kg × ${t.topReps}` : `${t.reps} rép.`}`).join(" · ");
      },
    };
  }

  function climbingJudge(log, mine) {
    const e = log.details?.extras || {};
    const system = String(e.grade_system || "").trim(), discipline = String(e.climbing_discipline || "").trim();
    return {
      id: "escalade.echelle-discipline",
      label: `Même échelle (${system})${discipline ? ` et même discipline (${discipline})` : ""}`,
      criteria: [`Même sport : ${S().label(log.sport)}`, `Échelle : ${system}, sans conversion vers une autre échelle`, discipline ? `Discipline : ${discipline}` : "Discipline : non renseignée sur cette séance, non vérifiée", "Meilleure réussite : une cotation seulement tentée n’est jamais comparée"],
      limits: discipline ? [] : ["La discipline de cette séance n’est pas renseignée : TITAN ne peut pas séparer le bloc de la voie dans la même échelle."],
      test(l) {
        const x = l.details?.extras || {};
        const theirs = String(x.grade_system || "").trim(), d = String(x.climbing_discipline || "").trim();
        if (!theirs) return { reason: "scale_unknown" };
        if (theirs !== system) return { reason: "scale_other", detail: theirs };
        if (discipline && d && norm(d) !== norm(discipline)) return { reason: "discipline_other", detail: d };
        const f = figureOf(l);
        if (!f || f.kind !== "grade") return { reason: "grade_missing", detail: x.max_attempted ? `tentée ${x.max_attempted}` : "" };
        if (Boolean(discipline) !== Boolean(d)) return { reason: "discipline_unknown", figure: f, detail: d || "" };
        return { ok: true, figure: f };
      },
      summary(l, f) {
        const d = String(l.details?.extras?.climbing_discipline || "").trim();
        return [f.display, d].filter(Boolean).join(" · ");
      },
    };
  }

  function durationJudge(log) {
    return {
      id: "pratique.duree",
      label: "Durée déclarée",
      criteria: [`Même sport : ${S().label(log.sport)}`, "Durée déclarée : une durée estimée n’est jamais comparée"],
      limits: [],
      test(l) {
        const f = figureOf(l);
        if (!f) return { reason: "no_duration", estimate: estimateOf(l) };
        if (f.kind !== "duration") return { reason: "kind" };
        return { ok: true, figure: f };
      },
      summary: (l, f) => formatValue({ unit: "min", current: f.value }),
    };
  }

  /** Why the session itself cannot be compared, or null. */
  function subjectLimit(log, form) {
    const e = log.details?.extras || {};
    if (form === "strength" || form === "bodyweight") {
      if (exercisesOf(log).size) return null;
      return "Aucun exercice de cette séance n’a de séries mesurées (charge et répétitions) : rien à comparer.";
    }
    if (form === "climbing") {
      const system = String(e.grade_system || "").trim();
      if (!system) return "L’échelle de cotation de cette séance n’est pas renseignée : TITAN ne compare pas des cotations sans leur échelle.";
      if (!SCALES.includes(system)) return `TITAN ne sait pas ordonner les cotations de l’échelle « ${system} » : aucune comparaison, et aucune conversion vers une autre échelle.`;
      if (!String(e.max_done || "").trim()) return `Aucune réussite cotée sur cette séance${e.max_attempted ? ` : « ${e.max_attempted} » est seulement tentée, elle n’est jamais comparée` : ""}.`;
      if (!figureOf(log)) return `La cotation « ${e.max_done} » n’est pas lisible dans l’échelle ${system}.`;
      return null;
    }
    if (figureOf(log)) return null;
    if (log.unit === "km" && (e.distance_unknown || !(num(log.val) > 0))) return "La distance de cette séance n’est pas mesurée : TITAN ne calcule pas d’allure à partir d’une distance inconnue.";
    const est = estimateOf(log);
    return `Sans durée saisie, TITAN ne compare rien${est ? ` : la durée de ${est} min est une estimation pour l’XP, jamais comparée` : ""}.`;
  }

  /**
   * The verifiable selection behind a comparison. Always answers for a session of a known sport:
   * { version, rule: { id, version, label, criteria, pilot }, status: "ok" | "limited" | "insufficient", sample, considered,
   *   retained: [{ log, id, ref, date, summary, figure }], excluded: [{ log, id, ref, date, reason, text }], counts, limits,
   *   estimates: [{ id, ref, date, minutes }], previous, reference, signature }
   * `previous` is the most recent retained session; `signature` is the rule and the retained references (the same on every client).
   */
  function comparables(log, logs) {
    if (!log || !S()) return null;
    const t = time(log);
    const own = eventKey(log);
    const form = S().formOf(log.sport);
    const pool = [];
    for (const l of logs || []) {
      if (!l || l === log || l.sport !== log.sport) continue;
      const lt = time(l);
      if (!Number.isFinite(lt) || !(lt < t) || (own && eventKey(l) === own)) continue;
      pool.push(l);
    }
    pool.sort((a, b) => time(b) - time(a) || (eventKey(a) < eventKey(b) ? -1 : eventKey(a) > eventKey(b) ? 1 : 0));
    const truncated = pool.length > SELECTION.maxConsidered;
    if (truncated) pool.length = SELECTION.maxConsidered;

    const mine = form === "strength" || form === "bodyweight" ? exercisesOf(log) : figureOf(log);
    const blocked = subjectLimit(log, form);
    const judge = blocked ? null
      : form === "strength" || form === "bodyweight" ? strengthJudge(log, mine)
      : mine.kind === "grade" ? climbingJudge(log, mine)
      : mine.kind === "duration" ? durationJudge(log)
      : distanceJudge(log, mine);
    const pilot = form === "strength" || form === "bodyweight" || form === "climbing" || (form === "distance" && S().paceMode?.(log.sport) === "pace");
    const rule = judge
      ? { id: judge.id, version: RULES_VERSION, label: judge.label, criteria: judge.criteria, pilot }
      : { id: `${form || "pratique"}.indisponible`, version: RULES_VERSION, label: "Aucune règle applicable à cette séance", criteria: [], pilot };
    const out = { version: RULES_VERSION, sport: log.sport, rule, status: "insufficient", sample: 0, considered: pool.length, truncated, retained: [], excluded: [], counts: {}, limits: [], estimates: [], previous: null, reference: null, signature: "" };
    if (blocked) out.limits.push(blocked);

    const kept = [], relaxed = [], set = [];
    const order = new Map(pool.map((l, i) => [l, i]));
    for (const l of pool) {
      const state = stateReason(l);
      const verdict = state ? { reason: state } : judge ? judge.test(l) : null;
      if (!verdict) continue;
      if (verdict.ok) kept.push({ l, v: verdict });
      else if (RELAXABLE.has(verdict.reason)) relaxed.push({ l, v: verdict });
      else set.push({ l, v: verdict });
      if (verdict.reason === "no_duration" && verdict.estimate) out.estimates.push({ id: l.id, ref: refOf(l), date: l.date, minutes: verdict.estimate });
    }
    let retained = kept;
    if (judge) {
      out.limits.push(...judge.limits);
      if (!kept.length && relaxed.length) {
        retained = relaxed;
        out.status = "limited";
        const what = relaxed[0].v.reason === "route_unknown" ? `à distance comparable sur « ${judge.route} »` : "dans la même discipline";
        out.limits.push(`Aucune séance précédente ${what} : TITAN compare avec ${plural(relaxed.length, "séance")} où ${relaxed[0].v.reason === "route_unknown" ? "le parcours n’est pas renseigné" : "la discipline n’est pas renseignée"}. Ce critère n’est donc pas vérifié.`);
      } else {
        set.push(...relaxed);
        set.sort((a, b) => order.get(a.l) - order.get(b.l)); // most recent first, as the pool
        if (kept.length) out.status = judge.limits.length ? "limited" : "ok";
      }
    }
    for (const { l, v } of set) out.counts[v.reason] = (out.counts[v.reason] || 0) + 1;
    const unchecked = judge?.unchecked?.(retained);
    if (unchecked) out.limits.push(unchecked);
    out.retained = retained.map(({ l, v }) => ({ log: l, id: l.id, ref: refOf(l), date: l.date, figure: v.figure || null, summary: judge.summary(l, v.figure, v) }));
    out.excluded = set.filter(({ v }) => !STATE_REASONS.has(v.reason) && !QUIET_REASONS.has(v.reason)).slice(0, SELECTION.listed)
      .map(({ l, v }) => ({ log: l, id: l.id, ref: refOf(l), date: l.date, reason: v.reason, text: `${REASONS[v.reason]}${v.detail ? ` (${v.detail})` : ""}` }));
    out.sample = out.retained.length;
    out.previous = out.retained[0]?.log || null;

    // A median (or the best grade) of the retained sessions says how many sessions support the result.
    const figures = out.retained.map((r) => r.figure).filter((f) => f && f.kind !== "duration");
    if (figures.length >= 2) {
      const grade = figures[0].kind === "grade";
      const value = grade ? Math.max(...figures.map((f) => f.value)) : median(figures.map((f) => f.value));
      out.reference = { kind: grade ? "best" : "median", value: round(value, 3), unit: figures[0].unit, display: grade ? figures.find((f) => f.value === value)?.display : formatValue({ unit: figures[0].unit, current: value }), sessions: figures.length };
    }

    const states = ["unsent", "held", "refused", "archived", "implausible"].filter((r) => out.counts[r]);
    if (states.length) out.limits.push(`Non prises en compte : ${states.map((r) => `${out.counts[r]} ${REASONS[r]}`).join(", ")}. Seules les séances confirmées dans ton compte servent de référence, les mêmes sur tous tes appareils.`);
    const routeUnknown = out.status !== "limited" ? out.counts.route_unknown || 0 : 0;
    if (routeUnknown) out.limits.push(`${plural(routeUnknown, "séance")} de distance voisine sans parcours renseigné ${routeUnknown > 1 ? "sont écartées" : "est écartée"} : le terrain n’est pas connu.`);
    const variantUnknown = set.filter(({ v }) => v.reason === "variant_unknown");
    if (variantUnknown.length) out.limits.push(`${plural(variantUnknown.length, "séance")} du même exercice sans variante commune ${variantUnknown.length > 1 ? "sont écartées" : "est écartée"} (${[...new Set(variantUnknown.map(({ v }) => v.exercise))].join(", ")}) : sans variante renseignée, TITAN ne peut pas savoir s’il s’agit du même mouvement.`);
    if (out.counts.scale_other) out.limits.push(`${plural(out.counts.scale_other, "séance")} dans une autre échelle ${out.counts.scale_other > 1 ? "sont écartées" : "est écartée"} : TITAN ne convertit pas les cotations.`);
    if (out.estimates.length) out.limits.push(`${plural(out.estimates.length, "séance")} sans durée saisie : TITAN estime leur durée pour l’XP, une estimation n’est jamais comparée.`);
    if (truncated) out.limits.push(`Seules les ${SELECTION.maxConsidered} dernières séances de ce sport sont examinées.`);
    if (!out.sample) {
      out.status = "insufficient";
      if (judge) {
        const why = Object.entries(out.counts).filter(([r]) => !STATE_REASONS.has(r)).map(([r, n]) => `${n} ${REASONS[r]}`).join(", ");
        out.limits.unshift(!pool.length ? `Première séance de ${S().label(log.sport).toLowerCase()} enregistrée avant celle-ci : rien à comparer pour l’instant.`
          : `Aucune séance précédente ne remplit la règle${why ? ` (${why})` : ""}.`);
      }
    }
    out.signature = `${rule.id}@${RULES_VERSION}:${retained.map(({ l }) => eventKey(l)).join(",")}`;
    return out;
  }

  /** The selection as plain data (no session objects): what the parity tests compare between the website and the Android app. */
  function snapshot(selection) {
    if (!selection) return null;
    const id = (x) => x.log ? eventKey(x.log) : x.id;
    return {
      version: selection.version, rule: { id: selection.rule.id, label: selection.rule.label, criteria: selection.rule.criteria, pilot: selection.rule.pilot },
      status: selection.status, sample: selection.sample, considered: selection.considered,
      retained: selection.retained.map((r) => ({ id: id(r), date: r.date, summary: r.summary })),
      excluded: selection.excluded.map((e) => ({ id: id(e), date: e.date, reason: e.reason, text: e.text })),
      counts: Object.fromEntries(Object.entries(selection.counts).sort(([a], [b]) => (a < b ? -1 : 1))),
      limits: selection.limits, estimates: selection.estimates.map((e) => ({ id: e.id, minutes: e.minutes })),
      reference: selection.reference, previous: selection.previous ? eventKey(selection.previous) : null, signature: selection.signature,
    };
  }

  /**
   * { previous, items: [{ id, label, unit, current, previous, delta, direction, significant }], basis, selection } or null.
   * basis explains what made the two sessions comparable; selection (comparables) shows the rule, the sample and the sources.
   */
  function compare(log, logs) {
    const selection = comparables(log, logs);
    if (!selection || !selection.previous) return null;
    const prev = selection.previous;
    const form = S().formOf(log.sport);

    if (form === "strength" || form === "bodyweight") {
      const mine = exercisesOf(log);
      const theirs = exercisesOf(prev);
      const shared = [...mine.values()].filter((e) => theirs.has(e.key));
      const items = [];
      for (const e of shared) {
        const p = theirs.get(e.key);
        if (e.loaded && p.loaded) {
          const top = verdict("higher", e.topWeight, p.topWeight, THRESHOLD.load);
          // Same load, more repetitions, is progress too: reported on the top set.
          const sameLoadMoreReps = e.topWeight === p.topWeight && e.topReps > p.topReps;
          items.push({ id: `top:${e.key}`, label: `${e.name} · meilleure série`, unit: "kg", current: e.topWeight, previous: p.topWeight, currentReps: e.topReps, previousReps: p.topReps, delta: round(e.topWeight - p.topWeight),
            ...(sameLoadMoreReps ? { direction: "better", significant: true } : top) });
          items.push({ id: `volume:${e.key}`, label: `${e.name} · volume`, unit: "kg", current: e.volume, previous: p.volume, delta: round(e.volume - p.volume), ...verdict("higher", e.volume, p.volume, THRESHOLD.volume) });
        } else {
          items.push({ id: `reps:${e.key}`, label: `${e.name} · répétitions`, unit: "rép.", current: e.reps, previous: p.reps, delta: e.reps - p.reps, ...verdict("higher", e.reps, p.reps, THRESHOLD.reps) });
        }
      }
      const named = shared.map((e) => `${String(e.name).trim()}${variantText(e) ? ` (${variantText(e)})` : ""}`).join(", ");
      return { previous: prev, items, basis: `Mêmes exercices (${named}) que ta séance du ${new Date(prev.date).toLocaleDateString("fr-FR")}.`, selection };
    }

    const mine = figureOf(log);
    const theirs = figureOf(prev);
    const items = [{
      id: mine.kind, label: mine.label, unit: mine.unit, current: round(mine.value, 3), previous: round(theirs.value, 3), delta: round(mine.value - theirs.value, 3),
      ...(mine.display ? { currentDisplay: mine.display, previousDisplay: theirs.display } : {}),
      ...verdict(mine.better, mine.value, theirs.value, THRESHOLD[mine.kind] ?? 0.05),
    }];
    if (mine.kind === "grade") items[0] = { ...items[0], ...(mine.value > theirs.value ? { direction: "better", significant: true } : mine.value < theirs.value ? { direction: "worse", significant: false } : { direction: "stable", significant: false }) };
    // Numeric measures both sessions recorded (aces, goals, elevation…): shown side by side, never judged better or worse.
    const a = log.details?.extras || {}, b = prev.details?.extras || {};
    const fields = (root.SPORTS_CONFIG?.[log.sport]?.extraFields || []).filter((f) => f?.type === "number");
    for (const f of fields.slice(0, 40)) {
      const x = num(a[f.id]), y = num(b[f.id]);
      if (x === null || y === null) continue;
      items.push({ id: `extra:${f.id}`, label: f.label || f.id, unit: f.unit || "", current: x, previous: y, delta: round(x - y), direction: "neutral", significant: false });
    }
    const elev = [num(log.details?.elevation), num(prev.details?.elevation)];
    if (elev[0] !== null && elev[1] !== null) items.push({ id: "elevation", label: "Dénivelé positif", unit: "m", current: elev[0], previous: elev[1], delta: elev[0] - elev[1], direction: "neutral", significant: false });
    const route = selection.status === "ok" && selection.rule.id === "distance.taille-parcours" ? String(log.details?.extras?.[ROUTE_FIELDS.find((f) => hasField(log.sport, f))] ?? "").trim() : "";
    const basis = mine.kind === "grade" ? `Même système et même discipline (${theirs.context.replace("|", " · ")}).`
      : mine.kind === "duration" ? `Dernière séance de ${S().label(log.sport).toLowerCase()} avec une durée déclarée.`
      : `Distance comparable (à 25 % près) : ${mine.kind === "swimPace" ? `${Math.round(theirs.size)} m` : `${fr(theirs.size)} km`}${route ? `, même parcours (${route})` : ""}.`;
    return { previous: prev, items, basis, selection };
  }

  /* ---------- 2. Evolution per discipline ---------- */
  /**
   * For each discipline with enough measured sessions in the window: the median figure of the first half and of the second half,
   * the change, and the sessions behind each value. Strength reports the most trained exercise's top set.
   */
  function disciplines(logs, { now = new Date(), weeks = 12, min = 2 } = {}) {
    const end = now instanceof Date ? now.getTime() : Number(now);
    const start = end - weeks * 7 * DAY, mid = start + (end - start) / 2;
    const bySport = new Map();
    for (const l of logs || []) {
      if (!usable(l) || time(l) < start || time(l) > end) continue;
      if (!bySport.has(l.sport)) bySport.set(l.sport, []);
      bySport.get(l.sport).push(l);
    }
    const out = [];
    for (const [sport, list] of bySport) {
      const form = S()?.formOf(sport);
      const minutes = list.map(declared).filter((m) => m > 0);
      const row = { sport, label: S()?.label(sport) || sport, family: S()?.familyOf(sport), sessions: list.length, minutes: round(minutes.reduce((n, m) => n + m, 0), 1), measuredSessions: minutes.length, trend: null };
      if (form === "strength" || form === "bodyweight") {
        const groups = new Map();
        for (const l of list) for (const e of exercisesOf(l).values()) {
          if (!groups.has(e.key)) groups.set(e.key, { name: e.name, loaded: e.loaded, points: [] });
          groups.get(e.key).points.push({ t: time(l), v: e.loaded ? e.topWeight : e.reps });
        }
        const best = [...groups.values()].sort((a, b) => b.points.length - a.points.length)[0];
        if (best) row.trend = trendOf(best.points, mid, min, best.loaded ? { label: `${best.name} · meilleure série`, unit: "kg", better: "higher", threshold: THRESHOLD.load } : { label: `${best.name} · répétitions`, unit: "rép.", better: "higher", threshold: THRESHOLD.reps });
      } else {
        const points = list.map((l) => ({ l, f: figureOf(l) })).filter((p) => p.f && p.f.kind !== "duration");
        if (points.length) {
          const kind = points[0].f.kind;
          const same = points.filter((p) => p.f.kind === kind && (kind !== "grade" || p.f.context === points[0].f.context));
          row.trend = trendOf(same.map((p) => ({ t: time(p.l), v: p.f.value, display: p.f.display })), mid, min, { label: points[0].f.label, unit: points[0].f.unit, better: points[0].f.better, threshold: THRESHOLD[kind] ?? 0.05, grade: kind === "grade" });
        }
      }
      out.push(row);
    }
    return out.sort((a, b) => b.sessions - a.sessions || b.minutes - a.minutes);
  }

  function trendOf(points, mid, min, meta) {
    const first = points.filter((p) => p.t < mid), second = points.filter((p) => p.t >= mid);
    if (first.length < min || second.length < min) return { ...meta, enough: false, sessions: points.length, needed: min * 2 };
    const pick = meta.grade ? (xs) => Math.max(...xs) : median;
    const a = pick(first.map((p) => p.v)), b = pick(second.map((p) => p.v));
    const v = meta.grade ? (b > a ? { direction: "better", significant: true } : b < a ? { direction: "worse", significant: false } : { direction: "stable", significant: false }) : verdict(meta.better, b, a, meta.threshold);
    const label = (val) => (meta.grade ? points.find((p) => p.v === val)?.display : undefined);
    return { ...meta, enough: true, before: round(a, 3), after: round(b, 3), beforeDisplay: label(a), afterDisplay: label(b), beforeSessions: first.length, afterSessions: second.length, ...v };
  }

  /* ---------- 3. Two periods across sports ---------- */
  /**
   * The last `days` days against the `days` before. Sports with different units are compared through what they share: sessions,
   * active days and declared minutes. Sessions without a declared duration are counted, and their TITAN estimate is reported apart.
   */
  function periods(logs, { now = new Date(), days = 28 } = {}) {
    const end = now instanceof Date ? now.getTime() : Number(now);
    const cur = { from: end - days * DAY, to: end }, prev = { from: end - 2 * days * DAY, to: end - days * DAY };
    const slice = (p) => {
      const s = { sessions: 0, activeDays: new Set(), minutes: 0, unmeasured: 0, estimatedMinutes: 0, bySport: new Map(), byFamily: new Map() };
      for (const l of logs || []) {
        const t = time(l);
        if (!usable(l) || t <= p.from || t > p.to) continue;
        s.sessions++;
        s.activeDays.add(T()?.dateKey ? T().dateKey(l.date) : new Date(t).toDateString());
        const m = declared(l);
        const fam = S()?.familyOf(l.sport) || "endurance";
        const sp = s.bySport.get(l.sport) || { sport: l.sport, label: S()?.label(l.sport) || l.sport, family: fam, sessions: 0, minutes: 0, distanceKm: 0 };
        const fm = s.byFamily.get(fam) || { family: fam, sessions: 0, minutes: 0 };
        sp.sessions++; fm.sessions++;
        if (m > 0) { s.minutes += m; sp.minutes += m; fm.minutes += m; }
        else {
          s.unmeasured++;
          const est = root.TitanProgress?.minutesOf?.(l);
          if (est?.estimated && est.minutes > 0) s.estimatedMinutes += est.minutes;
        }
        if (l.unit === "km" && num(l.val) > 0 && !l.details?.extras?.distance_unknown) sp.distanceKm += num(l.val);
        s.bySport.set(l.sport, sp); s.byFamily.set(fam, fm);
      }
      const total = s.minutes;
      return {
        sessions: s.sessions, activeDays: s.activeDays.size, minutes: round(s.minutes, 1), unmeasuredSessions: s.unmeasured, estimatedMinutes: round(s.estimatedMinutes, 0),
        sports: [...s.bySport.values()].map((x) => ({ ...x, minutes: round(x.minutes, 1), distanceKm: round(x.distanceKm, 2) })).sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions),
        families: [...s.byFamily.values()].map((x) => ({ ...x, minutes: round(x.minutes, 1), share: total > 0 ? round(x.minutes / total, 3) : null })).sort((a, b) => b.minutes - a.minutes),
      };
    };
    const current = slice(cur), previous = slice(prev);
    const firstSession = Math.min(...(logs || []).filter(usable).map(time));
    // The previous period is not « zero » when the journal did not exist yet: it is partial, and said so.
    const partialPrevious = !Number.isFinite(firstSession) || firstSession > prev.from;
    const sports = new Map();
    for (const x of current.sports) sports.set(x.sport, { sport: x.sport, label: x.label, family: x.family, current: x, previous: null });
    for (const x of previous.sports) sports.set(x.sport, { ...(sports.get(x.sport) || { sport: x.sport, label: x.label, family: x.family, current: null }), previous: x });
    return {
      days, current: { ...cur, ...current }, previous: { ...prev, ...previous, partial: partialPrevious },
      delta: partialPrevious ? null : { sessions: current.sessions - previous.sessions, activeDays: current.activeDays - previous.activeDays, minutes: round(current.minutes - previous.minutes, 1) },
      sports: [...sports.values()].sort((a, b) => (b.current?.minutes || 0) - (a.current?.minutes || 0) || (b.current?.sessions || 0) - (a.current?.sessions || 0)),
    };
  }

  /* ---------- Presentation helpers (plain text, shared wording) ---------- */
  function formatValue(item, which = "current") {
    const v = item[which];
    if (v === null || v === undefined) return "—";
    if (item[`${which}Display`]) return item[`${which}Display`];
    if (item.unit === "min/km" || item.unit === "min/100 m") {
      const total = Math.round(v * 60);
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} ${item.unit === "min/km" ? "/km" : "/100 m"}`;
    }
    const digits = item.unit === "km/h" ? 1 : Number.isInteger(v) ? 0 : 1;
    return `${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: digits })}${item.unit ? ` ${item.unit}` : ""}`;
  }
  const DIRECTION_TEXT = { better: "en progrès", worse: "en retrait", stable: "stable", neutral: "" };

  const api = { version: 2, RULES_VERSION, THRESHOLD, SELECTION, SCALES, REASONS, figureOf, comparables, snapshot, compare, disciplines, periods, formatValue, DIRECTION_TEXT };
  root.TitanProgression = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
