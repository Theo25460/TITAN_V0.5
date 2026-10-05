/* TITAN 300 — Séance: record an effort in under a minute, with the measures that matter for each sport.
   Persistence goes through window.logActivity (durable IndexedDB queue + server receipts). */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const S_ = () => window.TitanSports;
  const F = () => window.TitanFormat;
  const E = () => window.TitanEffort;
  const P = () => window.TitanProgress;
  const DAY = 86400000;

  const COMMON_EXERCISES = ["Développé couché", "Squat", "Soulevé de terre", "Développé militaire", "Rowing barre", "Tractions", "Dips", "Fentes", "Presse à cuisses", "Hip thrust", "Tirage vertical", "Tirage horizontal", "Curl biceps", "Extension triceps", "Élévations latérales", "Leg curl", "Leg extension", "Mollets", "Pompes", "Gainage"];
  const COMMON_MOVES = ["Pompes", "Tractions", "Dips", "Squats", "Fentes", "Gainage (planche)", "Planche latérale", "Burpees", "Relevés de jambes", "Muscle-up", "Pistol squat", "L-sit", "Front lever", "Handstand"];
  const RPE_TEXT = { 1: "Très facile", 2: "Très facile", 3: "Facile", 4: "Facile", 5: "Modéré", 6: "Modéré", 7: "Difficile", 8: "Difficile", 9: "Très difficile", 10: "Maximal" };
  const GRADE_SYSTEMS = { Bloc: ["Fontainebleau bloc", "V-scale bloc"], Voie: ["Français voie"] };

  let S = null;
  let root = null;
  let timerTick = null;
  let saveTimer = null;

  const owner = () => window.state?.user?.id || "unassigned";
  const draftKey = () => `titan_seance_draft_v3:${owner()}`;
  const timerKey = () => `titan_seance_timer_v3:${owner()}`;

  function fresh(sport = null) {
    const now = new Date();
    return {
      step: sport ? "form" : "pick",
      sport,
      query: "",
      when: "now",
      date: F().dateKey(now),
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      distance: "",
      meters: "",
      value: "",
      durH: "",
      durM: "",
      durS: "",
      elevation: "",
      pool: "25",
      exercises: [],
      climbing: { discipline: "Bloc", location: "Salle", system: "Fontainebleau bloc", belay: "", attempts: "", successes: "", best: "" },
      extras: {},
      rpe: null,
      note: "",
      gpx: null,
      keepTrace: false,
      updatedAt: Date.now(),
    };
  }

  /* ---------- Persistence of the draft and the timer ---------- */
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        if (S && S.step === "form") localStorage.setItem(draftKey(), JSON.stringify({ ...S, gpxPath: undefined, updatedAt: Date.now() }));
      } catch {
        status("Brouillon non sauvegardé : le stockage de l’appareil est plein.", "warn");
      }
    }, 250);
  }
  function readDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey()) || "null");
      return d && d.sport && Date.now() - (d.updatedAt || 0) < 2 * DAY ? d : null;
    } catch {
      return null;
    }
  }
  function clearDraft() {
    try {
      localStorage.removeItem(draftKey());
    } catch {}
  }
  function timer() {
    try {
      return JSON.parse(localStorage.getItem(timerKey()) || "null") || { elapsed: 0, started: null };
    } catch {
      return { elapsed: 0, started: null };
    }
  }
  function setTimer(t) {
    try {
      localStorage.setItem(timerKey(), JSON.stringify(t));
    } catch {}
  }
  const elapsedMs = (t) => t.elapsed + (t.started ? Math.max(0, Date.now() - t.started) : 0);

  /* ---------- Helpers ---------- */
  const num = (v) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const duration = () => {
    const h = num(S.durH) || 0, m = num(S.durM) || 0, s = num(S.durS) || 0;
    const total = h * 60 + m + s / 60;
    return total > 0 ? Math.round(total * 100) / 100 : null;
  };
  function performedAt() {
    if (S.when === "now") return new Date();
    if (S.when === "yesterday") {
      const d = new Date(Date.now() - DAY);
      const [hh, mm] = S.time.split(":").map(Number);
      d.setHours(hh || 18, mm || 0, 0, 0);
      return d;
    }
    const d = new Date(`${S.date}T${S.time || "12:00"}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function setPath(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) o = o[/^\d+$/.test(keys[i]) ? Number(keys[i]) : keys[i]];
    o[keys[keys.length - 1]] = value;
  }
  function status(message, kind = "info") {
    const el = document.getElementById("seance-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
  }

  function recentSports() {
    const list = P().activeLogs(window.state?.history || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const seen = new Map();
    for (const l of list) if (!seen.has(l.sport) && window.SPORTS_CONFIG?.[l.sport]) seen.set(l.sport, l);
    return [...seen.values()];
  }

  /* ---------- Building the payload ---------- */
  function exercisesPayload() {
    return S.exercises
      .filter((e) => String(e.name || "").trim())
      .map((e) => {
        const kind = e.kind || "weighted";
        const rows = e.sets
          .map((s) => ({ weight: num(s.weight) || 0, reps: num(s.reps), rir: num(s.rir), seconds: num(s.seconds) }))
          .filter((s) => (kind === "hold" ? s.seconds > 0 : s.reps > 0));
        return { name: e.name.trim(), variant: (e.variant || "").trim(), kind, setRows: rows.map((r) => (kind === "hold" ? { weight: r.weight, seconds: r.seconds, rir: null } : { weight: r.weight, reps: r.reps, rir: r.rir })) };
      })
      .filter((e) => e.setRows.length);
  }

  /** Returns { data, errors, unit, val } ready for logActivity and for the XP preview. */
  function build() {
    const sport = S.sport;
    const form = S_().formOf(sport);
    const errors = [];
    const fields = [];
    const fail = (message, field) => {
      errors.push(message);
      fields.push(field || null);
    };
    const dur = duration();
    const at = performedAt();
    const data = { note: S.note.trim(), tags: [], extras: {}, bio: S.rpe ? { rpe: S.rpe } : {} };
    if (!at) fail("Choisis une date valide.", "date");
    else if (at.getTime() > Date.now() + 60000) fail("La date ne peut pas être dans le futur.", S.when === "other" ? "date" : "time");
    else data.performedAt = at.toISOString();
    if (dur !== null) {
      if (dur > 1440) fail("Une séance dure au maximum 24 h.", "durH");
      data.val2 = Math.round(dur * 100) / 100;
      data.duration = data.val2;
    }
    let unit = S_().unitOf(sport);
    if (form === "distance") {
      const km = num(S.distance);
      if (!(km > 0)) fail("Indique la distance.", "distance");
      else if (km > 300) fail("La distance d’une séance est limitée à 300 km.", "distance");
      data.val1 = km;
      const elev = num(S.elevation);
      if (elev !== null) data.elevation = Math.min(12000, Math.max(0, elev));
      if (S.gpx) {
        data.hasGpx = true;
        data.gpxStats = { movingMinutes: S.gpx.movingMinutes || 0, elapsedMinutes: S.gpx.elapsedMinutes || 0, ascent: S.gpx.ascent || 0, descent: S.gpx.descent || 0, points: S.gpx.points || 0 };
      }
    } else if (form === "swim") {
      const m = num(S.meters);
      if (!(m > 0)) fail("Indique la distance nagée.", "meters");
      data.val1 = m;
      data.extras.pool = S.pool;
    } else if (form === "strength") {
      data.exercises = exercisesPayload();
      if (!data.exercises.length && dur === null) fail("Ajoute au moins une série complète (exercice et répétitions), ou une durée.", "exercises.0.name");
      if (!data.exercises.length && dur !== null) {
        data.unitOverride = "min";
        data.val1 = dur;
      }
    } else if (form === "bodyweight") {
      data.exercises = exercisesPayload();
      const reps = data.exercises.filter((e) => e.kind !== "hold").reduce((n, e) => n + e.setRows.reduce((a, r) => a + (r.reps || 0), 0), 0);
      if (reps > 0) {
        data.val1 = reps;
        data.unitOverride = "reps";
      } else if (dur !== null) {
        data.val1 = dur;
        data.unitOverride = "min";
      } else fail("Ajoute des répétitions, des maintiens avec une durée, ou une durée.", "exercises.0.name");
    } else if (form === "climbing") {
      const c = S.climbing;
      if (dur === null) fail("Indique la durée de la séance.", "durM");
      data.unitOverride = "min";
      data.val1 = dur;
      data.extras = { climbing_discipline: c.discipline, location: c.location, grade_system: c.system };
      if (c.discipline === "Voie" && c.belay) data.extras.belay = c.belay;
      if (num(c.attempts) !== null) data.extras.attempts = Math.round(num(c.attempts));
      if (num(c.successes) !== null) data.extras.successful_routes = Math.round(num(c.successes));
      if (num(c.successes) !== null && num(c.attempts) !== null && num(c.successes) > num(c.attempts)) fail("Les réussites ne peuvent pas dépasser les essais.", "climbing.successes");
      if (c.best) {
        const g = window.TitanInsights?.grade(c.best, c.system);
        if (!g) fail(`Cotation « ${c.best} » non reconnue pour ${c.system}.`, "climbing.best");
        else data.extras.max_done = c.best;
      }
    } else {
      if (!["min", "h"].includes(unit)) {
        const v = num(S.value);
        if (!(v > 0) && dur === null) fail("Indique une valeur ou une durée.", "value");
        if (v > 0) data.val1 = v;
        else {
          data.unitOverride = "min";
          data.val1 = dur;
        }
      } else {
        if (dur === null) fail("Indique la durée de la séance.", "durM");
        data.val1 = dur;
        if (unit === "h" && dur) data.unitOverride = "min";
      }
      for (const [k, v] of Object.entries(S.extras)) if (v !== "" && v !== null && v !== undefined) data.extras[k] = v;
    }
    unit = data.unitOverride || unit;
    let val = Number(data.val1) || 0;
    if (!val && data.exercises?.length) {
      const vol = data.exercises.reduce((n, e) => n + e.setRows.reduce((a, r) => a + (r.weight || 0) * (r.reps || 0), 0), 0);
      val = vol > 0 ? vol : data.exercises.reduce((n, e) => n + e.setRows.length, 0);
      if (!(vol > 0)) unit = "reps";
    }
    return { data, errors, fields, unit, val, at };
  }

  /* ---------- Rendering ---------- */
  function familyChip(sport) {
    const fam = S_().familyOf(sport);
    return `<span class="asc-chip">${icon(S_().FAMILY_ICON[fam])}${esc(S_().FAMILY_LABEL[fam])}</span>`;
  }

  function pickHtml() {
    const recents = recentSports();
    const last3 = recents.slice(0, 3);
    const favorites = (window.state?.user?.favoriteSports || []).filter((id) => window.SPORTS_CONFIG?.[id]);
    const mine = [...new Set([...recents.map((l) => l.sport), ...favorites])].slice(0, 8);
    const routines = (window.state?.user?.gymRoutines || []).slice(0, 6);
    const fams = Object.keys(S_().FAMILY_LABEL);
    const byFam = Object.fromEntries(fams.map((f) => [f, []]));
    for (const id of S_().POPULAR) if (window.SPORTS_CONFIG?.[id]) byFam[S_().familyOf(id)].push(id);
    for (const s of S_().all().sort((a, b) => (window.SPORTS_CONFIG[a.id]?.sortOrder ?? 999) - (window.SPORTS_CONFIG[b.id]?.sortOrder ?? 999)))
      if (byFam[s.family] && byFam[s.family].length < 8 && !byFam[s.family].includes(s.id)) byFam[s.family].push(s.id);
    return `
      <header class="asc-page-head"><div><p class="asc-eyebrow cy">Nouvelle séance</p><h1>Qu’as-tu fait ?</h1></div></header>
      <nav class="asc-subnav" data-subnav></nav>
      <div class="seance-search">
        <label class="sr-only" for="sport-q">Rechercher un sport</label>
        <span class="seance-search-icon">${icon("search")}</span>
        <input id="sport-q" class="asc-input" type="search" autocomplete="off" placeholder="Course, musculation, escalade, padel…" value="${esc(S.query)}" aria-controls="sport-results">
      </div>
      <div id="sport-results" class="seance-results" role="listbox" aria-label="Sports"></div>
      ${mine.length ? `<section class="asc-section"><div class="asc-section-head"><h2>Tes sports</h2></div><div class="seance-chips">${mine.map((id) => `<button type="button" class="seance-chip" data-sport="${esc(id)}">${icon(S_().FAMILY_ICON[S_().familyOf(id)])}${esc(S_().label(id))}</button>`).join("")}</div></section>` : ""}
      ${last3.length ? `<section class="asc-section"><div class="asc-section-head"><h2>Refaire</h2><span class="asc-small asc-faint">Reprend les mesures, à la date d’aujourd’hui</span></div><div class="asc-list">${last3.map((l) => {
        const m = P().minutesOf(l);
        const main = l.unit === "km" ? F().distance(l.val) : l.unit === "m" ? `${F().number(l.val)} m` : l.details?.exercises?.length ? `${l.details.exercises.length} exercice${l.details.exercises.length > 1 ? "s" : ""}` : F().duration(m.minutes);
        return `<button type="button" class="asc-row" data-repeat="${esc(l.client_event_id || l.id)}"><span class="asc-row-icon">${icon("copy")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(S_().label(l.sport))}</span><span class="asc-row-sub">${esc(F().relativeDay(l.date))} · ${esc(main)}${m.minutes && l.unit === "km" ? " · " + esc(F().duration(m.minutes)) : ""}</span></span>${icon("chevron")}</button>`;
      }).join("")}</div></section>` : ""}
      ${routines.length ? `<section class="asc-section"><div class="asc-section-head"><h2>Tes routines</h2></div><div class="asc-list">${routines.map((r) => `<button type="button" class="asc-row" data-routine="${esc(r.id)}"><span class="asc-row-icon">${icon("layers")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(r.label)}</span><span class="asc-row-sub">${r.exercises.length} exercice${r.exercises.length > 1 ? "s" : ""}</span></span>${icon("chevron")}</button>`).join("")}</div></section>` : ""}
      <section class="asc-section"><div class="asc-section-head"><h2>Par famille</h2></div>
        <div class="seance-families">${fams.map((f) => `<div class="seance-family"><p class="asc-eyebrow">${icon(S_().FAMILY_ICON[f])} ${esc(S_().FAMILY_LABEL[f])}</p><div class="seance-chips">${byFam[f].map((id) => `<button type="button" class="seance-chip" data-sport="${esc(id)}">${esc(S_().label(id))}</button>`).join("")}</div></div>`).join("")}</div>
      </section>`;
  }

  function resultsHtml() {
    const list = S.query ? S_().search(S.query, { limit: 10 }) : [];
    if (!S.query) return "";
    if (!list.length) return `<p class="asc-empty asc-small">Aucun sport ne correspond. Essaie un mot plus court ou une famille : endurance, force, raquette, combat.</p>`;
    return `<div class="asc-list">${list
      .map((r, i) => `<button type="button" class="asc-row" role="option" id="opt-${i}" data-sport="${esc(r.id)}"><span class="asc-row-icon">${icon(S_().FAMILY_ICON[r.family])}</span><span class="asc-row-main"><span class="asc-row-title">${esc(r.label)}</span><span class="asc-row-sub">${esc(S_().FAMILY_LABEL[r.family])} · ${esc(S_().FORMS[r.form].label.toLowerCase())}</span></span>${icon("chevron")}</button>`)
      .join("")}</div>`;
  }

  function whenHtml() {
    const at = performedAt();
    const old = at && E().isHistorical(at.getTime());
    return `<section class="seance-block" aria-labelledby="w-title"><h2 id="w-title" class="seance-label">Quand</h2>
      <div class="asc-seg seance-when" role="group" aria-label="Moment de la séance">
        ${[["now", "Maintenant"], ["yesterday", "Hier"], ["other", "Autre jour"]].map(([k, l]) => `<button type="button" data-when="${k}" aria-pressed="${S.when === k}">${l}</button>`).join("")}
      </div>
      ${S.when !== "now" ? `<div class="asc-form-grid seance-when-fields">${S.when === "other" ? `<label class="asc-field"><span>Date</span><input class="asc-input" type="date" data-k="date" value="${esc(S.date)}" max="${F().dateKey(new Date())}"></label>` : ""}<label class="asc-field"><span>Heure</span><input class="asc-input" type="time" data-k="time" value="${esc(S.time)}"></label></div>` : ""}
      ${old ? `<p class="asc-note warn">${icon("info")}<span>${window.TitanData?.rulesV300?.() ? "Cette séance date de plus de 30 jours : elle rejoindra ton historique, tes statistiques et tes records, sans XP ni progression d’aventure." : "Cette séance date de plus de 30 jours : elle reste sur cet appareil, sans XP. Le serveur acceptera ces séances avec sa prochaine mise à jour ; elle partira alors d’elle-même."}</span></p>` : ""}
    </section>`;
  }

  function durationHtml(label = "Durée", optional = false, seconds = false) {
    return `<div class="asc-field"><span>${label}${optional ? ' <small class="asc-faint">facultatif</small>' : ""}</span>
      <div class="seance-duration${seconds ? " has-seconds" : ""}"><label><input class="asc-input" inputmode="numeric" type="number" min="0" max="24" step="1" data-k="durH" value="${esc(S.durH)}" placeholder="0" aria-label="Heures"><span>h</span></label>
      <label><input class="asc-input" inputmode="numeric" type="number" min="0" max="59" step="1" data-k="durM" value="${esc(S.durM)}" placeholder="00" aria-label="Minutes"><span>min</span></label>
      ${seconds ? `<label><input class="asc-input" inputmode="numeric" type="number" min="0" max="59" step="1" data-k="durS" value="${esc(S.durS)}" placeholder="00" aria-label="Secondes"><span>s</span></label>` : ""}
      <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm seance-chrono-apply" data-chrono-apply hidden>${icon("timer")} Reporter le chrono</button></div></div>`;
  }

  function setsEditor(kind) {
    const moves = kind === "bodyweight";
    const list = S.exercises;
    return `<section class="seance-block"><div class="asc-between"><h2 class="seance-label">${moves ? "Mouvements" : "Exercices"}</h2>
        ${!moves ? `<div class="asc-row-flex">${(window.state?.user?.gymRoutines || []).length ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-act="load-routine">${icon("layers")} Routine</button>` : ""}${list.length ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-act="save-routine">${icon("download")} Mémoriser</button>` : ""}</div>` : ""}</div>
      <datalist id="ex-names">${[...new Set([...(moves ? COMMON_MOVES : COMMON_EXERCISES), ...historyExercises()])].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <div class="seance-exercises">${list
        .map((e, i) => {
          const hold = e.kind === "hold";
          const volume = e.sets.reduce((n, s) => n + (num(s.weight) || 0) * (num(s.reps) || 0), 0);
          return `<article class="seance-ex" aria-label="${esc(e.name || "Exercice")}">
            <div class="seance-ex-head">
              <input class="asc-input seance-ex-name" list="ex-names" data-k="exercises.${i}.name" value="${esc(e.name)}" placeholder="${moves ? "Mouvement" : "Exercice"}" aria-label="Nom">
              <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-act="del-ex" data-i="${i}" aria-label="Retirer l’exercice">${icon("trash")}</button>
            </div>
            <div class="seance-ex-meta">
              <input class="asc-input" data-k="exercises.${i}.variant" value="${esc(e.variant || "")}" placeholder="${moves ? "Variante (strict, assisté, lesté…)" : "Variante (barre, haltères, machine…)"}" aria-label="Variante">
              ${moves ? `<div class="asc-seg" role="group" aria-label="Type"><button type="button" data-act="kind" data-i="${i}" data-kind="bodyweight" aria-pressed="${!hold}">Répétitions</button><button type="button" data-act="kind" data-i="${i}" data-kind="hold" aria-pressed="${hold}">Maintien</button></div>` : ""}
            </div>
            <div class="seance-sets" role="table" aria-label="Séries">
              <div class="seance-set seance-set-head" role="row"><span role="columnheader">#</span><span role="columnheader">${moves ? "Lest kg" : "kg"}</span><span role="columnheader">${hold ? "secondes" : "rép."}</span>${hold ? "<span></span>" : '<span role="columnheader">RIR</span>'}<span></span></div>
              ${e.sets
                .map(
                  (s, j) => `<div class="seance-set" role="row"><span class="asc-faint" role="cell">${j + 1}</span>
                <input class="asc-input" role="cell" inputmode="decimal" type="number" min="0" max="1000" step="0.5" data-k="exercises.${i}.sets.${j}.weight" value="${esc(s.weight ?? "")}" placeholder="${moves ? "0" : "kg"}" aria-label="Charge série ${j + 1}">
                <input class="asc-input" role="cell" inputmode="numeric" type="number" min="1" max="${hold ? 3600 : 500}" step="1" data-k="exercises.${i}.sets.${j}.${hold ? "seconds" : "reps"}" value="${esc((hold ? s.seconds : s.reps) ?? "")}" placeholder="${hold ? "s" : "rép."}" aria-label="${hold ? "Secondes" : "Répétitions"} série ${j + 1}">
                ${hold ? "<span></span>" : `<input class="asc-input" role="cell" inputmode="numeric" type="number" min="0" max="10" step="1" data-k="exercises.${i}.sets.${j}.rir" value="${esc(s.rir ?? "")}" placeholder="—" aria-label="Répétitions en réserve série ${j + 1}">`}
                <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-act="del-set" data-i="${i}" data-j="${j}" aria-label="Retirer la série ${j + 1}">${icon("minus")}</button></div>`,
                )
                .join("")}
            </div>
            <div class="asc-between"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-act="add-set" data-i="${i}">${icon("plus")} Série</button><span class="asc-small asc-faint" data-volume="${i}">${!moves && volume ? `Volume ${F().weight(volume)}` : ""}</span></div>
          </article>`;
        })
        .join("")}</div>
      <button type="button" class="asc-btn asc-btn-secondary asc-btn-block" data-act="add-ex">${icon("plus")} ${moves ? "Ajouter un mouvement" : "Ajouter un exercice"}</button>
      ${!moves ? '<p class="asc-small asc-faint">RIR : répétitions que tu aurais encore pu faire. Facultatif ; laissé vide, il reste vide.</p>' : ""}
    </section>
    <section class="seance-block">${durationHtml("Durée totale", true)}</section>`;
  }

  function historyExercises() {
    const names = new Map();
    for (const l of window.state?.history || []) for (const e of l.details?.exercises || []) if (e.name) names.set(e.name, (names.get(e.name) || 0) + 1);
    return [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([n]) => n);
  }

  function measuresHtml() {
    const form = S_().formOf(S.sport);
    if (form === "distance") {
      const mode = S_().paceMode(S.sport);
      return `<section class="seance-block"><div class="seance-big">
          <label class="asc-field"><span>Distance</span><div class="seance-unit"><input class="asc-input seance-input-big" inputmode="decimal" type="number" min="0" max="300" step="0.01" data-k="distance" value="${esc(S.distance)}" placeholder="0,0"><span>km</span></div></label>
          ${durationHtml("Durée", false, true)}
        </div>
        <p class="seance-derived asc-small" id="derived" aria-live="polite"></p>
        ${S_().hasElevation(S.sport) ? `<label class="asc-field seance-elev"><span>Dénivelé positif <small class="asc-faint">facultatif</small></span><div class="seance-unit"><input class="asc-input" inputmode="numeric" type="number" min="0" max="12000" step="1" data-k="elevation" value="${esc(S.elevation)}" placeholder="0"><span>m</span></div></label>` : ""}
        <div class="seance-gpx"><label class="asc-btn asc-btn-secondary asc-btn-sm">${icon("upload")} Importer un GPX<input type="file" accept=".gpx,application/gpx+xml" data-gpx hidden></label>
          ${S.gpx ? `<span class="asc-small asc-muted">Trace importée : ${esc(F().distance(S.gpx.distanceKm))}${S.gpx.movingMinutes ? `, ${esc(F().duration(S.gpx.movingMinutes))} en mouvement` : ""}${S.gpx.ascent ? `, +${S.gpx.ascent} m` : ""}. Le tracé GPS n’est pas conservé.</span>` : `<span class="asc-small asc-faint">Distance, temps en mouvement et dénivelé sont remplis depuis ta montre ou ton application.</span>`}</div>
        <input type="hidden" data-mode="${mode}">
      </section>`;
    }
    if (form === "swim")
      return `<section class="seance-block"><div class="seance-big">
          <label class="asc-field"><span>Distance nagée</span><div class="seance-unit"><input class="asc-input seance-input-big" inputmode="numeric" type="number" min="0" max="20000" step="25" data-k="meters" value="${esc(S.meters)}" placeholder="0"><span>m</span></div></label>
          ${durationHtml("Durée", false, true)}
        </div>
        <p class="seance-derived asc-small" id="derived" aria-live="polite"></p>
        <div class="asc-field"><span>Bassin</span><div class="asc-seg" role="group" aria-label="Bassin">${[["25", "25 m"], ["50", "50 m"], ["open", "Eau libre"]].map(([k, l]) => `<button type="button" data-pool="${k}" aria-pressed="${S.pool === k}">${l}</button>`).join("")}</div></div>
      </section>`;
    if (form === "strength") return setsEditor("strength");
    if (form === "bodyweight") return setsEditor("bodyweight");
    if (form === "climbing") {
      const c = S.climbing;
      const systems = GRADE_SYSTEMS[c.discipline] || GRADE_SYSTEMS.Bloc;
      return `<section class="seance-block">
        <div class="asc-form-grid">
          <div class="asc-field"><span>Discipline</span><div class="asc-seg" role="group" aria-label="Discipline">${["Bloc", "Voie"].map((d) => `<button type="button" data-climb="discipline" data-v="${d}" aria-pressed="${c.discipline === d}">${d}</button>`).join("")}</div></div>
          <div class="asc-field"><span>Lieu</span><div class="asc-seg" role="group" aria-label="Lieu">${["Salle", "Extérieur"].map((d) => `<button type="button" data-climb="location" data-v="${d}" aria-pressed="${c.location === d}">${d}</button>`).join("")}</div></div>
        </div>
        <div class="asc-form-grid">
          <label class="asc-field"><span>Système de cotation</span><select data-k="climbing.system">${systems.map((s) => `<option ${c.system === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
          ${c.discipline === "Voie" ? `<label class="asc-field"><span>Assurage</span><select data-k="climbing.belay"><option value="">—</option>${["Tête", "Moulinette", "Auto-assurage"].map((b) => `<option ${c.belay === b ? "selected" : ""}>${b}</option>`).join("")}</select></label>` : ""}
        </div>
        <div class="asc-form-grid">
          <label class="asc-field"><span>Essais</span><input class="asc-input" inputmode="numeric" type="number" min="0" max="500" data-k="climbing.attempts" value="${esc(c.attempts)}" placeholder="—"></label>
          <label class="asc-field"><span>Réussites</span><input class="asc-input" inputmode="numeric" type="number" min="0" max="500" data-k="climbing.successes" value="${esc(c.successes)}" placeholder="—"></label>
          <label class="asc-field"><span>Meilleure réussie</span><input class="asc-input" data-k="climbing.best" value="${esc(c.best)}" placeholder="${c.system === "V-scale bloc" ? "V4" : c.system === "Français voie" ? "6b+" : "6A"}" autocapitalize="characters"></label>
        </div>
        <p class="asc-small asc-faint">Les cotations restent comparées dans leur système et leur contexte : un 6A en bloc n’est pas un 6a en voie.</p>
      </section>
      <section class="seance-block">${durationHtml()}</section>`;
    }
    const unit = S_().unitOf(S.sport);
    const fields = (window.SPORTS_CONFIG?.[S.sport]?.extraFields || []).filter((f) => f && f.id && ["number", "select", "checkbox", "text"].includes(f.type)).sort((a, b) => (a.priority || 99) - (b.priority || 99)).slice(0, 6);
    return `<section class="seance-block"><div class="seance-big">${!["min", "h"].includes(unit) ? `<label class="asc-field"><span>Valeur</span><div class="seance-unit"><input class="asc-input seance-input-big" inputmode="decimal" type="number" min="0" data-k="value" value="${esc(S.value)}" placeholder="0"><span>${esc(unit)}</span></div></label>` : ""}${durationHtml()}</div></section>
      ${fields.length ? `<details class="seance-block seance-more" ${Object.keys(S.extras).length ? "open" : ""}><summary>Détails de ${esc(S_().label(S.sport).toLowerCase())} <small class="asc-faint">facultatif</small></summary><div class="asc-form-grid">${fields.map(extraField).join("")}</div></details>` : ""}`;
  }

  function extraField(f) {
    const v = S.extras[f.id] ?? "";
    const label = esc(f.label || f.id) + (f.unit ? ` <small class="asc-faint">${esc(f.unit)}</small>` : "");
    if (f.type === "select") return `<label class="asc-field"><span>${label}</span><select data-k="extras.${esc(f.id)}"><option value="">—</option>${(f.options || []).map((o) => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    if (f.type === "checkbox") return `<label class="asc-field seance-check"><input type="checkbox" data-k="extras.${esc(f.id)}" ${v ? "checked" : ""}><span>${label}</span></label>`;
    if (f.type === "number") return `<label class="asc-field"><span>${label}</span><input class="asc-input" inputmode="decimal" type="number" ${f.min !== undefined && f.min !== null ? `min="${Number(f.min)}"` : ""} ${f.max !== undefined && f.max !== null ? `max="${Number(f.max)}"` : ""} step="${Number(f.step) || "any"}" data-k="extras.${esc(f.id)}" value="${esc(v)}"></label>`;
    return `<label class="asc-field"><span>${label}</span><input class="asc-input" maxlength="120" data-k="extras.${esc(f.id)}" value="${esc(v)}"></label>`;
  }

  function formHtml() {
    const t = timer();
    return `
      <header class="seance-head">
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-act="back" aria-label="Changer de sport">${icon("chevronLeft")}</button>
        <div class="seance-head-main"><p class="asc-eyebrow cy">Nouvelle séance</p><h1 class="seance-title">${esc(S_().label(S.sport))}</h1></div>
        ${familyChip(S.sport)}
      </header>
      <div class="seance-chrono" data-running="${!!t.started}">
        <span class="asc-num seance-chrono-time" id="chrono" aria-live="off">00:00</span>
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-act="chrono">${icon(t.started ? "pause" : "play")}${t.started ? "Pause" : elapsedMs(t) ? "Reprendre" : "Chrono"}</button>
        ${elapsedMs(t) ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-act="chrono-reset" aria-label="Remettre le chrono à zéro">${icon("restore")}</button>` : ""}
      </div>
      <div class="seance-form">
        ${whenHtml()}
        ${measuresHtml()}
        <section class="seance-block" aria-labelledby="rpe-title"><div class="asc-between"><h2 id="rpe-title" class="seance-label">Ressenti <small class="asc-faint">facultatif</small></h2><span class="asc-small asc-muted" id="rpe-text">${S.rpe ? `${S.rpe}/10 · ${RPE_TEXT[S.rpe]}` : "Non renseigné"}</span></div>
          <div class="asc-scale" role="group" aria-label="Effort ressenti de 1 à 10">${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<button type="button" data-rpe="${n}" aria-pressed="${S.rpe === n}" aria-label="${n}, ${RPE_TEXT[n]}">${n}</button>`).join("")}</div>
          <p class="asc-small asc-faint">${window.TitanData?.rulesV300?.() ? "L’intensité ajuste ton XP : 1 minute d’effort modéré ≈ 10 XP." : "L’intensité reste dans ton journal ; l’XP est calculée par le serveur."}</p>
        </section>
        <section class="seance-block"><label class="asc-field"><span>Note <small class="asc-faint">facultatif</small></span><textarea data-k="note" maxlength="2000" placeholder="Un repère pour plus tard : sensations, parcours, partenaire…">${esc(S.note)}</textarea></label></section>
      </div>
      <div class="seance-bar" role="region" aria-label="Enregistrer">
        <p id="seance-status" class="asc-small seance-status" role="status"></p>
        <div class="seance-bar-preview" id="preview" aria-live="polite"></div>
        <button type="button" class="asc-btn asc-btn-primary seance-save" data-act="save">${icon("check")} Enregistrer</button>
      </div>`;
  }

  function render() {
    if (!root) return;
    root.innerHTML = S.step === "pick" ? pickHtml() : formHtml();
    if (S.step === "pick") {
      document.getElementById("sport-results").innerHTML = resultsHtml();
      window.titanShell?.refresh();
    } else {
      updateDerived();
      tick();
    }
  }

  function updateDerived() {
    const form = S_().formOf(S.sport);
    const d = document.getElementById("derived");
    const dur = duration();
    if (d) {
      if (form === "distance") {
        const km = num(S.distance);
        d.textContent = km > 0 && dur ? (S_().paceMode(S.sport) === "pace" ? `Allure moyenne ${F().pace(km, dur)}` : `Vitesse moyenne ${F().speed(km, dur)}`) : "";
      } else if (form === "swim") {
        const m = num(S.meters);
        if (m > 0 && dur) {
          const sec = Math.round((dur * 60) / (m / 100));
          d.textContent = `Allure ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} /100 m`;
        } else d.textContent = "";
      }
    }
    document.querySelectorAll("[data-volume]").forEach((el) => {
      const e = S.exercises[Number(el.dataset.volume)];
      const vol = e ? e.sets.reduce((n, s) => n + (num(s.weight) || 0) * (num(s.reps) || 0), 0) : 0;
      el.textContent = vol && S_().formOf(S.sport) === "strength" ? `Volume ${F().weight(vol)}` : "";
    });
    const p = document.getElementById("preview");
    if (p) {
      const b = build();
      const rpeText = document.getElementById("rpe-text");
      if (rpeText) rpeText.textContent = S.rpe ? `${S.rpe}/10 · ${RPE_TEXT[S.rpe]}` : "Non renseigné";
      if (b.at && E().isHistorical(b.at.getTime())) p.innerHTML = `<strong>Historique</strong><span>sans XP</span>`;
      else if (b.val > 0) {
        const e = E().effort({ sport: S.sport, profile: S_().profileOf(S.sport), unit: b.unit, val: b.val, details: b.data });
        p.innerHTML = window.TitanData?.rulesV300?.()
          ? `<strong>≈ ${F().number(e.xp)} XP</strong><span>${F().duration(e.minutes)}${e.estimated ? " estimées" : ""}${S.rpe ? ` · RPE ${S.rpe}` : ""}</span>`
          : `<strong>${F().duration(e.minutes)}${e.estimated ? " estimées" : ""}</strong><span>XP calculée par le serveur${S.rpe ? ` · RPE ${S.rpe}` : ""}</span>`;
      } else p.innerHTML = `<strong>Prêt</strong><span>quand tu l’es</span>`;
    }
  }

  function tick() {
    const el = document.getElementById("chrono");
    if (!el) return;
    const t = timer();
    const sec = Math.floor(elapsedMs(t) / 1000);
    const h = Math.floor(sec / 3600);
    el.textContent = `${h ? h + ":" : ""}${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    document.querySelectorAll("[data-chrono-apply]").forEach((b) => (b.hidden = sec < 30));
  }

  /* ---------- Actions ---------- */
  function choose(sport, prefill) {
    if (!window.SPORTS_CONFIG?.[sport]) return;
    S = { ...fresh(sport), ...(prefill || {}) };
    if (S_().formOf(sport) === "strength" && !S.exercises.length) S.exercises = [{ name: "", variant: "", kind: "weighted", sets: [{ weight: "", reps: "", rir: "" }] }];
    if (S_().formOf(sport) === "bodyweight" && !S.exercises.length) S.exercises = [{ name: "", variant: "", kind: "bodyweight", sets: [{ weight: "", reps: "", rir: "" }] }];
    if (S_().formOf(sport) === "climbing") S.climbing.system = S.climbing.discipline === "Voie" ? "Français voie" : S.climbing.system || "Fontainebleau bloc";
    history.replaceState(null, "", `/training?sport=${encodeURIComponent(sport)}`);
    render();
    persist();
    window.scrollTo({ top: 0 });
  }

  function prefillFromLog(l) {
    const m = window.TitanTraining.duration(l);
    const p = { note: "" };
    if (m) {
      const secs = Math.round(m * 60);
      p.durH = String(Math.floor(secs / 3600) || "");
      p.durM = String(Math.floor((secs % 3600) / 60));
      p.durS = secs % 60 ? String(secs % 60) : "";
    }
    const form = S_().formOf(l.sport);
    if (form === "distance" && l.unit === "km") p.distance = String(l.val);
    if (form === "swim" && l.unit === "m") p.meters = String(l.val);
    if (l.details?.elevation) p.elevation = String(l.details.elevation);
    if (l.details?.bio?.rpe) p.rpe = Number(l.details.bio.rpe);
    if (Array.isArray(l.details?.exercises) && l.details.exercises.length)
      p.exercises = l.details.exercises.map((e) => ({
        name: e.name,
        variant: e.variant || "",
        kind: e.kind || (form === "bodyweight" ? "bodyweight" : "weighted"),
        sets: (e.setRows?.length ? e.setRows : Array.from({ length: e.sets || 1 }, () => ({ weight: e.weight, reps: e.reps }))).map((s) => ({ weight: s.weight ?? "", reps: s.reps ?? "", rir: s.rir ?? "", seconds: s.seconds ?? "" })),
      }));
    if (l.details?.extras) {
      const x = l.details.extras;
      if (form === "climbing") p.climbing = { discipline: x.climbing_discipline || "Bloc", location: x.location || "Salle", system: x.grade_system || "Fontainebleau bloc", belay: x.belay || "", attempts: "", successes: "", best: "" };
      else p.extras = { ...x };
    }
    return p;
  }

  async function save(btn) {
    const b = build();
    if (b.errors.length) {
      // The message sits next to the save button; the faulty field is marked and focused.
      status(b.errors[0], "err");
      const field = b.fields[0] && root.querySelector(`[data-k="${b.fields[0]}"]`);
      if (field) {
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", "seance-status");
        field.scrollIntoView({ block: "center", behavior: "smooth" });
        field.focus({ preventScroll: true });
      }
      return;
    }
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    status("Enregistrement…");
    try {
      const sport = S.sport;
      const t = timer();
      const log = await window.logActivity(sport, b.data, { quiet: true });
      if (!log) throw new Error("Séance non enregistrée.");
      clearDraft();
      if (elapsedMs(t)) setTimer({ elapsed: 0, started: null });
      window.dispatchEvent(new CustomEvent("titan:session-stored", { detail: { ownerId: owner(), logId: log.client_event_id } }));
      const count = P().activeLogs(window.state?.history || []).length;
      if (count <= 2) window.TitanAnalytics?.track(count === 1 ? "first_session" : "second_session", { family: S_().familyOf(sport) });
      S = fresh();
      history.replaceState(null, "", "/training");
      render();
      window.TitanMoment?.open(log);
    } catch (error) {
      status(error.message || "Séance non enregistrée.", "err");
      window.titanShell.toast({ type: "err", title: "Séance non enregistrée", message: error.message || "Réessaie : rien n’a été perdu, le brouillon est conservé." });
    } finally {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }

  async function onGpx(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return window.titanShell.toast({ type: "warn", title: "Fichier trop lourd", message: "Le GPX doit faire moins de 15 Mo." });
    const r = window.TitanGpx.analyse(await file.text());
    if (!r.ok) return window.titanShell.toast({ type: "warn", title: "GPX illisible", message: r.error });
    S.gpx = r;
    S.distance = String(r.distanceKm);
    const mins = r.movingMinutes || r.elapsedMinutes;
    if (mins) {
      const secs = Math.round(mins * 60);
      S.durH = String(Math.floor(secs / 3600) || "");
      S.durM = String(Math.floor((secs % 3600) / 60));
      S.durS = secs % 60 ? String(secs % 60) : "";
    }
    if (r.ascent) S.elevation = String(r.ascent);
    if (r.start) {
      const d = new Date(r.start);
      S.when = "other";
      S.date = F().dateKey(d);
      S.time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    render();
    persist();
    window.titanShell.toast({ type: "ok", title: "Trace importée", message: `${F().distance(r.distanceKm)} · ${r.points} points${r.ignoredPoints ? `, ${r.ignoredPoints} aberrants ignorés` : ""}.` });
  }

  function routineSheet(mode) {
    const routines = window.state?.user?.gymRoutines || [];
    const limit = window.titanIsElite?.() ? 20 : 5;
    const body = document.createElement("div");
    body.className = "asc-stack";
    if (mode === "load") {
      body.innerHTML = `<div class="asc-list">${routines.map((r, i) => `<button type="button" class="asc-row" data-r="${i}"><span class="asc-row-icon">${icon("layers")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(r.label)}</span><span class="asc-row-sub">${r.exercises.map((e) => esc(e.name)).slice(0, 4).join(" · ")}</span></span>${icon("chevron")}</button>`).join("")}</div>`;
      const d = window.titanShell.sheet({ title: "Charger une routine", eyebrow: "Ta bibliothèque", body });
      body.querySelectorAll("[data-r]").forEach((b) =>
        b.addEventListener("click", () => {
          const r = routines[Number(b.dataset.r)];
          S.exercises = r.exercises.map((e) => ({ name: e.name, variant: e.variant || "", kind: e.kind || "weighted", sets: (e.setRows?.length ? e.setRows : Array.from({ length: e.sets || 3 }, () => ({ weight: e.weight, reps: e.reps }))).map((s) => ({ weight: s.weight ?? "", reps: s.reps ?? "", rir: "", seconds: s.seconds ?? "" })) }));
          d.close();
          render();
          persist();
        }),
      );
    } else {
      body.innerHTML = `<label class="asc-field"><span>Nom de la routine</span><input class="asc-input" maxlength="60" placeholder="Haut du corps · A" id="routine-name"></label><p class="asc-small asc-faint">${routines.length}/${limit} routines. Un nom existant la remplace.${limit === 5 ? " TITAN+ : jusqu’à 20 routines." : ""}</p><button type="button" class="asc-btn asc-btn-primary" id="routine-save">Mémoriser</button><p class="asc-small" role="alert" id="routine-err"></p>`;
      const d = window.titanShell.sheet({ title: "Mémoriser la routine", eyebrow: "Ta bibliothèque", body });
      body.querySelector("#routine-save").addEventListener("click", () => {
        const name = body.querySelector("#routine-name").value.trim();
        const err = body.querySelector("#routine-err");
        if (!name) return (err.textContent = "Donne un nom à ta routine.");
        const existing = routines.find((r) => r.label.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"));
        if (!existing && routines.length >= limit) return (err.textContent = `Ta bibliothèque contient déjà ${limit} routines. Réutilise un nom pour en remplacer une.`);
        const exercises = exercisesPayload().map((e) => ({ name: e.name, variant: e.variant, kind: e.kind, setRows: e.setRows }));
        if (!exercises.length) return (err.textContent = "Ajoute au moins un exercice avec une série.");
        window.state.user.gymRoutines = [{ id: existing?.id || crypto.randomUUID(), label: name, exercises }, ...routines.filter((r) => r !== existing)];
        window.saveState?.();
        d.close();
        window.titanShell.toast({ type: "ok", title: "Routine mémorisée", message: name });
        render();
      });
    }
  }

  /* ---------- Events ---------- */
  function onInput(e) {
    const el = e.target;
    if (el.id === "sport-q") {
      S.query = el.value;
      document.getElementById("sport-results").innerHTML = resultsHtml();
      return;
    }
    const k = el.dataset.k;
    if (!k || !S) return;
    if (el.getAttribute("aria-invalid") === "true") {
      el.removeAttribute("aria-invalid");
      status("");
    }
    setPath(S, k, el.type === "checkbox" ? el.checked : el.value);
    if (k === "climbing.system" || k === "date") {
      render();
      const again = root.querySelector(`[data-k="${k}"]`);
      again?.focus();
    }
    updateDerived();
    persist();
  }

  function onClick(e) {
    const t = e.target.closest("button, [data-sport], [data-repeat], [data-routine]");
    if (!t || !root.contains(t)) return;
    if (t.dataset.sport) return choose(t.dataset.sport);
    if (t.dataset.repeat) {
      const l = (window.state?.history || []).find((x) => (x.client_event_id || x.id) === t.dataset.repeat);
      if (l) choose(l.sport, prefillFromLog(l));
      return;
    }
    if (t.dataset.routine) {
      const r = (window.state?.user?.gymRoutines || []).find((x) => x.id === t.dataset.routine);
      if (r) {
        const sport = window.SPORTS_CONFIG?.muscu_gym ? "muscu_gym" : "muscu_builder";
        choose(sport, prefillFromLog({ sport, unit: "kg", details: { exercises: r.exercises } }));
      }
      return;
    }
    if (t.dataset.when) {
      S.when = t.dataset.when;
      if (S.when === "yesterday" && !S.time) S.time = "18:00";
      render();
      return persist();
    }
    if (t.dataset.pool) {
      S.pool = t.dataset.pool;
      render();
      return persist();
    }
    if (t.dataset.rpe) {
      const n = Number(t.dataset.rpe);
      S.rpe = S.rpe === n ? null : n;
      root.querySelectorAll("[data-rpe]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.rpe) === S.rpe)));
      updateDerived();
      return persist();
    }
    if (t.dataset.climb) {
      S.climbing[t.dataset.climb] = t.dataset.v;
      if (t.dataset.climb === "discipline") S.climbing.system = t.dataset.v === "Voie" ? "Français voie" : "Fontainebleau bloc";
      render();
      return persist();
    }
    const act = t.dataset.act;
    if (!act) {
      if (t.hasAttribute("data-chrono-apply")) {
        const secs = Math.max(60, Math.round(elapsedMs(timer()) / 1000));
        const mins = Math.floor(secs / 60);
        S.durH = String(Math.floor(mins / 60) || "");
        S.durM = String(mins % 60);
        S.durS = ["distance", "swim"].includes(S_().formOf(S.sport)) && secs % 60 ? String(secs % 60) : "";
        render();
        persist();
        window.titanShell.toast({ type: "ok", title: "Durée reportée", message: F().duration(mins) });
      }
      return;
    }
    if (act === "back") {
      S = { ...fresh(), query: "" };
      clearDraft();
      history.replaceState(null, "", "/training");
      return render();
    }
    if (act === "save") return save(t);
    if (act === "chrono") {
      const tm = timer();
      if (tm.started) setTimer({ elapsed: elapsedMs(tm), started: null });
      else setTimer({ elapsed: tm.elapsed, started: Date.now() });
      return render();
    }
    if (act === "chrono-reset") {
      setTimer({ elapsed: 0, started: null });
      return render();
    }
    if (act === "add-ex") {
      const kind = S_().formOf(S.sport) === "bodyweight" ? "bodyweight" : "weighted";
      S.exercises.push({ name: "", variant: "", kind, sets: [{ weight: "", reps: "", rir: "", seconds: "" }] });
      render();
      root.querySelectorAll(".seance-ex-name")[S.exercises.length - 1]?.focus();
      return persist();
    }
    const i = Number(t.dataset.i);
    if (act === "del-ex") S.exercises.splice(i, 1);
    if (act === "add-set") {
      const last = S.exercises[i].sets[S.exercises[i].sets.length - 1] || {};
      S.exercises[i].sets.push({ weight: last.weight ?? "", reps: last.reps ?? "", rir: "", seconds: last.seconds ?? "" });
    }
    if (act === "del-set") {
      S.exercises[i].sets.splice(Number(t.dataset.j), 1);
      if (!S.exercises[i].sets.length) S.exercises[i].sets.push({ weight: "", reps: "", rir: "", seconds: "" });
    }
    if (act === "kind") S.exercises[i].kind = t.dataset.kind;
    if (act === "load-routine") return routineSheet("load");
    if (act === "save-routine") return routineSheet("save");
    render();
    persist();
  }

  function onChange(e) {
    if (e.target.matches("[data-gpx]")) onGpx(e.target.files?.[0]);
  }

  function onKey(e) {
    if (e.target.id === "sport-q" && e.key === "Enter") {
      const first = S_().search(S.query, { limit: 1 })[0];
      if (first) choose(first.id);
    }
  }

  function boot() {
    root = document.getElementById("seance");
    if (!root || !window.state?.user || !window.TitanSports) return;
    S_().ensure();
    const params = new URLSearchParams(location.search);
    let duplicate = null;
    try {
      duplicate = JSON.parse(sessionStorage.getItem("titan_duplicate_session") || "null");
      sessionStorage.removeItem("titan_duplicate_session");
    } catch {}
    const draft = readDraft();
    if (duplicate?.ownerId === owner() && duplicate.log?.sport && window.SPORTS_CONFIG?.[duplicate.log.sport]) {
      S = fresh();
      choose(duplicate.log.sport, prefillFromLog(duplicate.log));
    } else if (params.get("sport") && window.SPORTS_CONFIG?.[params.get("sport")] && (!draft || draft.sport !== params.get("sport"))) {
      S = fresh();
      choose(params.get("sport"));
    } else if (draft && window.SPORTS_CONFIG?.[draft.sport]) {
      S = { ...fresh(draft.sport), ...draft, step: "form" };
      render();
      status("Brouillon repris. Vérifie la date et les mesures avant d’enregistrer.");
    } else {
      S = fresh();
      render();
    }
    root.addEventListener("input", onInput);
    root.addEventListener("change", onChange);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    clearInterval(timerTick);
    timerTick = setInterval(tick, 1000);
  }

  let booted = false;
  function start() {
    if (booted || !window.state?.user) return;
    booted = true;
    boot();
  }
  window.addEventListener("titan:history-updated", () => {
    if (!booted) start();
    else if (S?.step === "pick") render();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
