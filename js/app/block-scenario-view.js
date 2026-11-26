/* V1.7.6 — Scénarios multisports in Séance › Prévoir: two private variants of a few weeks compared side by side on what the plan
   gives (time per sport, free days, overlaps, milestones that move), the athlete's availability for a week (reduced or a pause), and
   the chosen variant applied from an explicit Monday through a preview, then undone. In Progrès › Semaine: the decision read again at
   the bilan. Rules and words: js/core/block-scenario.js (same module on Android). A draft never changes the active programme; applying
   and undoing go through a preview, and « Annuler » writes nothing. A session is never changed here. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;
  const WP = () => window.TitanWeekPlan;
  const BS = () => window.TitanBlockScenario;
  const label = (s) => SP().label(s);
  const dateOf = (k) => new Date(`${k}T12:00:00`);
  const dayLong = (k) => (k ? dateOf(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
  const dayShort = (k) => (k ? dateOf(k).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
  const today = () => F().dateKey(new Date());
  const NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const words = { label, dayLong };
  const ERRORS = {
    SCENARIO_OUTSIDE_BLOCK: "Ces semaines sont à cheval sur un bloc : choisis des semaines toutes dans le bloc ou toutes hors bloc.",
    SCENARIO_WEEK_STARTED: "Cette semaine a déjà commencé : elle garde son programme. Choisis une semaine à venir.",
    SCENARIO_BAD_FROM: "Choisis un lundi de la période comparée.",
    SCENARIO_ALREADY_APPLIED: "Un scénario est déjà appliqué : annule-le d’abord.",
    SCENARIO_BASE_CHANGED: "Le bloc a changé depuis la comparaison : crée une nouvelle comparaison.",
    SCENARIO_BLOCK_OVERLAP: "Un bloc occupe déjà une de ces semaines.",
    SCENARIO_CHANGED_SINCE: "Le bloc a été modifié après l’application : ce changement plus récent est gardé. Modifie le bloc directement.",
    SCENARIO_UNDO_CLOSED: "Toutes les semaines du scénario ont commencé : il n’y a plus rien à annuler.",
    SCENARIO_NOTHING_TO_UNDO: "Ce scénario n’est pas appliqué.",
    SCENARIO_TITLE_REQUIRED: "Donne un nom.",
    SCENARIO_BAD_LENGTH: "Une comparaison couvre de 2 à 8 semaines.",
    SCENARIO_LIMIT: "Tu as déjà 6 comparaisons : range celles dont tu n’as plus besoin.",
    SCENARIO_APPLIED: "Annule d’abord l’application de ce scénario.",
  };
  const errorText = (e) => ERRORS[e?.message] || "Ce changement n’est pas possible pour ce scénario.";
  const letter = (k) => BS().LETTER[k];

  /* ---------- Séance › Prévoir: the comparisons ---------- */

  function table(c, w) {
    const th = (t, k) => `<th scope="col"${k ? ` data-col="${k}"` : ""}>${esc(t)}</th>`;
    const row = (name, x, attr = "") => `<tr ${attr}><th scope="row">${esc(name)}</th><td>${esc(x.active)}</td><td data-col="a">${esc(x.a)}</td><td data-col="b">${esc(x.b)}</td><td data-col="delta">${esc(x.delta)}</td></tr>`;
    return `<div class="bs-table-wrap"><table class="bs-table" data-scenario-table lang="fr">
      <caption class="sr-only">Écarts calculés à partir des plans, sur ${esc(c.count)} semaines</caption>
      <thead><tr>${th("")}${th("Actif")}${th(`A · ${w.names.a}`, "a")}${th(`B · ${w.names.b}`, "b")}${th("Écart B − A", "delta")}</tr></thead>
      <tbody>
        ${w.sports.map((s) => row(s.label, s, `data-sport="${esc(s.sport)}"`)).join("")}
        ${row("Temps planifié", w.total, 'data-row="total" class="bs-strong"')}
        ${row("Jours libres", w.free, 'data-row="free"')}
        ${row("Chevauchements", { active: String(c.conflicts.active), a: String(c.conflicts.a), b: String(c.conflicts.b), delta: c.conflicts.b === c.conflicts.a ? "=" : `${c.conflicts.b > c.conflicts.a ? "+" : "−"}${Math.abs(c.conflicts.b - c.conflicts.a)}` }, 'data-row="conflicts"')}
        ${row("Jalons déplacés", { active: "—", a: String(c.moved.a), b: String(c.moved.b), delta: c.moved.b === c.moved.a ? "=" : `${c.moved.b > c.moved.a ? "+" : "−"}${Math.abs(c.moved.b - c.moved.a)}` }, 'data-row="moved"')}
      </tbody></table></div>`;
  }

  function weeksHtml(c, w, editable) {
    return `<ol class="bs-weeks" aria-label="Semaines comparées">${w.weeks.map((x, i) => {
      const av = c.availability[i];
      const acts = editable ? `<span class="bs-week-acts">
          <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-sc-act="avail" data-scenario-id="${esc(c.id)}" data-week="${i}" aria-label="${esc(`Disponibilités de la ${x.title.toLowerCase()}`)}">${icon("calendar")} Disponibilités</button>
          ${av.days ? BS().KEYS.map((k) => (c.plans[k].conflicts.some((y) => y.week === x.week && y.kind !== "decision") ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-sc-act="fit" data-scenario-id="${esc(c.id)}" data-variant="${k}" data-week="${i}">Adapter ${letter(k)}</button>` : "")).join("") : ""}
        </span>` : "";
      return `<li class="bs-week" data-sc-week="${i}" data-week="${esc(x.week)}"${av.pause ? ' data-pause="true"' : av.days ? ' data-reduced="true"' : ""}>
        <span class="tb-week-head"><strong>${esc(x.title)}</strong>${x.availability ? `<span class="sig-state${av.pause ? "" : " is-locked"}">${icon(av.pause ? "moon" : "info")} ${esc(x.availability)}</span>` : ""}</span>
        <span class="asc-small asc-muted" data-plan="active">Actif : ${esc(x.active)}</span>
        <span class="asc-small" data-plan="a"><strong>A</strong> : ${esc(x.a)}</span>
        <span class="asc-small" data-plan="b"><strong>B</strong> : ${esc(x.b)}</span>
        ${acts}
      </li>`;
    }).join("")}</ol>`;
  }

  function card(c) {
    const w = BS().describeComparison(c, words);
    const ap = c.applied;
    const live = ap && !ap.undone;
    const status = !ap ? "Brouillon privé : ton programme actif ne change pas tant que tu n’appliques pas une variante."
      : live ? `« ${ap.name} » appliqué le ${dayLong(String(ap.at).slice(0, 10))} à partir du ${dayLong(ap.from)}.`
      : `« ${ap.name} » appliqué le ${dayLong(String(ap.at).slice(0, 10))}, annulé le ${dayLong(String(ap.undone.at).slice(0, 10))} : le programme d’avant est revenu à partir du ${dayLong(ap.undone.from)}.`;
    const editable = !live;
    const act = (kind, text, primary, extra = "") => `<button type="button" class="asc-btn ${primary ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm" data-sc-act="${kind}" data-scenario-id="${esc(c.id)}" ${extra}>${esc(text)}</button>`;
    const conflicts = (k) => (w.conflicts[k].length ? `<ul class="bs-list" data-conflicts="${k}">${w.conflicts[k].map((x) => `<li class="asc-small">${esc(x)}</li>`).join("")}</ul>` : `<p class="asc-small asc-muted" data-conflicts="${k}">Aucun chevauchement.</p>`);
    return `<article class="tb-card bs-card" data-scenario="${esc(c.id)}" data-applied="${live ? ap.variant : ""}" aria-labelledby="bs-title-${esc(c.id)}">
      <div class="asc-between"><span class="asc-chip">${live ? `${icon("check")} Scénario ${esc(letter(ap.variant))} appliqué` : "Comparaison"}</span><span class="asc-small asc-muted">du ${esc(dayShort(c.start))} au ${esc(dayShort(c.end))}</span></div>
      <h3 id="bs-title-${esc(c.id)}" tabindex="-1">${esc(c.title)}</h3>
      <p class="asc-small" data-scenario-status>${esc(status)}</p>
      <p class="asc-small asc-muted">${esc(w.planned)}</p>
      ${w.same.map((x) => `<p class="asc-note" role="note">${icon("info")}<span>${esc(x)}</span></p>`).join("")}
      ${table(c, w)}
      <h4 class="asc-small tb-sub">Semaine par semaine</h4>
      ${weeksHtml(c, w, editable)}
      <h4 class="asc-small tb-sub">Chevauchements</h4>
      <div class="bs-cols"><div><p class="asc-small"><strong>A · ${esc(w.names.a)}</strong></p>${conflicts("a")}</div><div><p class="asc-small"><strong>B · ${esc(w.names.b)}</strong></p>${conflicts("b")}</div></div>
      ${w.milestones.length ? `<h4 class="asc-small tb-sub">Jalons</h4><ul class="bs-list" data-scenario-milestones>${w.milestones.map((m) => `<li class="asc-small" data-milestone="${esc(m.id)}"><strong>${esc(m.title)}</strong> · actif : ${esc(m.active)} · A : ${esc(m.a)} · B : ${esc(m.b)}</li>`).join("")}</ul>` : ""}
      ${w.fields.length ? `<h4 class="asc-small tb-sub">À renseigner</h4><ul class="bs-list" data-scenario-fields>${w.fields.map((x) => `<li class="asc-small">${esc(x)}</li>`).join("")}</ul>` : ""}
      <details class="tb-log" data-scenario-observed><summary>${esc(w.observed.title)}</summary><ul>${w.observed.lines.map((x) => `<li class="asc-small">${esc(x)}</li>`).join("")}</ul><p class="asc-small asc-faint">Observations passées : elles décrivent ce qui a été fait et ne servent à aucune estimation.</p></details>
      <details class="tb-log" data-scenario-hypotheses><summary>Hypothèses du calcul</summary><ul>${c.hypotheses.map((x) => `<li class="asc-small">${esc(x)}</li>`).join("")}</ul></details>
      <div class="tb-actions" role="group" aria-label="${esc(`Actions sur ${c.title}`)}">
        ${editable ? `${act("edit", `Modifier A`, false, 'data-variant="a"')}${act("edit", `Modifier B`, false, 'data-variant="b"')}${act("apply", `Appliquer A…`, false, 'data-variant="a"')}${act("apply", `Appliquer B…`, false, 'data-variant="b"')}${act("discard", "Ranger", false)}` : act("undo", "Annuler l’application…", true)}
      </div>
      <p class="asc-small asc-faint">${esc(BS().RULES.draft)} ${esc(BS().RULES.apply)} ${esc(BS().RULES.undo)}</p>
    </article>`;
  }

  /** The section of Séance › Prévoir. */
  function html() {
    if (!BS() || !D().scenarios) return "";
    const list = D().scenarios();
    const cards = list.map((s) => { try { return card(D().scenarioCompare(s.id)); } catch { return ""; } }).join("");
    return `<section class="asc-section bs-section" id="scenarios" data-scenarios aria-labelledby="bs-section-title">
      <div class="asc-section-head"><h2 id="bs-section-title">Comparer deux scénarios</h2><button type="button" class="asc-btn asc-btn-primary asc-btn-sm" data-sc-act="create">${icon("plus")} Nouvelle comparaison</button></div>
      ${cards || `<div class="sig-empty">${icon("calendar")}<h3>Hésites entre deux façons de t’organiser ?</h3><p>Compare deux variantes de tes prochaines semaines : temps par sport, jours libres, chevauchements et jalons. Ton programme ne change que si tu appliques l’une d’elles.</p></div>`}
    </section>`;
  }

  /* ---------- The sheets ---------- */

  let dialog = null;
  function sportsFor(c) {
    const typ = WP().typeDays(window.state?.user?.schedule || {}).filter(Boolean).map((d) => d.sport);
    const inPlans = c ? Object.keys({ ...c.plans.active.sports, ...c.plans.a.sports, ...c.plans.b.sports }) : [];
    const recent = (window.state?.history || []).slice(-80).map((l) => l.sport);
    return [...new Set([...inPlans, ...typ, ...recent, ...SP().POPULAR])].filter((s) => window.SPORTS_CONFIG?.[s]).slice(0, 24);
  }
  const options = (list, on, extra = "") => `${extra}${list.map((s) => `<option value="${esc(s)}"${s === on ? " selected" : ""}>${esc(label(s))}</option>`).join("")}`;
  const chip = (attr, value, text, on, disabled) => `<button type="button" class="seance-chip" ${attr}="${esc(value)}" aria-pressed="${!!on}"${disabled ? " disabled" : ""}>${esc(text)}</button>`;

  function previewHtml(pv, error) {
    if (!pv) return `<section class="tb-preview" data-sc-preview aria-live="polite"><h3 class="asc-small">Aperçu</h3><p class="asc-small" role="alert" data-sc-error>${esc(error || "")}</p></section>`;
    const w = BS().describePreview(pv, words);
    return `<section class="tb-preview" data-sc-preview aria-live="polite"><h3 class="asc-small">Aperçu</h3>
      <ul data-preview-lines>${w.lines.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${w.notes.map((x) => `<p class="asc-small" data-preview-note>${esc(x)}</p>`).join("")}
      <p class="asc-small asc-muted" data-preview-where>${esc(w.where)}</p></section>`;
  }

  function open(kind, id, opener, preset = {}) {
    if (dialog?.open || !BS()) return;
    const owner = D().owner();
    const base = window.state?.user?.schedule || {};
    let c = null;
    if (id) { try { c = D().scenarioCompare(id); } catch { return; } }
    const t = today();
    const open0 = window.TitanTrainingBlock.firstOpen(base, t);
    const s = { title: "", start: open0, count: 4, a: "", b: "", variant: preset.variant || "a", week: 0, from: c ? (c.weeks.find((m) => m >= c.open) || c.weeks[0]) : null, days: null, pause: false, draft: null, ...preset };
    if (kind === "avail" && c) { const av = c.availability[s.week]; s.days = av.days ? av.days.slice() : [true, true, true, true, true, true, true]; s.pause = !!av.pause; }
    if (kind === "edit") { s.draft = JSON.parse(JSON.stringify(base)); s.week = "all"; }
    const body = document.createElement("div");
    body.className = "asc-stack tb-sheet bs-sheet";
    body.dataset.scenarioSheet = kind;
    const opts = () => ({ ...D().blockOptions(), at: new Date().toISOString() });

    const compute = () => {
      try {
        if (kind === "create") { const r = BS().create(base, { title: s.title, start: s.start, count: s.count, names: { a: s.a, b: s.b } }, opts()); return { r }; }
        if (kind === "apply") { const r = BS().apply(base, opts().logs, id, { variant: s.variant, from: s.from }, opts()); return { r, pv: r.preview }; }
        if (kind === "undo") { const r = BS().undo(base, opts().logs, id, opts()); return { r, pv: r.preview }; }
        if (kind === "avail") { const r = BS().setAvailability(base, id, { week: s.week, days: s.days, pause: s.pause }, opts()); return { r }; }
        if (kind === "discard") { const r = BS().discard(base, id, opts()); return { r }; }
        if (kind === "edit") return { r: { schedule: s.draft } };
      } catch (e) { return { error: errorText(e) }; }
      return {};
    };

    const formHtml = (res) => {
      if (kind === "create") {
        const mondays = Array.from({ length: 8 }, (_, i) => WP().addDays(open0, 7 * i));
        let start = "";
        try { const sc = res.r?.scenario; if (sc) start = `<section class="tb-preview" data-sc-preview><h3 class="asc-small">Aperçu</h3><p class="asc-small">Les deux variantes partent de ton programme actif${sc.base ? ` (bloc « ${esc(base.blocks?.[sc.base]?.title || "")} »)` : " (ta semaine type)"} : tu les modifies ensuite, ton programme ne change pas.</p><p class="asc-small asc-muted" data-preview-where>Du ${esc(dayLong(sc.start))} au ${esc(dayLong(WP().addDays(sc.start, 7 * sc.count - 1)))}.</p></section>`; } catch {}
        return `<div class="asc-form-grid">
            <label class="asc-field"><span>Nom de la comparaison</span><input class="asc-input" name="title" maxlength="80" value="${esc(s.title)}" placeholder="Vélo ou badminton"></label>
            <label class="asc-field"><span>Nombre de semaines</span><input class="asc-input" type="number" inputmode="numeric" min="2" max="8" name="count" value="${esc(s.count)}"></label>
            <label class="asc-field"><span>Nom de la variante A</span><input class="asc-input" name="a" maxlength="40" value="${esc(s.a)}" placeholder="Deux sorties longues"></label>
            <label class="asc-field"><span>Nom de la variante B</span><input class="asc-input" name="b" maxlength="40" value="${esc(s.b)}" placeholder="Une longue et une courte"></label>
          </div>
          <fieldset class="wr-field"><legend class="asc-small">À partir de la semaine du</legend><div class="seance-chips">${mondays.map((m) => chip("data-start", m, dayShort(m), m === s.start)).join("")}</div></fieldset>
          ${start || previewHtml(null, res.error)}`;
      }
      if (kind === "apply") {
        const weeks = c.weeks;
        return `<fieldset class="wr-field"><legend class="asc-small">Variante</legend><div class="seance-chips">${BS().KEYS.map((k) => chip("data-variant-pick", k, `${letter(k)} · ${c.plans[k].name}`, k === s.variant)).join("")}</div></fieldset>
          <fieldset class="wr-field"><legend class="asc-small">À partir du lundi</legend><div class="seance-chips">${weeks.map((m) => chip("data-from", m, dayShort(m), m === s.from, m < c.open)).join("")}</div>
          <p class="asc-small asc-muted">Les semaines avant cette date gardent leur programme. Une semaine commencée ne change jamais.</p></fieldset>
          ${previewHtml(res.pv, res.error)}`;
      }
      if (kind === "undo") return previewHtml(res.pv, res.error);
      if (kind === "discard") return `<p class="asc-small">Ranger « ${esc(c.title)} » ? Les deux brouillons ne seront plus affichés. Ton programme ne change pas.</p>${res.error ? previewHtml(null, res.error) : ""}`;
      if (kind === "avail") {
        return `<p class="asc-small">${esc(`Semaine du ${dayLong(c.weeks[s.week])}`)} : coche les jours où tu peux t’entraîner.</p>
          <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-pause aria-pressed="${s.pause}">${icon("moon")} ${s.pause ? "Semaine en pause" : "Mettre cette semaine en pause"}</button>
          <div class="seance-chips" role="group" aria-label="Jours disponibles">${NAMES.map((n, j) => chip("data-avail-day", j, n, !s.pause && s.days[j], s.pause)).join("")}</div>
          <p class="asc-small asc-muted">Les créneaux prévus un jour indisponible sont signalés comme chevauchements. « Adapter » libère ces jours dans une variante, si tu le choisis.</p>
          ${res.error ? previewHtml(null, res.error) : ""}`;
      }
      if (kind === "edit") {
        let cmp = null;
        try { cmp = BS().compare(s.draft, opts().logs, id, opts()); } catch {}
        const v = s.draft.scenarios[id].variants[s.variant];
        const wi = s.week === "all" ? 0 : s.week;
        const list = sportsFor(cmp || c);
        const sum = cmp ? BS().describeComparison(cmp, words) : null;
        const ms = Object.values(s.draft.scenarios[id].milestones || {});
        return `<label class="asc-field"><span>Nom de la variante</span><input class="asc-input" name="vname" maxlength="40" value="${esc(v.name)}"></label>
          <fieldset class="wr-field"><legend class="asc-small">Semaine</legend><div class="seance-chips">${chip("data-edit-week", "all", "Toutes les semaines", s.week === "all")}${c.weeks.map((m, i) => chip("data-edit-week", i, dayShort(m), s.week === i)).join("")}</div>
            ${s.week === "all" ? '<p class="asc-small asc-muted">Un jour changé ici change ce jour dans chaque semaine de la variante.</p>' : ""}</fieldset>
          <div class="tb-days">${NAMES.map((n, j) => { const d = v.weeks[wi].days[j]; return `<div class="tb-day-row"><span class="asc-small">${n}</span><label class="sr-only" for="bs-d${j}">${n} : sport</label><select class="asc-input" id="bs-d${j}" data-day-sport="${j}">${options(list, d?.sport, `<option value=""${!d ? " selected" : ""}>Libre</option>`)}</select><label class="sr-only" for="bs-m${j}">${n} : minutes</label><input class="asc-input" id="bs-m${j}" type="number" inputmode="numeric" min="5" max="600" step="5" placeholder="min" data-day-minutes="${j}" value="${esc(d?.minutes || "")}"${d ? "" : " disabled"}></div>`; }).join("")}</div>
          ${ms.length ? `<fieldset class="wr-field"><legend class="asc-small">Jalons dans cette variante</legend>${ms.map((m) => `<label class="asc-field"><span>${esc(m.title)}</span><select class="asc-input" data-place="${esc(m.id)}"><option value=""${v.place?.[m.id] === null ? " selected" : ""}>Hors de la variante</option>${c.weeks.map((wk, i) => `<option value="${i}"${v.place?.[m.id] === i ? " selected" : ""}>Semaine du ${esc(dayShort(wk))}</option>`).join("")}</select></label>`).join("")}</fieldset>` : ""}
          ${sum ? `<section class="tb-preview" data-sc-preview aria-live="polite"><h3 class="asc-small">Ce que donne la variante</h3><ul>${sum.sports.map((r) => `<li>${esc(r.label)} : ${esc(r[s.variant])} (actif ${esc(r.active)})</li>`).join("")}<li>${esc(sum.free[s.variant])} · ${esc(String(cmp.conflicts[s.variant]))} chevauchement${cmp.conflicts[s.variant] > 1 ? "s" : ""}</li></ul><p class="asc-small asc-muted" data-preview-where>Brouillon : ton programme actif ne change pas.</p></section>` : ""}`;
      }
      return "";
    };

    const confirmText = { create: "Créer les deux brouillons", apply: `Appliquer « ${c?.plans?.[s.variant]?.name || ""} »`, undo: "Annuler l’application", avail: "Enregistrer", discard: "Ranger", edit: "Enregistrer le brouillon" };
    const draw = (focus) => {
      const res = compute();
      const okText = kind === "apply" ? `Appliquer « ${c.plans[s.variant].name} »` : confirmText[kind];
      body.innerHTML = `${formHtml(res)}
        <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-sc-cancel>Annuler</button><button type="button" class="asc-btn ${kind === "undo" || kind === "discard" ? "asc-btn-danger" : "asc-btn-primary"}" data-sc-confirm ${res.r ? "" : "disabled"}>${esc(okText)}</button></div>
        <p class="asc-small jr-edit-error" role="alert" hidden></p>`;
      if (focus) body.querySelector(focus)?.focus({ preventScroll: true });
    };
    draw();
    const titles = { create: "Nouvelle comparaison", apply: "Appliquer un scénario", undo: "Annuler l’application", avail: "Disponibilités", discard: "Ranger la comparaison", edit: `Modifier la variante ${letter(s.variant)}` };
    dialog = window.titanShell.sheet({ title: titles[kind], eyebrow: c ? c.title : "Scénarios", body, onClose: () => { dialog = null; if (opener?.isConnected) opener.focus({ preventScroll: true }); } });
    const d = dialog;
    const draftEdit = (fn) => { try { s.draft = fn(s.draft); } catch (e) { const x = body.querySelector(".jr-edit-error"); if (x) { x.textContent = errorText(e); x.hidden = false; } } };
    body.addEventListener("change", (e) => {
      const el = e.target;
      if (!d.open) return;
      if (kind === "edit" && el.dataset.daySport !== undefined) {
        const j = Number(el.dataset.daySport);
        const cur = s.draft.scenarios[id].variants[s.variant].weeks[s.week === "all" ? 0 : s.week].days[j];
        draftEdit((sch) => BS().setDay(sch, id, { variant: s.variant, week: s.week, day: j, value: el.value ? { sport: el.value, minutes: cur?.sport === el.value ? cur.minutes : cur?.minutes || null, note: cur?.note || "" } : null }, opts()).schedule);
        draw(`#bs-d${j}`); return;
      }
      if (kind === "edit" && el.dataset.dayMinutes !== undefined) {
        const j = Number(el.dataset.dayMinutes);
        const cur = s.draft.scenarios[id].variants[s.variant].weeks[s.week === "all" ? 0 : s.week].days[j];
        if (cur) draftEdit((sch) => BS().setDay(sch, id, { variant: s.variant, week: s.week, day: j, value: { ...cur, minutes: Number(el.value) > 0 ? Number(el.value) : null } }, opts()).schedule);
        draw(`#bs-m${j}`); return;
      }
      if (kind === "edit" && el.dataset.place !== undefined) { draftEdit((sch) => BS().placeMilestone(sch, id, { variant: s.variant, milestone: el.dataset.place, week: el.value === "" ? null : Number(el.value) }, opts()).schedule); draw(`[data-place="${CSS.escape(el.dataset.place)}"]`); return; }
      if (kind === "edit" && el.name === "vname") { if (el.value.trim()) draftEdit((sch) => BS().rename(sch, id, { variant: s.variant, name: el.value }, opts()).schedule); return; }
      if (kind === "create" && (el.name === "count")) { s.count = Number(el.value); draw('[name="count"]'); }
    });
    let timer = null;
    body.addEventListener("input", (e) => {
      const el = e.target;
      if (!d.open || kind !== "create") return;
      if (["title", "a", "b"].includes(el.name)) s[el.name] = el.value;
      // Redraw the preview only (the field being typed in stays as it is).
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!d.open) return;
        const res = compute();
        const pv = body.querySelector("[data-sc-preview]");
        const tmp = document.createElement("div");
        tmp.innerHTML = formHtml(res);
        const next = tmp.querySelector("[data-sc-preview]");
        if (pv && next) pv.replaceWith(next);
        const ok = body.querySelector("[data-sc-confirm]");
        if (ok) ok.disabled = !res.r;
      }, 150);
    });
    body.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !d.open) return;
      if (b.dataset.start) { s.start = b.dataset.start; draw(`[data-start="${s.start}"]`); return; }
      if (b.dataset.variantPick) { s.variant = b.dataset.variantPick; draw(`[data-variant-pick="${s.variant}"]`); return; }
      if (b.dataset.from) { s.from = b.dataset.from; draw(`[data-from="${s.from}"]`); return; }
      if (b.dataset.editWeek !== undefined) { s.week = b.dataset.editWeek === "all" ? "all" : Number(b.dataset.editWeek); draw(`[data-edit-week="${b.dataset.editWeek}"]`); return; }
      if (b.hasAttribute("data-pause")) { s.pause = !s.pause; draw("[data-pause]"); return; }
      if (b.dataset.availDay !== undefined) { const j = Number(b.dataset.availDay); s.days = s.days.slice(); s.days[j] = !s.days[j]; draw(`[data-avail-day="${j}"]`); return; }
      if (b.hasAttribute("data-sc-cancel")) { d.close(); return; }
      if (b.hasAttribute("data-sc-confirm")) {
        if (D().owner() !== owner || window.titanAccountTransition?.active) { d.close(); return; }
        body.querySelectorAll('input[name="title"], input[name="a"], input[name="b"]').forEach((el) => { s[el.name] = el.value; });
        const res = compute();
        if (!res.r) { const x = body.querySelector(".jr-edit-error"); x.textContent = res.error || "Ce changement n’est pas possible."; x.hidden = false; return; }
        D().scenarioSave(res.r.schedule);
        d.close();
        const done = { create: "Comparaison créée", apply: "Scénario appliqué", undo: "Application annulée", avail: "Disponibilités enregistrées", discard: "Comparaison rangée", edit: "Brouillon enregistré" };
        const msg = kind === "apply" ? `S’applique à partir du ${dayLong(res.pv.from)}. Tu peux l’annuler.` : kind === "undo" ? `Le programme d’avant revient à partir du ${dayLong(res.pv.from)}. Tes séances restent au journal.` : kind === "edit" || kind === "avail" ? "Ton programme actif ne change pas." : undefined;
        window.titanShell.toast({ type: "ok", title: done[kind], message: msg });
      }
    });
  }

  function fitNow(id, variant, week) {
    try {
      const r = BS().fit(window.state.user.schedule || {}, id, { variant, week }, { ...D().blockOptions(), at: new Date().toISOString() });
      D().scenarioSave(r.schedule);
      window.titanShell.toast({ type: "ok", title: `Variante ${letter(variant)} adaptée`, message: "Les jours indisponibles sont libérés dans le brouillon. Ton programme actif ne change pas." });
    } catch (e) {
      window.titanShell.toast({ type: "err", title: "Non enregistré", message: errorText(e) });
    }
  }

  /** Delegated actions on a host that renders html(). */
  function bind(host) {
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sc-act]");
      if (!b || !host.contains(b)) return;
      const k = b.dataset.scAct;
      if (k === "fit") { fitNow(b.dataset.scenarioId, b.dataset.variant, Number(b.dataset.week)); return; }
      open(k, b.dataset.scenarioId || null, b, { ...(b.dataset.variant ? { variant: b.dataset.variant } : {}), ...(b.dataset.week !== undefined ? { week: Number(b.dataset.week) } : {}) });
    });
  }

  /* ---------- Progrès › Semaine: the decision read again at the bilan ---------- */
  function contextHtml(day) {
    if (!BS() || !D().scenarioFollowUp) return "";
    const f = D().scenarioFollowUp(day);
    if (!f) return "";
    const w = BS().describeFollowUp(f, words);
    return `<section class="asc-section bs-context" data-scenario-context="${esc(f.id)}" data-week="${esc(f.week)}" data-undone="${f.undone}" aria-labelledby="bs-ctx-${esc(f.week)}">
      <div class="asc-section-head"><h2 id="bs-ctx-${esc(f.week)}">Scénario choisi</h2><a class="asc-small" href="/prevoir#scenarios">Voir la comparaison</a></div>
      <p class="asc-small" data-scenario-lead>${esc(w.lead)}</p>
      <p class="asc-small" data-scenario-planned>${esc(w.planned)}</p>
      <p class="asc-small" data-scenario-done>${esc(w.done)}</p>
      <p class="asc-small asc-muted" data-scenario-result>${esc(w.result)}</p>
    </section>`;
  }

  window.TitanBlockScenarioView = { html, bind, open, contextHtml };
})();
