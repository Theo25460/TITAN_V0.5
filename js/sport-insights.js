(function (root) {
  "use strict";
  const num = (value) =>
    value !== null &&
    value !== undefined &&
    String(value).trim() !== "" &&
    Number.isFinite(Number(value))
      ? Number(value)
      : null;
  const active = (logs, now = Date.now()) =>
    (logs || []).filter(
      (l) =>
        !l.archived_at &&
        Number.isFinite(new Date(l.date).getTime()) &&
        new Date(l.date).getTime() <= now,
    );
  const day = (value) =>
    root.TitanTraining?.dateKey(value) ||
    new Date(value).toLocaleDateString("sv-SE");
  function sets(ex) {
    if (Array.isArray(ex.setRows) && ex.setRows.length)
      return ex.setRows
        .map((s) => ({
          weight: num(s.weight),
          reps: num(s.reps),
          rir: num(s.rir),
        }))
        .filter((s) => s.weight !== null && s.weight >= 0 && s.reps > 0);
    const count = num(ex.sets),
      reps = num(ex.reps),
      weight = num(ex.weight);
    if (!(
      count > 0 &&
      count <= 30 &&
      reps > 0 &&
      weight !== null &&
      weight >= 0
    ))
      return [];
    return Array.from({ length: Math.floor(count) }, () => ({
      weight,
      reps,
      rir: num(ex.rir),
    }));
  }
  function exerciseKey(ex) {
    return [ex.name, ex.variant || "", ex.equipment || ""]
      .map((v) =>
        String(v || "")
          .trim()
          .toLocaleLowerCase("fr-FR"),
      )
      .join("|");
  }
  function strength(logs) {
    const map = new Map();
    for (const l of active(logs))
      for (const ex of l.details?.exercises || []) {
        const rows = sets(ex);
        if (!rows.length || !ex.name) continue;
        const key = exerciseKey(ex),
          group = map.get(key) || {
            key,
            name: ex.name,
            variant: ex.variant || ex.equipment || "",
            sessions: [],
            volume: 0,
            reps: 0,
            sets: 0,
            maxWeight: null,
            maxReps: null,
          };
        const volume = rows.reduce((n, s) => n + s.weight * s.reps, 0),
          reps = rows.reduce((n, s) => n + s.reps, 0);
        const previous = group.sessions.find(
          (s) => s.log === l || (l.id && s.log.id === l.id),
        );
        if (previous) {
          previous.volume += volume;
          previous.reps += reps;
          previous.sets += rows.length;
        } else group.sessions.push({ log: l, volume, reps, sets: rows.length });
        group.volume += volume;
        group.reps += reps;
        group.sets += rows.length;
        for (const set of rows) {
          if (
            set.weight > 0 &&
            (!group.maxWeight || set.weight > group.maxWeight.value)
          )
            group.maxWeight = { value: set.weight, reps: set.reps, log: l };
          if (!group.maxReps || set.reps > group.maxReps.value)
            group.maxReps = { value: set.reps, weight: set.weight, log: l };
        }
        map.set(key, group);
      }
    return [...map.values()].sort(
      (a, b) =>
        b.sessions.length - a.sessions.length || a.name.localeCompare(b.name),
    );
  }
  function grade(value, system) {
    const text = String(value || "").trim();
    let match;
    if (system === "V-scale bloc") {
      match = /^V(B|\d{1,2})$/i.exec(text);
      return match
        ? {
            score: match[1].toUpperCase() === "B" ? -1 : Number(match[1]),
            label: text.toUpperCase(),
          }
        : null;
    }
    if (!["Français voie", "Fontainebleau bloc"].includes(system)) return null;
    match = /^([1-9])([abc])?(\+)?$/i.exec(text);
    if (!match) return null;
    if (Number(match[1]) >= 6 && !match[2]) return null;
    return {
      score:
        Number(match[1]) * 10 +
        (match[2] ? { a: 0, b: 3, c: 6 }[match[2].toLowerCase()] : 0) +
        (match[3] ? 1 : 0),
      label:
        system === "Fontainebleau bloc"
          ? text.toUpperCase()
          : text.toLowerCase(),
    };
  }
  function climbing(logs) {
    const map = new Map();
    for (const l of active(logs)) {
      const e = l.details?.extras || {},
        system = e.grade_system,
        done = grade(e.max_done, system);
      if (!system) continue;
      const key = [
        system,
        e.climbing_discipline || "",
        e.belay || "",
        e.location || "",
      ].join("|");
      const group = map.get(key) || {
        key,
        system,
        discipline: e.climbing_discipline || "",
        belay: e.belay || "",
        location: e.location || "",
        sessions: [],
        attempts: 0,
        successes: 0,
        attemptsMeasured: 0,
        successesMeasured: 0,
        best: null,
      };
      group.sessions.push(l);
      const attempts = num(e.attempts),
        successes = num(e.successful_routes);
      if (attempts !== null && attempts >= 0) {
        group.attempts += attempts;
        group.attemptsMeasured++;
      }
      if (successes !== null && successes >= 0) {
        group.successes += successes;
        group.successesMeasured++;
      }
      if (done && (!group.best || done.score > group.best.score))
        group.best = { ...done, log: l };
      map.set(key, group);
    }
    return [...map.values()];
  }
  function records(logs, sport = "all") {
    const list = active(logs).filter(
        (l) => sport === "all" || l.sport === sport,
      ),
      bySport = new Map(),
      out = [];
    for (const l of list) {
      if (!bySport.has(l.sport)) bySport.set(l.sport, []);
      bySport.get(l.sport).push(l);
    }
    for (const [key, entries] of bySport) {
      const distance = entries.filter((l) => l.unit === "km" && num(l.val) > 0);
      if (distance.length) {
        const longest = distance.reduce((a, b) =>
          Number(a.val) >= Number(b.val) ? a : b,
        );
        out.push({
          id: `distance:${key}`,
          kind: "distance",
          sport: key,
          label: "Plus longue distance",
          value: Number(longest.val),
          unit: "km",
          log: longest,
          context:
            "Distance totale de la séance, selon la saisie ou le fichier importé.",
        });
        for (const km of [1, 5, 10, 21.1, 42.2]) {
          const candidates = distance.filter(
            (l) =>
              Math.abs(Number(l.val) - km) <= km * 0.01 &&
              root.TitanTraining?.duration(l) > 0,
          );
          if (!candidates.length) continue;
          const best = candidates.reduce((a, b) =>
            root.TitanTraining.duration(a) <= root.TitanTraining.duration(b)
              ? a
              : b,
          );
          out.push({
            id: `time:${key}:${km}`,
            kind: "time",
            sport: key,
            label: `Durée sur ${km.toLocaleString("fr-FR")} km`,
            value: root.TitanTraining.duration(best),
            unit: "min",
            log: best,
            context: `Séances dont la distance totale est à ±1 % de ${km.toLocaleString("fr-FR")} km. Ce n’est pas un temps de segment GPS.`,
          });
        }
      }
      const timed = entries.filter((l) => root.TitanTraining?.duration(l) > 0);
      if (timed.length) {
        const longest = timed.reduce((a, b) =>
          root.TitanTraining.duration(a) >= root.TitanTraining.duration(b)
            ? a
            : b,
        );
        out.push({
          id: `duration:${key}`,
          kind: "duration",
          sport: key,
          label: "Plus longue durée enregistrée",
          value: root.TitanTraining.duration(longest),
          unit: "min",
          log: longest,
          context: "Un repère historique, pas une recommandation de durée.",
        });
      }
    }
    for (const ex of strength(list)) {
      if (ex.maxWeight)
        out.push({
          id: `weight:${ex.key}`,
          kind: "strength",
          sport: ex.maxWeight.log.sport,
          label: ex.name,
          value: ex.maxWeight.value,
          unit: "kg",
          log: ex.maxWeight.log,
          context: `Charge la plus élevée déclarée, réalisée sur ${ex.maxWeight.reps} répétitions.${ex.variant ? " Variante : " + ex.variant + "." : ""} Ce n’est pas un 1RM estimé.`,
        });
      else if (ex.maxReps)
        out.push({
          id: `reps:${ex.key}`,
          kind: "strength",
          sport: ex.maxReps.log.sport,
          label: ex.name,
          value: ex.maxReps.value,
          unit: "rép.",
          log: ex.maxReps.log,
          context:
            "Plus grand nombre de répétitions sur une série au poids du corps.",
        });
    }
    for (const c of climbing(list))
      if (c.best)
        out.push({
          id: `grade:${c.key}`,
          kind: "climbing",
          sport: c.best.log.sport,
          label: "Cotation réussie",
          value: c.best.label,
          unit: "",
          log: c.best.log,
          context:
            [c.system, c.discipline, c.belay, c.location]
              .filter(Boolean)
              .join(" · ") + ". Les systèmes de cotation restent séparés.",
        });
    return out;
  }
  function goalProgress(goal, logs, now = new Date()) {
    const from = new Date(`${goal.start_date}T00:00:00`),
      to = new Date(`${goal.end_date}T23:59:59.999`);
    const sources = active(logs, now.getTime()).filter(
      (l) =>
        new Date(l.date) >= from &&
        new Date(l.date) <= to &&
        (!goal.sport || goal.sport === "all" || l.sport === goal.sport),
    );
    let value = 0,
      measured = 0;
    if (goal.metric === "sessions") {
      value = sources.length;
      measured = sources.length;
    } else if (goal.metric === "days") {
      value = new Set(sources.map((l) => day(l.date))).size;
      measured = sources.length;
    } else if (goal.metric === "minutes") {
      const values = sources
        .map(root.TitanTraining.duration)
        .filter((n) => n !== null);
      value = values.reduce((a, b) => a + b, 0);
      measured = values.length;
    } else if (goal.metric === "distance") {
      const values = sources.filter((l) => l.unit === "km" && num(l.val) > 0);
      value = values.reduce((a, b) => a + Number(b.val), 0);
      measured = values.length;
    }
    const target = num(goal.target) || 1;
    const contributors =
      goal.metric === "minutes"
        ? sources.filter((l) => root.TitanTraining.duration(l) !== null)
        : goal.metric === "distance"
          ? sources.filter((l) => l.unit === "km" && num(l.val) > 0)
          : sources;
    return {
      value,
      measured,
      sources,
      contributors,
      ratio: Math.min(1, value / target),
      complete: value >= target,
      ended: now > to,
      upcoming: now < from,
    };
  }
  function exerciseTrend(ex) {
    const loaded = ex?.volume > 0;
    return {
      unit: loaded ? "kg de volume" : "répétitions",
      points: (ex?.sessions || [])
        .slice()
        .sort((a, b) => new Date(a.log.date) - new Date(b.log.date))
        .slice(-20)
        .map((s) => ({ ...s, value: loaded ? s.volume : s.reps })),
    };
  }
  root.TitanInsights = {
    num,
    active,
    sets,
    exerciseKey,
    strength,
    grade,
    climbing,
    records,
    goalProgress,
    exerciseTrend,
  };
})(typeof window === "undefined" ? globalThis : window);
