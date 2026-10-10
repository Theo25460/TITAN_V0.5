/* TITAN 300 — Progrès · Semaine: the weekly recap, then statistics that answer real questions. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const P = () => window.TitanProgress;
  const Q = () => window.TitanQuestions;
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;
  const DAY = 86400000;
  const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

  let root = null;
  let offset = 0; // 0 = this week, 1 = last week…
  let goalsCache = [];

  const logs = () => window.state?.history || [];

  function recapFor(k) {
    const now = new Date();
    if (k === 0) return P().recap(logs(), { now, goals: goalsCache, current: true });
    // recap() describes the week before `now`: point `now` inside the week after the one we want.
    const anchor = F().addDays(F().weekStart(now), -(k - 1) * 7 + 1);
    return P().recap(logs(), { now: anchor, goals: goalsCache });
  }

  function firstWeekOffset() {
    const list = P().activeLogs(logs());
    if (!list.length) return 0;
    const first = Math.min(...list.map((l) => new Date(l.date).getTime()));
    return Math.max(0, Math.round((F().weekStart(new Date()).getTime() - F().weekStart(new Date(first)).getTime()) / (7 * DAY)));
  }

  function headline(r, target) {
    const w = r.week;
    const current = offset === 0;
    if (w.sessions === 0) return current ? { title: "Ta semaine commence.", text: "Une séance suffit pour lancer le mouvement. Le reste de la semaine t’appartient." } : { title: "Semaine de repos.", text: "Le repos compte aussi. Ta cadence regarde les semaines tenues, elle ne te punit pas d’une semaine calme." };
    const held = w.activeDays >= target;
    const title = held ? `Semaine tenue : ${w.activeDays} jour${w.activeDays > 1 ? "s" : ""} actif${w.activeDays > 1 ? "s" : ""}.` : current ? `${w.activeDays} jour${w.activeDays > 1 ? "s" : ""} actif${w.activeDays > 1 ? "s" : ""} sur ${target} visés.` : `${w.activeDays} jour${w.activeDays > 1 ? "s" : ""} actif${w.activeDays > 1 ? "s" : ""}, ${target} visés.`;
    let text = "";
    if (r.bestOfRecentWeeks) text = "Ta semaine la plus active depuis au moins un mois.";
    else if (r.deltaMinutes !== null && r.baseline.weeks > 0) {
      const d = r.deltaMinutes;
      text = Math.abs(d) < 10 ? `Dans ton rythme habituel${current ? " à ce stade de la semaine" : ""}.` : d > 0 ? `${F().duration(d)} de plus que tes dernières semaines${current ? " au même moment" : ""}.` : `${F().duration(-d)} de moins que tes dernières semaines${current ? " au même moment" : ""}.`;
    } else text = "Première semaine mesurée : la comparaison viendra avec les suivantes.";
    return { title, text };
  }

  function perDay(r) {
    const from = r.from.getTime();
    const per = Array.from({ length: 7 }, () => ({ minutes: 0, sessions: 0 }));
    for (const l of P().activeLogs(logs())) {
      const t = new Date(l.date).getTime();
      if (t < from || t > r.to.getTime()) continue;
      const i = (new Date(l.date).getDay() + 6) % 7;
      per[i].minutes += P().minutesOf(l).minutes || 0;
      per[i].sessions++;
    }
    return per;
  }

  function dayStrip(r) {
    const from = r.from.getTime();
    const per = perDay(r);
    const max = Math.max(60, ...per.map((d) => d.minutes));
    const today = offset === 0 ? (new Date().getDay() + 6) % 7 : -1;
    return `<div class="wk-days" role="list" aria-label="Minutes par jour">${per
      .map((d, i) => {
        const date = F().addDays(r.from, i);
        const label = `${date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })} : ${d.sessions ? `${d.sessions} séance${d.sessions > 1 ? "s" : ""}, ${F().duration(d.minutes)}` : "repos"}`;
        return `<div class="wk-day${i === today ? " is-today" : ""}${i > today && today >= 0 ? " is-future" : ""}" role="listitem" aria-label="${esc(label)}"><span class="wk-bar"><span style="--h:${Math.round((d.minutes / max) * 100)}%"${d.sessions ? ' data-on="true"' : ""}></span></span><span class="wk-day-l">${DAYS[i]}</span></div>`;
      })
      .join("")}</div>`;
  }

  function heroHtml(r) {
    const settings = D().cadenceSettings();
    const h = headline(r, settings.target);
    const w = r.week;
    const max = firstWeekOffset();
    const range = offset === 0 ? "Cette semaine" : offset === 1 ? "La semaine dernière" : `Semaine du ${r.from.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
    return `<section class="asc-hero wk-hero" aria-labelledby="wk-title">
      <div class="wk-nav"><button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-week="${offset + 1}" aria-label="Semaine précédente" ${offset >= Math.max(max, 1) ? "disabled" : ""}>${icon("chevronLeft")}</button>
        <div><p class="asc-eyebrow cy">${esc(range)}</p><p class="asc-small asc-muted">${esc(r.from.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }))} – ${esc(r.to.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }))}</p></div>
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-week="${offset - 1}" aria-label="Semaine suivante" ${offset === 0 ? "disabled" : ""}>${icon("chevron")}</button></div>
      <h2 id="wk-title" class="wk-title">${esc(h.title)}</h2>
      <p class="asc-lead">${esc(h.text)}</p>
      <dl class="wk-stats">
        <div><dt>Jours actifs</dt><dd class="asc-num">${w.activeDays}<small>/${settings.target}</small></dd></div>
        <div><dt>Temps</dt><dd class="asc-num">${w.minutes ? esc(F().duration(w.minutes)) : "—"}</dd></div>
        ${w.distance ? `<div><dt>Distance</dt><dd class="asc-num">${esc(F().distance(w.distance))}</dd></div>` : `<div><dt>Séances</dt><dd class="asc-num">${w.sessions}</dd></div>`}
      </dl>
      ${dayStrip(r)}
      ${w.estimatedMinutes ? `<p class="asc-small asc-faint">Dont ${esc(F().duration(w.estimatedMinutes))} estimées pour des séances sans durée.</p>` : ""}
      ${w.sessions && window.TitanCard ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm wk-card" data-week-card>${icon("share")} Image de ma semaine</button>` : ""}
    </section>`;
  }

  function weekCard() {
    const r = recapFor(offset);
    const settings = D().cadenceSettings();
    const h = headline(r, settings.target);
    const w = r.week;
    window.TitanCard.open({
      kind: "week",
      eyebrow: `Semaine du ${r.from.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`,
      title: h.title,
      detail: h.text,
      stats: [["Jours actifs", `${w.activeDays}/${settings.target}`], ["Temps", w.minutes ? F().duration(w.minutes) : "—"], w.distance ? ["Distance", F().distance(w.distance)] : ["Séances", String(w.sessions)]],
      days: perDay(r).map((d) => d.minutes),
      name: window.TitanCard.userName(),
      filename: "titan-semaine",
    });
  }

  function highlightsHtml(r) {
    const items = [];
    if (r.topSport && r.week.sessions) items.push(`<div class="asc-row"><span class="asc-row-icon" data-family="${esc(SP().familyOf(r.topSport.sport))}">${icon(SP().FAMILY_ICON[SP().familyOf(r.topSport.sport)])}</span><span class="asc-row-main"><span class="asc-row-title">${esc(r.topSport.label)}</span><span class="asc-row-sub">Ton sport de la semaine · ${r.topSport.sessions} séance${r.topSport.sessions > 1 ? "s" : ""}${r.topSport.minutes ? `, ${esc(F().duration(r.topSport.minutes))}` : ""}</span></span></div>`);
    for (const rec of r.records.filter((x) => x.kind !== "duration").slice(0, 4))
      items.push(`<a class="asc-row" href="/journal?session=${encodeURIComponent(window.TitanSessions?.idOf(rec.log) || rec.log.id)}"><span class="asc-row-icon am">${icon("star")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(SP().label(rec.sport))} · ${esc(rec.label)}</span><span class="asc-row-sub">${esc(fmtRecord(rec))}${rec.previous ? ` · avant ${esc(fmtRecord(rec, rec.previous.value))}` : " · premier repère"}</span></span>${icon("chevron")}</a>`);
    for (const g of r.goals.slice(0, 3))
      items.push(`<a class="asc-row" href="/objectifs"><span class="asc-row-icon">${icon(g.completedThisWeek ? "check" : "flag")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(g.goal.title)}</span><span class="asc-row-sub">${g.completedThisWeek ? "Objectif atteint cette semaine" : `${Math.round(g.ratio * 100)} % · +${esc(F().number(g.value - g.before, 1))} cette semaine`}</span></span>${icon("chevron")}</a>`);
    if (!items.length) return "";
    return `<section class="asc-section"><div class="asc-section-head"><h2>Ce qui a compté</h2></div><div class="asc-list">${items.join("")}</div></section>`;
  }

  const fmtRecord = (r, value = r.value) => F().recordValue(r.unit, value);

  /* ---------- Questions ---------- */
  function card(q, answer, body, basis) {
    return `<article class="wk-q"><h3>${esc(q)}</h3><p class="wk-answer">${answer}</p>${body}${basis ? `<p class="asc-small asc-faint wk-basis">${esc(basis)}</p>` : ""}</article>`;
  }

  function bars(values, { labels = [], highlightLast = true, format = (v) => v } = {}) {
    const max = Math.max(1, ...values);
    return `<div class="wk-chart" role="img" aria-label="${esc(values.map((v, i) => `${labels[i] || ""} ${format(v)}`).join(", "))}">${values
      .map((v, i) => `<span class="wk-col${highlightLast && i === values.length - 1 ? " is-last" : ""}"><span class="wk-col-bar" style="--h:${Math.round((v / max) * 100)}%"></span>${labels[i] ? `<span class="wk-col-l">${esc(labels[i])}</span>` : ""}</span>`)
      .join("")}</div>`;
  }

  function qVolume() {
    const series = Q().weeklySeries(logs(), { weeks: 12 });
    if (!series.some((w) => w.sessions)) return "";
    const t = Q().volumeTrend(series);
    const answer = !t
      ? "Encore quelques semaines et la tendance sera fiable : il en faut huit complètes."
      : t.direction === "up"
        ? `<strong>Oui.</strong> ${esc(F().duration(t.recent))} par semaine sur le dernier mois, contre ${esc(F().duration(t.before))} le mois d’avant.`
        : t.direction === "down"
          ? `<strong>Un peu moins.</strong> ${esc(F().duration(t.recent))} par semaine sur le dernier mois, contre ${esc(F().duration(t.before))} avant. Une baisse peut être voulue : récupération, saison, vie.`
          : t.direction === "new"
            ? "Tu as repris récemment : la comparaison démarre."
            : `<strong>Au même niveau.</strong> Autour de ${esc(F().duration(t.recent))} par semaine depuis deux mois.`;
    return card(
      "Est-ce que je m’entraîne plus qu’avant ?",
      answer,
      bars(
        series.map((w) => w.minutes),
        { labels: series.map((w, i) => (i % 3 === 0 || w.current ? w.start.toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" }) : "")), format: (v) => F().duration(v) },
      ),
      "Minutes par semaine sur 12 semaines ; la dernière colonne est la semaine en cours.",
    );
  }

  function qShare() {
    const f = Q().familyShare(logs(), { days: 84 });
    if (!f.sessions) return "";
    const fam = f.families[0];
    const answer = `<strong>${esc(SP().FAMILY_LABEL[fam.id] || fam.id)}</strong> occupe ${Math.round(fam.share * 100)} % de ton temps sur 12 semaines${f.families.length > 1 ? `, puis ${esc((SP().FAMILY_LABEL[f.families[1].id] || f.families[1].id).toLowerCase())} (${Math.round(f.families[1].share * 100)} %)` : ""}.`;
    const stack = `<div class="wk-stack" role="img" aria-label="${esc(f.families.map((x) => `${SP().FAMILY_LABEL[x.id] || x.id} ${Math.round(x.share * 100)} %`).join(", "))}">${f.families.map((x) => `<span data-family="${esc(x.id)}" style="--w:${(x.share * 100).toFixed(1)}%"></span>`).join("")}</div>
      <ul class="wk-legend">${f.families.map((x) => `<li data-family="${esc(x.id)}"><i></i>${esc(SP().FAMILY_LABEL[x.id] || x.id)} <span class="asc-faint">${esc(F().duration(x.minutes))}</span></li>`).join("")}</ul>
      <ol class="wk-top">${f.sports.map((s) => `<li><span>${esc(s.label)}</span><span class="asc-muted asc-num">${s.sessions} · ${esc(F().duration(s.minutes))}</span></li>`).join("")}</ol>`;
    return card("Où va mon temps ?", answer, stack, "Temps déclaré ou estimé par famille de sports, 12 dernières semaines.");
  }

  function qPace() {
    const p = Q().paceTrend(logs());
    if (!p || !p.points.length) return "";
    const label = SP().label(p.sport);
    const fmtPace = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
    if (!p.enough) return card(`Est-ce que j’avance en ${label.toLowerCase()} ?`, "Il faut au moins deux mois avec deux sorties de 3 km ou plus pour répondre sans se tromper.", "", "Allure médiane mensuelle des séances de 3 km et plus.");
    const d = p.delta;
    const answer = Math.abs(d) < 3 ? `<strong>Stable</strong> : allure médiane autour de ${fmtPace(p.last.pace)} /km.` : d < 0 ? `<strong>Oui.</strong> Ton allure médiane passe de ${fmtPace(p.first.pace)} à ${fmtPace(p.last.pace)} /km (${p.first.label} → ${p.last.label}).` : `<strong>Allure plus lente</strong> : ${fmtPace(p.first.pace)} → ${fmtPace(p.last.pace)} /km. Sorties plus longues, plus de dénivelé ou plus faciles ? Le contexte compte.`;
    const max = Math.max(...p.points.map((x) => x.pace));
    const min = Math.min(...p.points.map((x) => x.pace));
    // Faster = taller bar.
    const values = p.points.map((x) => (max === min ? 1 : 0.25 + (0.75 * (max - x.pace)) / (max - min)));
    return card(`Est-ce que j’avance en ${label.toLowerCase()} ?`, answer, bars(values, { labels: p.points.map((x) => x.label), format: (v) => "" }) + `<p class="asc-small asc-muted wk-values">${p.points.map((x) => `${esc(x.label)} ${fmtPace(x.pace)}`).join(" · ")}</p>`, "Allure médiane par mois, séances de 3 km et plus. Une barre plus haute est plus rapide.");
  }

  function qStrength() {
    const s = Q().strengthTrend(logs());
    if (!s || !s.points.length) return "";
    const answer = !s.enough ? `Ton exercice le plus pratiqué est <strong>${esc(s.name)}</strong>. Encore un mois de données pour voir l’évolution.` : s.delta > 0 ? `<strong>Oui.</strong> ${esc(s.name)} : charge maximale de ${esc(F().number(s.points[0].weight))} à ${esc(F().number(s.points[s.points.length - 1].weight))} kg.` : s.delta === 0 ? `<strong>Stable</strong> sur ${esc(s.name)} : ${esc(F().number(s.points[0].weight))} kg. Répétitions et volume peuvent progresser sans changer la charge.` : `${esc(s.name)} : charge maximale en baisse (${esc(F().number(s.points[0].weight))} → ${esc(F().number(s.points[s.points.length - 1].weight))} kg). Cycle plus léger ou reprise ?`;
    return card("Est-ce que je deviens plus fort ?", answer, s.points.length ? bars(s.points.map((x) => x.weight), { labels: s.points.map((x) => x.label), format: (v) => `${v} kg` }) : "", `Charge la plus lourde déclarée par mois sur ${s.name}${s.variant ? ` (${s.variant})` : ""}. Ce n’est pas un 1RM estimé.`);
  }

  function qClimb() {
    const c = Q().climbingTrend(logs());
    if (!c || !c.points.length) return "";
    const last = c.points[c.points.length - 1];
    const answer = !c.enough ? `Meilleure réussite récente : <strong>${esc(last.grade)}</strong> (${esc(c.system)}).` : c.up ? `<strong>Oui.</strong> De ${esc(c.points[0].grade)} à ${esc(last.grade)} en ${esc(c.system)}.` : `Meilleure réussite stable autour de <strong>${esc(last.grade)}</strong> (${esc(c.system)}).`;
    return card("Est-ce que je grimpe plus dur ?", answer, `<ol class="wk-grades">${c.points.map((p) => `<li><span class="asc-faint">${esc(p.label)}</span><strong>${esc(p.grade)}</strong></li>`).join("")}</ol>`, "Meilleure cotation réussie par mois, comparée dans un seul système.");
  }

  function qLoad() {
    const l = Q().load(logs());
    if (!l) return "";
    if (!l.enough)
      return card("Ma semaine est-elle plus chargée que d’habitude ?", "Renseigne ton ressenti (RPE) sur la plupart de tes séances : TITAN pourra comparer ta charge avec tes semaines habituelles.", "", "Charge = durée × ressenti. Il faut un ressenti sur au moins 60 % des séances.");
    const pct = Math.round(l.ratio * 100);
    const answer = l.level === "high" ? `<strong>Oui, nettement</strong> : ${pct} % de ta charge habituelle. Si la fatigue s’accumule, une journée plus calme aide à absorber le travail.` : l.level === "low" ? `<strong>Plus légère</strong> : ${pct} % de ta charge habituelle.` : `<strong>Dans ta zone habituelle</strong> : ${pct} % de ta moyenne des 4 semaines précédentes.`;
    return card("Ma semaine est-elle plus chargée que d’habitude ?", answer, `<div class="wk-gauge" role="img" aria-label="${pct} % de la charge habituelle"><span style="--p:${Math.min(100, Math.round((l.ratio / 2) * 100))}%"></span><i style="--p:50%"></i></div>`, "Durée × ressenti de la semaine en cours, comparée à la moyenne des 4 semaines précédentes. Repère d’entraînement, pas un avis médical.");
  }

  function qCadence() {
    const s = D().cadenceSettings();
    const c = P().cadence(logs(), { target: s.target, pauses: s.pauses });
    if (!c.lifetimeHeld && !c.currentDays) return "";
    const notches = c.weeks.map((w) => `<span class="asc-notch" data-state="${w.state}" style="--fill:${w.fill}%"></span>`).join("");
    return card("Combien de semaines ai-je tenues ?", `<strong>${c.held} sur ${c.window}</strong> ces 8 dernières semaines, ${c.lifetimeHeld} depuis le début.`, `<div class="asc-notches" aria-hidden="true">${notches}</div>`, `Une semaine est tenue avec ${s.target} jour${s.target > 1 ? "s" : ""} actif${s.target > 1 ? "s" : ""}. Les semaines en pause ne comptent pas.`);
  }

  function render() {
    if (!root) return;
    const r = recapFor(offset);
    const questions = [qVolume(), qShare(), qPace(), qStrength(), qClimb(), qLoad(), qCadence()].filter(Boolean);
    const any = P().activeLogs(logs()).length > 0;
    root.innerHTML = `${heroHtml(r)}${highlightsHtml(r)}
      ${any ? `<section class="asc-section"><div class="asc-section-head"><h2>Tes questions</h2></div><div class="wk-questions">${questions.join("")}</div></section>` : `<div class="asc-empty"><h2>Tes statistiques répondront à de vraies questions</h2><p>Est-ce que je progresse ? Où va mon temps ? Ma semaine est-elle chargée ? Les réponses arrivent avec tes séances.</p><a class="asc-btn asc-btn-primary" href="/training">${icon("plus")} Enregistrer une séance</a></div>`}`;
    root.setAttribute("aria-busy", "false");
  }

  async function loadGoals() {
    try {
      goalsCache = (await D().goals()) || [];
    } catch {
      goalsCache = [];
    }
    render();
  }

  let booted = false;
  function start() {
    root = document.getElementById("semaine");
    if (!root || !window.state?.user || !window.TitanQuestions) return;
    if (!booted) {
      booted = true;
      SP().ensure();
      root.addEventListener("click", (e) => {
        if (e.target.closest("[data-week-card]")) return weekCard();
        const b = e.target.closest("[data-week]");
        if (!b || b.disabled) return;
        offset = Math.max(0, Number(b.dataset.week));
        render();
        root.querySelector(".wk-title")?.focus?.();
      });
      window.TitanAnalytics?.track("weekly_recap_viewed");
      loadGoals();
    }
    render();
  }
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      start();
    });
  };
  ["titan:history-updated", "titan:adventure-updated"].forEach((ev) => window.addEventListener(ev, queue));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
