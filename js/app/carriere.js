/* TITAN 300 — Progrès · Ma carrière sportive. Everything the account accomplished, from its own journal, through the same rules as the Android
   app (js/core/career.js). Nothing is invented: no calories, no distance for a sport that measured none, session distances apart from steps. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const C = () => window.TitanCareer;
  const RANGES = [["7d", "7 jours"], ["30d", "30 jours"], ["year", "Année"], ["all", "Depuis le début"]];
  const STEP_DAYS = 399; // the server answers at most 400 days at a time

  let root = null;
  let range = "all";
  let steps = { state: "idle", days: null, owner: null };
  const guest = () => !window.state?.user?.id || window.state?.user?.guest === true;
  const logs = () => window.state?.history || [];
  const n = (v) => F().number(v);
  const when = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const dayKey = (d) => F().dateKey(d);
  const context = () => ({ owner: window.state?.user?.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => !!a.owner && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch;

  /** One request when the page opens (never at startup), one number per day (the server already keeps the highest source). */
  async function loadSteps() {
    if (guest() || steps.state === "loading") return;
    const ask = context();
    if (steps.owner === ask.owner && steps.state === "done") return;
    steps = { state: "loading", days: null, owner: ask.owner };
    try {
      const to = new Date();
      const from = new Date(to.getTime() - STEP_DAYS * 86400000);
      const { data, error } = await ask.client.rpc("titan_daily_activity_v1", { p_from: dayKey(from), p_to: dayKey(to) });
      if (!same(ask, context())) return;
      steps = { state: error ? "failed" : "done", days: !error && Array.isArray(data) ? data.map((d) => ({ day: d.day, steps: Number(d.steps) })) : null, owner: ask.owner };
    } catch {
      if (same(ask, context())) steps = { state: "failed", days: null, owner: ask.owner };
    }
    render();
  }

  const big = (value, label, tone) => `<div class="cr-big"><strong class="cr-num${tone ? ` ${tone}` : ""}">${esc(value)}</strong><span>${esc(label)}</span></div>`;
  const swim = (m) => (m >= 1000 ? `${F().number(m / 1000, 1)} km` : `${n(m)} m`);

  function lenses(c) {
    const d = c.distance, out = [];
    const lens = (ic, title, tone, body) => out.push(`<section class="asc-panel cr-lens" data-lens><h3>${icon(ic)} ${esc(title)}</h3><div class="cr-grid">${body}</div></section>`);
    if ((c.lenses.includes("run") || c.lenses.includes("hike")) && d.footKm > 0)
      lens("run", "À pied", "cy", big(F().distance(d.footKm), "parcourus en séance", "cy") + big(String(d.footSessions), d.footSessions > 1 ? "séances avec distance" : "séance avec distance")
        + (d.footPace ? big(F().pace(d.runKm, d.runMinutes), "allure moyenne en course") : "") + (d.footElevation > 0 ? big(`${n(d.footElevation)} m`, "de dénivelé positif") : ""));
    if (c.lenses.includes("bike") && d.bikeKm > 0)
      lens("bike", "À vélo", "am", big(F().distance(d.bikeKm), "parcourus en séance", "am") + big(String(d.bikeSessions), d.bikeSessions > 1 ? "sorties avec distance" : "sortie avec distance")
        + (d.bikeKmh ? big(`${F().number(d.bikeKmh, 1)} km/h`, "vitesse moyenne") : "") + (d.bikeMinutes ? big(F().hours(d.bikeMinutes), "en selle") : "") + (d.bikeElevation > 0 ? big(`${n(d.bikeElevation)} m`, "de dénivelé positif") : ""));
    if (c.lenses.includes("swim") && d.swimMeters > 0)
      lens("wave", "À la nage", "cy", big(swim(d.swimMeters), "nagés en séance") + big(String(d.swimSessions), d.swimSessions > 1 ? "séances" : "séance") + (d.swimMinutes ? big(F().duration(d.swimMinutes), "dans l’eau") : ""));
    if (c.lenses.includes("strength") && c.strength.sessions > 0)
      lens("weight", "Renforcement", "cy", big(String(c.strength.sessions), c.strength.sessions > 1 ? "séances détaillées" : "séance détaillée") + big(n(c.strength.sets), "séries") + big(n(c.strength.reps), "répétitions")
        + (c.strength.loadedSets > 0 ? big(`${n(c.strength.volumeKg)} kg`, "de volume (séries chargées)", "cy") : ""));
    if (c.lenses.includes("multi"))
      out.push(`<section class="asc-panel cr-lens" data-lens><h3>${icon("layers")} Tes pratiques</h3>
        <div class="cr-share" role="img" aria-label="${esc(c.families.map((f) => `${f.label} ${Math.round(f.share * 100)} %`).join(", "))}">${c.families.map((f) => `<span style="flex:${Math.max(0.02, f.share || 1 / c.families.length)}" data-family="${esc(f.id)}"></span>`).join("")}</div>
        <p class="asc-small asc-muted cr-legend">${c.families.map((f) => `${esc(f.label)} ${Math.round(f.share * 100)} %`).join(" · ")}</p>
        <ul class="cr-list">${c.sports.slice(0, 5).map((s) => `<li><span>${esc(s.label)}</span><span class="asc-muted">${s.sessions} séance${s.sessions > 1 ? "s" : ""}${s.minutes ? ` · ${esc(F().duration(s.minutes))}` : ""}</span></li>`).join("")}</ul></section>`);
    return out.join("");
  }

  function stepsPanel(c) {
    let body;
    if (c.steps) {
      body = `<p class="cr-steps"><strong class="cr-num">${esc(n(c.steps.total))}</strong> pas</p>
        <p class="asc-small asc-muted">Comptés sur ${c.steps.days} jour${c.steps.days > 1 ? "s" : ""} avec un chiffre, un seul nombre par jour (jamais additionnés entre capteurs). Ces pas viennent de ton téléphone via Santé Connect ou du compteur TITAN d’Android.</p>
        <p class="asc-small asc-faint">≈ ${esc(F().number(c.steps.estimatedKm, 0))} km estimés d’après les pas. Cette estimation n’est jamais ajoutée aux distances de séance.</p>`;
    } else {
      body = `<p class="asc-small asc-muted">${steps.state === "loading" ? "Lecture de tes pas…" : guest() ? "Les pas se lisent avec un compte." : "Pas de pas comptés sur cette période. Le compteur de pas se règle dans l’application Android."}</p>`;
    }
    return `<section class="asc-panel cr-block" data-career-steps><p class="asc-eyebrow">Pas</p>${body}</section>`;
  }

  function render() {
    if (!root) return;
    const P = window.TitanData?.progression?.();
    const c = C().build(logs(), { range, stepDays: steps.days && steps.days.length ? steps.days : null, rank: P?.rank ? { level: P.level, id: P.rank.id, name: P.rank.name } : null, xp: P && !P.guest ? P.total ?? null : null });
    const crest = window.TitanCrest && P?.level ? window.TitanCrest.svg(window.TitanCrest.rankIdOf(P.level), 150) : "";
    const chips = `<div class="cr-ranges" role="group" aria-label="Période">${RANGES.map(([v, l]) => `<button type="button" class="cr-range" data-range="${v}" aria-pressed="${v === range}">${esc(l)}</button>`).join("")}</div>`;
    const hero = `<section class="asc-panel cr-hero" data-career-hero>${crest ? `<span class="cr-crest">${crest}</span>` : ""}
      ${P?.rank ? `<p class="asc-eyebrow cy">Niveau ${P.level} · ${esc(P.rank.name)}</p>` : ""}<p class="asc-small asc-muted">${c.first ? `Depuis le ${esc(when(c.first))}` : "Ta carrière commence avec ta première séance."}</p></section>`;
    let body;
    if (c.empty) {
      body = `<div class="asc-panel cr-empty" role="status"><h2>${range === "all" ? "Ta carrière commence ici" : "Rien sur cette période"}</h2><p class="asc-muted">${range === "all" ? "Enregistre une séance : tes chiffres, tes records et tes grands moments s’écrivent avec ton journal." : "Une période calme ne t’enlève rien. Essaie « Depuis le début » pour revoir tout ton parcours."}</p>${range === "all" ? '<a class="asc-btn asc-btn-primary" href="/training">Enregistrer une séance</a>' : ""}</div>`;
    } else {
      const d = c.distance;
      const hasDistance = d.footKm + d.bikeKm + d.swimMeters + c.elevation.meters > 0;
      body = `<section class="asc-panel cr-block" data-career-totals><div class="cr-grid">
          ${big(n(c.totals.sessions), c.totals.sessions > 1 ? "séances" : "séance", "cy")}${big(F().hours(c.totals.minutes), "de pratique")}${big(String(c.totals.sports), c.totals.sports > 1 ? "sports pratiqués" : "sport pratiqué")}${big(String(c.totals.activeDays), c.totals.activeDays > 1 ? "jours actifs" : "jour actif")}</div>
          ${c.totals.unmeasuredSessions > 0 ? `<p class="asc-small asc-faint">${c.totals.unmeasuredSessions} séance${c.totals.unmeasuredSessions > 1 ? "s" : ""} sans durée renseignée ${c.totals.unmeasuredSessions > 1 ? "ne comptent" : "ne compte"} pas dans le temps.</p>` : ""}</section>
        ${hasDistance ? `<section class="asc-panel cr-block" data-career-distances><p class="asc-eyebrow">Distances en séance</p><div class="cr-grid">
          ${d.footKm > 0 ? big(F().distance(d.footKm), "à pied") : ""}${d.bikeKm > 0 ? big(F().distance(d.bikeKm), "à vélo") : ""}${d.swimMeters > 0 ? big(swim(d.swimMeters), "à la nage") : ""}${c.elevation.meters > 0 ? big(`${n(c.elevation.meters)} m`, "de dénivelé positif", "am") : ""}</div>
          <p class="asc-small asc-faint">Seulement les distances mesurées pendant tes séances : un sport sans distance n’en reçoit jamais.</p></section>` : ""}
        ${stepsPanel(c)}
        ${lenses(c)}
        ${c.records.length ? `<section class="asc-section" data-career-records><div class="asc-section-head"><h2>Records personnels</h2><a class="asc-btn asc-btn-secondary asc-btn-sm" href="/records">Tous les records</a></div><ul class="asc-panel cr-list">${c.records.slice(0, 6).map((r) => `<li>${icon("trophy")}<span>${esc(r.label)} · ${esc(r.sportLabel)}</span><strong>${esc(typeof r.value === "number" ? F().recordValue(r.unit, r.value) : String(r.value))}</strong></li>`).join("")}</ul></section>` : ""}
        <section class="asc-section" data-career-milestones><div class="asc-section-head"><h2>Grands moments</h2></div>${c.milestones.length
          ? `<ol class="asc-panel cr-moments">${c.milestones.slice(0, 8).map((m) => `<li data-tone="${m.tone}"><span class="cr-dot"></span><div><strong>${esc(m.title)}</strong><small class="asc-faint">${esc(when(m.date))} · ${esc(m.detail)}</small></div></li>`).join("")}</ol>`
          : '<p class="asc-small asc-muted">Les grands moments apparaissent quand tes séances les prouvent : premiers kilomètres, caps de séances, dénivelé.</p>'}</section>
        <section class="asc-section" data-career-timeline><div class="asc-section-head"><h2>Dernières séances</h2><a class="asc-btn asc-btn-secondary asc-btn-sm" href="/journal">Ouvrir le journal</a></div><ul class="asc-panel cr-list">${c.timeline.map((s) => `<li><span>${esc(s.label)}<small class="asc-faint"> ${esc(F().relativeDay(s.date))}</small></span><span class="asc-muted">${esc([s.km ? F().distance(s.km) : null, s.minutes ? F().duration(s.minutes) : null].filter(Boolean).join(" · ") || "—")}</span></li>`).join("")}</ul></section>
        <p class="asc-small asc-faint" data-career-note>Calories : TITAN n’en affiche pas tant qu’une source fiable ne les fournit pas. Aucun chiffre n’est inventé. Une séance n’est comptée qu’une seule fois, quelle que soit sa source (saisie, GPS, Santé Connect, Garmin).${c.excluded > 0 ? ` ${c.excluded} séance${c.excluded > 1 ? "s" : ""} en cours de vérification ne ${c.excluded > 1 ? "sont" : "est"} pas comptée${c.excluded > 1 ? "s" : ""}.` : ""}</p>`;
    }
    root.innerHTML = `${hero}${chips}${body}`;
    root.setAttribute("aria-busy", "false");
  }

  function start() {
    root = document.getElementById("carriere");
    if (!root || !C() || !window.TitanFormat) return;
    if (!root.dataset.bound) {
      root.dataset.bound = "1";
      root.addEventListener("click", (e) => {
        const b = e.target.closest("[data-range]");
        if (!b) return;
        range = RANGES.some(([v]) => v === b.dataset.range) ? b.dataset.range : "all";
        render();
        root.querySelector(`[data-range="${range}"]`)?.focus({ preventScroll: true });
      });
    }
    render();
    loadSteps();
  }
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; start(); });
  };
  ["titan:history-updated", "titan:adventure-updated"].forEach((ev) => window.addEventListener(ev, queue));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
