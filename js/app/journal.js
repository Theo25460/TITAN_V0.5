/* TITAN 300 — Journal: every session, findable in seconds, correctable without ever losing data. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const E = () => window.TitanEffort;
  const P = () => window.TitanProgress;
  const SP = () => window.TitanSports;
  const X = () => window.TitanSessions;
  const DAY = 86400000;
  const PERIODS = [
    ["30", "30 jours"],
    ["90", "3 mois"],
    ["365", "12 mois"],
    ["all", "Tout"],
  ];
  const PREFS = "titan_journal_prefs_v3";

  let root = null;
  /* V1.6.6: the list shows PAGE rows, then « Afficher plus » adds PAGE more; any change of filter starts again from the first page. */
  const PAGE = 100;
  let ui = { q: "", family: "all", period: "all", view: "list", archived: false, month: null, day: null, shown: PAGE };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS) || "null");
    if (saved) ui = { ...ui, family: saved.family || "all", period: saved.period || "all", view: saved.view === "calendar" ? "calendar" : "list" };
  } catch {}
  const savePrefs = () => {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ family: ui.family, period: ui.period, view: ui.view }));
    } catch {}
  };

  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const minutes = (l) => window.TitanTraining.duration(l);

  function historical(l) {
    if (l.details?.historical === true) return true;
    if (l.details?.historical === false) return false;
    return E().isHistorical(l.date, new Date(l.created_at || Date.now()).getTime());
  }

  function source() {
    return (ui.archived ? window.state?.archivedHistory : window.state?.history) || [];
  }

  /* V1.6.6: the rows are sorted and keyed once per history change (js/core/history-window.js buildIndex), so a filter is one pass
     over the index instead of a sort of the whole history on every chip and keystroke (201 ms at p95 on 10 000 sessions before). */
  const W = () => window.TitanHistoryWindow;
  const searchText = (l) => [SP().label(l.sport), l.details?.note, ...(l.details?.exercises || []).map((e) => `${e.name} ${e.variant || ""}`), l.details?.extras?.max_done, l.details?.extras?.location].join(" ");
  let historyVersion = 0;
  window.addEventListener("titan:history-updated", () => { historyVersion++; });
  const indexes = new WeakMap();
  function indexOf(list) {
    const known = indexes.get(list);
    if (known && known.version === historyVersion && known.size === list.length) return known.index;
    const index = W().buildIndex(list, { familyOf: (s) => SP().familyOf(s), textOf: searchText });
    indexes.set(list, { index, version: historyVersion, size: list.length });
    return index;
  }
  const sinceOf = () => (ui.period === "all" ? -Infinity : Date.now() - Number(ui.period) * DAY);
  function filtered(ignoreDay = false) {
    return W().select(indexOf(source()), { since: sinceOf(), family: ui.family, day: ignoreDay ? null : ui.day, q: ui.q });
  }
  const coverage = () => (ui.archived ? null : window.titanHistoryCoverageOf?.(window.state?.user?.id) || null);

  /* Records of the whole history are computed once per change of the history, not on every render, keystroke and calendar row
     (141 ms for 2 000 sessions each time). The key is cheap and changes on add, edit (revision), archive and confirmation. */
  let recordCache = { key: "", ids: new Map() };
  window.addEventListener("titan:history-updated", () => { recordCache = { key: "", ids: new Map() }; });
  function recordIds() {
    const history = window.state?.history || [];
    let sig = 0;
    for (const l of history) sig += (Number(l.revision) || 0) + (l.archived_at ? 7 : 0) + (l.syncStatus === "confirmed" ? 3 : 0);
    const key = `${history.length}:${sig}:${X().idOf(history[history.length - 1] || {})}`;
    if (recordCache.key === key) return recordCache.ids;
    const ids = new Map();
    recordCache = { key, ids };
    for (const r of window.TitanInsights?.records?.(history, "all", Date.now()) || []) {
      if (r.kind === "duration") continue;
      const id = X().idOf(r.log);
      if (!ids.has(id)) ids.set(id, []);
      ids.get(id).push(r);
    }
    return ids;
  }

  // Self-explanatory values only: a bare "2" means nothing in a list.
  const LABELLED = { Exercices: (v) => `${v} exercice${v === "1" ? "" : "s"}`, Séries: (v) => `${v} série${v === "1" ? "" : "s"}`, Répétitions: (v) => `${v} rép.`, Réussites: (v) => `${v} réussies`, Meilleure: (v) => `max ${v}` };
  /* V1.6.1: one vocabulary with Android (js/core/sync-state.js), read from what this device really holds: the queue item of the
     session (status, attempts, last attempt, reason) and the confirmed server row. */
  const queueItemOf = (l) => {
    const id = X().idOf(l);
    return (window.TitanQueue?.list?.() || []).find((i) => i.payload?.details?.client_event_id === id) || null;
  };
  const syncOf = (l) => window.TitanSyncState?.describe({ log: l, item: queueItemOf(l), guest: String(window.state?.user?.id || "").startsWith("guest_"), online: navigator.onLine }) || null;
  function syncBadge(l) {
    if (!l.syncStatus || l.syncStatus === "confirmed" || l.syncStatus === "local") return "";
    const s = syncOf(l);
    if (!s || s.state === "confirmed") return "";
    return `<span class="asc-chip jr-badge${s.tone === "err" ? " err" : ""}" data-sync-badge="${esc(s.state)}" title="${esc(s.label)}">${icon(s.tone === "err" ? "alert" : "cloudUp")}${esc(s.short)}</span>`;
  }
  function syncHtml(l) {
    const s = syncOf(l);
    if (!s) return "";
    const kind = { send: "asc-btn-secondary", correct: "asc-btn-primary", discard: "asc-btn-ghost", export: "asc-btn-ghost" };
    const icons = { send: "cloudUp", correct: "edit", discard: "trash", export: "download" };
    const buttons = s.actions.map((a) => `<button type="button" class="asc-btn ${kind[a.id]} asc-btn-sm" data-sync-action="${esc(a.id)}"${a.id === "send" && !navigator.onLine ? " disabled" : ""}>${icon(icons[a.id])} ${esc(a.label)}</button>`).join("");
    return `<section class="jr-detail-block jr-sync" data-sync-state="${esc(s.state)}" aria-label="Synchronisation"><p class="asc-eyebrow">Synchronisation</p>
      <p class="asc-row-flex"><strong class="${s.tone === "err" ? "asc-err" : ""}">${esc(s.label)}</strong></p><p class="asc-small">${esc(s.text)}</p>
      ${s.facts.length ? `<dl class="jr-kv">${s.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join("")}</dl>` : ""}
      ${buttons ? `<div class="asc-row-flex">${buttons}</div>` : ""}</section>`;
  }

  /* ---------- Rendering ---------- */
  function rowHtml(l, recs) {
    const d = new Date(l.date);
    const fam = SP().familyOf(l.sport);
    const rec = recs.get(X().idOf(l));
    // On a wide screen the journal reads as a table: time, distance and effort each in their own aligned column of figures,
    // and the line under the sport keeps only what those columns do not say. On a phone the single line says it all.
    const mets = window.TitanMoment?.metrics(l) || [];
    const mins = minutes(l);
    const dist = mets.find(([k]) => k === "Distance")?.[1] || "";
    // The effort rating is saved under details.bio.rpe (details.rpe only on very old sessions): the column was always empty.
    const rawRpe = Number(l.details?.bio?.rpe ?? l.details?.rpe);
    const rpe = rawRpe > 0 ? String(Math.round(rawRpe)) : "";
    const rest = mets.filter(([k]) => !["Distance", "Durée", "Ressenti"].includes(k)).slice(0, 3).map(([k, v]) => (LABELLED[k] ? LABELLED[k](v) : v)).join(" · ");
    // On a phone one figure leads the row, set like a figure at the right (the distance when the session has one, its time
    // otherwise); the line under the sport keeps the rest. A session that set a record carries it in amber.
    const lead = dist ? ["Distance", dist] : mins ? ["Durée", F().duration(mins)] : null;
    const narrow = mets.filter(([k]) => k !== "Ressenti" && k !== lead?.[0]).slice(0, 3).map(([k, v]) => (LABELLED[k] ? LABELLED[k](v) : v)).join(" · ");
    return `<button type="button" class="jr-row" data-open="${esc(X().idOf(l))}" data-family="${esc(fam)}"${rec ? ' data-record="true"' : ""}>
      <span class="jr-date"><span class="asc-num">${d.getDate()}</span><small>${d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</small></span>
      <span class="jr-icon">${icon(SP().iconOf(l.sport))}</span>
      <span class="jr-text"><span class="jr-title">${esc(SP().label(l.sport))}</span><span class="jr-sub jr-sub-narrow">${esc(narrow)}</span><span class="jr-sub jr-sub-wide">${esc(rest)}</span></span>
      <span class="jr-lead">${lead ? esc(lead[1]) : ""}</span>
      <span class="jr-fig" data-col="Durée">${mins ? esc(F().duration(mins)) : ""}</span>
      <span class="jr-fig" data-col="Distance">${esc(dist)}</span>
      <span class="jr-fig" data-col="Ressenti">${rpe ? `${rpe}<small>/10</small>` : ""}</span>
      <span class="jr-tags">${rec ? `<span class="asc-chip jr-badge am" title="${esc(rec.map((r) => r.label).join(", "))}">${icon("star")}Record</span>` : ""}${historical(l) ? '<span class="asc-chip jr-badge" title="Ajoutée plus de 30 jours après la séance : sans XP">Historique</span>' : ""}${syncBadge(l)}${window.TitanMatches?.badge(l, matchRows) || ""}</span>
    </button>`;
  }

  /* V1.6.6: one page of rows at a time (PAGE, then « Afficher plus »), every row reachable; a month header keeps the count and the
     time of the whole month in the filtered list, even when its rows are split across two pages. */
  function listHtml(list) {
    if (!list.length) return emptyHtml();
    const recs = recordIds();
    const monthOf = (l) => { const d = new Date(l.date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
    const visible = list.slice(0, Math.max(PAGE, ui.shown));
    const months = new Map();
    for (const l of visible) {
      const key = monthOf(l);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(l);
    }
    // Month totals over the whole filtered list, only for the months on screen.
    const totals = new Map([...months.keys()].map((k) => [k, { n: 0, mins: 0 }]));
    for (const l of list) {
      const t = totals.get(monthOf(l));
      if (!t) { if (totals.size && monthOf(l) < [...totals.keys()].at(-1)) break; continue; }
      t.n++;
      t.mins += minutes(l) || 0;
    }
    let out = "";
    for (const [key, logs] of months) {
      const [y, m] = key.split("-").map(Number);
      const { n, mins } = totals.get(key);
      out += `<section class="jr-month" aria-label="${esc(new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}">
        <header class="jr-month-head"><h2>${esc(new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: y === new Date().getFullYear() ? undefined : "numeric" }))}</h2><span class="asc-small asc-muted">${n} séance${n > 1 ? "s" : ""}${mins ? ` · ${esc(F().duration(mins))}` : ""}</span></header>
        <div class="jr-cols" aria-hidden="true"><span></span><span></span><span>Séance</span><span>Durée</span><span>Distance</span><span>Ressenti</span><span></span></div>
        <div class="jr-rows">${logs.map((l) => rowHtml(l, recs)).join("")}</div></section>`;
    }
    const rest = list.length - visible.length;
    if (rest > 0) out += `<div class="jr-more"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-more>${icon("chevronDown")} Afficher ${F().number(Math.min(PAGE, rest))} séance${Math.min(PAGE, rest) > 1 ? "s" : ""} de plus</button><span class="asc-small asc-faint">${F().number(visible.length)} sur ${F().number(list.length)}</span></div>`;
    return out;
  }

  function emptyHtml() {
    const any = source().length;
    if (ui.archived) return `<div class="asc-empty sig-empty">${icon("archive")}<h2>Aucune séance archivée</h2><p>Une séance archivée sort de tes statistiques mais reste ici, restaurable à tout moment.</p></div>`;
    if (!any) return `<div class="asc-empty sig-empty">${icon("journal")}<h2>Ton journal commence à ta première séance</h2><p>Course, musculation, escalade, padel : enregistre ce que tu as vraiment fait, en moins d’une minute.</p><a class="asc-btn asc-btn-primary" href="/training">${icon("plus")} Enregistrer une séance</a></div>`;
    return `<div class="asc-empty sig-empty">${icon("search")}<h2>Aucune séance ne correspond</h2><p>Change la période, la famille ou la recherche.</p><button type="button" class="asc-btn asc-btn-secondary" data-reset>${icon("restore")} Tout afficher</button></div>`;
  }

  function calendarHtml(list) {
    const now = new Date();
    const month = ui.month ? new Date(ui.month + "-01T12:00:00") : new Date(now.getFullYear(), now.getMonth(), 1);
    const y = month.getFullYear(),
      m = month.getMonth();
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const byDay = new Map();
    // Keep the month overview filtered, independently of the selected day.
    for (const l of filtered(true)) {
      const k = F().dateKey(l.date);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(l);
    }
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push('<span class="jr-cal-cell is-empty" aria-hidden="true"></span>');
    let monthSessions = 0,
      monthMinutes = 0,
      activeDays = 0;
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d);
      const k = F().dateKey(date);
      const logs = byDay.get(k) || [];
      const mins = logs.reduce((n, l) => n + (minutes(l) || 0), 0);
      monthSessions += logs.length;
      monthMinutes += mins;
      if (logs.length) activeDays++;
      const level = !logs.length ? 0 : mins >= 90 ? 3 : mins >= 45 ? 2 : 1;
      const label = `${date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} : ${logs.length ? `${logs.length} séance${logs.length > 1 ? "s" : ""}${mins ? `, ${F().duration(mins)}` : ""}` : "aucune séance"}`;
      cells.push(`<button type="button" class="jr-cal-cell" data-day="${k}" data-level="${level}" aria-pressed="${ui.day === k}" aria-label="${esc(label)}"${k === F().dateKey(now) ? ' data-today="true"' : ""}${date > now ? " disabled" : ""}>
        <span class="jr-cal-num">${d}</span><span class="jr-cal-dots">${logs.slice(0, 3).map((l) => `<i data-family="${esc(SP().familyOf(l.sport))}"></i>`).join("")}</span></button>`);
    }
    const prev = new Date(y, m - 1, 1),
      next = new Date(y, m + 1, 1);
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `<section class="jr-cal" aria-label="Calendrier">
      <header class="jr-cal-head"><button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-month="${key(prev)}" aria-label="Mois précédent">${icon("chevronLeft")}</button>
        <div><h2>${esc(first.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}</h2><p class="asc-small asc-muted">${activeDays} jour${activeDays > 1 ? "s" : ""} actif${activeDays > 1 ? "s" : ""} · ${monthSessions} séance${monthSessions > 1 ? "s" : ""}${monthMinutes ? ` · ${esc(F().duration(monthMinutes))}` : ""}</p></div>
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-month="${key(next)}" aria-label="Mois suivant" ${next > now ? "disabled" : ""}>${icon("chevron")}</button></header>
      <div class="jr-cal-week" aria-hidden="true">${["L", "M", "M", "J", "V", "S", "D"].map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="jr-cal-grid">${cells.join("")}</div>
    </section>
    ${ui.day ? `<div class="jr-day-list"><div class="asc-between"><h2 class="asc-h3">${esc(new Date(ui.day + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}</h2><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-day-clear>Fermer</button></div>${list.length ? `<div class="jr-rows">${list.map((l) => rowHtml(l, recordIds())).join("")}</div>` : '<p class="asc-small asc-muted">Aucune séance ce jour-là.</p>'}</div>` : ""}`;
  }

  function pendingHtml() {
    const items = window.TitanQueue?.list?.() || [];
    if (!items.length) return "";
    const errors = items.filter((i) => i.status === "error");
    return `<section id="attente" tabindex="-1" aria-label="Séances en attente d’envoi" class="asc-note ${errors.length ? "err" : ""} jr-pending">${icon(errors.length ? "alert" : "cloudUp")}<div class="asc-stack-sm">
      <p><strong>${items.length} séance${items.length > 1 ? "s" : ""} sur cet appareil</strong> ${errors.length ? `dont ${errors.length} refusée${errors.length > 1 ? "s" : ""} par le serveur (${esc(errors[0].reason || "données invalides")}).` : navigator.onLine ? "en attente d’envoi." : "en attente du retour du réseau."}</p>
      <div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-retry ${navigator.onLine ? "" : "disabled"}>${icon("cloudUp")} Réessayer</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-export-pending>${icon("download")} Exporter une copie</button>${errors.some((i) => !i.deferred) ? `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-discard-refused>${icon("trash")} Retirer les séances refusées</button>` : ""}</div></div></section>`;
  }

  /* V1.6.6: what this device holds, when it is offline or while the history is still arriving (js/core/history-window.js). */
  function coverageHtml() {
    const cov = coverage();
    const d = cov && W().describe(cov, { online: navigator.onLine, loading: window.titanHistoryLoading === true });
    if (!d) return "";
    return `<p class="asc-note${d.tone === "warn" ? " warn" : ""} jr-coverage" data-coverage="${esc(d.state)}" role="status">${icon(navigator.onLine ? "cloud" : "offline")}<span>${esc(d.text)}</span></p>`;
  }

  function summaryHtml(list) {
    if (!list.length) return "";
    let mins = 0, km = 0;
    const dayKeys = new Set();
    for (const l of list) {
      mins += minutes(l) || 0;
      if (l.unit === "km") km += Number(l.val) || 0;
      dayKeys.add(F().dateKey(l.date));
    }
    const days = dayKeys.size;
    // V1.6.6: a partial copy (first pages, or offline before the whole history arrived) never reads as a complete total.
    const cov = coverage();
    const partial = cov && !W().covers(cov, sinceOf());
    return `${partial ? `<p class="asc-small asc-faint jr-partial" data-coverage-partial>Totaux partiels : cet appareil n’a pas encore les séances d’avant le ${esc(new Date(cov.oldest || Date.now()).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }))}.</p>` : ""}<dl class="jr-summary"${partial ? ' data-partial="true"' : ""}>
      <div><dt>Séances</dt><dd class="asc-num">${F().number(list.length)}</dd></div>
      <div><dt>Jours actifs</dt><dd class="asc-num">${F().number(days)}</dd></div>
      ${mins ? `<div><dt>Temps</dt><dd class="asc-num">${esc(F().duration(mins))}</dd></div>` : ""}
      ${km ? `<div><dt>Distance</dt><dd class="asc-num">${esc(F().distance(km))}</dd></div>` : ""}
    </dl>`;
  }

  const resultsHtml = (list) => (ui.view === "list" ? summaryHtml(list) + listHtml(list) : calendarHtml(list));
  function renderResults() {
    const box = document.getElementById("jr-results");
    if (box) box.innerHTML = resultsHtml(filtered());
    else render();
  }

  let pendingFragmentFocused = false;
  /* V1.6.2: the account's recent links (js/app/matches.js), read once per history change; a row says « À vérifier » or « 2 sources ». */
  let matchRows = [];
  let matchKey = "";
  function loadMatches() {
    const key = `${window.state?.user?.id || ""}:${(window.state?.history || []).length}:${(window.state?.archivedHistory || []).length}`;
    if (key === matchKey || !window.TitanMatches) return;
    matchKey = key;
    window.TitanMatches.recent().then((rows) => {
      if (key !== matchKey || !rows.length || JSON.stringify(rows) === JSON.stringify(matchRows)) return;
      matchRows = rows;
      render();
    });
  }
  window.addEventListener("titan:history-updated", () => { matchKey = ""; });

  function render() {
    if (!root) return;
    loadMatches();
    const list = filtered();
    const fams = Object.keys(SP().FAMILY_LABEL);
    const archivedCount = (window.state?.archivedHistory || []).length;
    const focus = document.activeElement?.id;
    root.innerHTML = `
      ${(() => {
        // One quiet row of entries, whatever the server has opened: adding by hand, importing a file, saved routes. They used to be
        // two stacked rows of three large buttons that pushed the journal itself under the first screen of a phone.
        const hub = window.titanFlags?.enabled?.("screens.activityhub", false) === true, routes = window.titanFlags?.enabled?.("screens.routes", false) === true;
        if (!hub && !routes) return "";
        return `<div class="jr-add">${hub ? `<a class="asc-btn asc-btn-secondary asc-btn-sm" href="/training?mode=manual" data-journal-manual>${icon("plus")} Ajouter</a><a class="asc-btn asc-btn-secondary asc-btn-sm" href="/training?mode=import" data-journal-import>${icon("upload")} Importer</a>` : ""}${routes ? `<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-routes-open aria-label="Mes parcours">${icon("route")} Parcours</button>` : ""}</div>`;
      })()}
      ${pendingHtml()}
      ${coverageHtml()}
      <div class="jr-tools">
        <div class="jr-bar">
          <div class="seance-search jr-search"><label class="sr-only" for="jr-q">Rechercher dans le journal</label><span class="seance-search-icon">${icon("search")}</span>
            <input id="jr-q" class="asc-input" type="search" autocomplete="off" placeholder="Sport, exercice, note…" value="${esc(ui.q)}"></div>
          <div class="asc-seg jr-view" role="group" aria-label="Vue">${[["list", "Liste"], ["calendar", "Calendrier"]].map(([k, l]) => `<button type="button" data-view="${k}" aria-pressed="${ui.view === k}">${icon(k === "list" ? "menu" : "calendar")}<span>${l}</span></button>`).join("")}</div>
        </div>
        <div class="jr-refine">
          <label class="sr-only" for="jr-period">Période</label><select id="jr-period" class="jr-select">${PERIODS.map(([k, l]) => `<option value="${k}" ${ui.period === k ? "selected" : ""}>${l}</option>`).join("")}</select>
          <div class="seance-chips jr-fams" role="group" aria-label="Famille">
            <button type="button" class="seance-chip" data-family="all" aria-pressed="${ui.family === "all"}">Tout</button>
            ${fams.map((f) => `<button type="button" class="seance-chip" data-family="${f}" aria-pressed="${ui.family === f}">${icon(SP().FAMILY_ICON[f])}${esc(SP().FAMILY_LABEL[f])}</button>`).join("")}
          </div>
        </div>
      </div>
      ${ui.archived ? `<p class="asc-note">${icon("archive")}<span>Archives : ces séances sont hors statistiques. Ouvre une séance pour la restaurer.</span></p>` : ""}
      <div id="jr-results" aria-live="polite">${resultsHtml(list)}</div>
      <footer class="jr-foot">
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-archived>${icon(ui.archived ? "journal" : "archive")} ${ui.archived ? "Retour au journal" : `Archives${archivedCount ? ` (${archivedCount})` : ""}`}</button>
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-export>${icon("download")} Exporter (CSV)</button>
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-history-import>${icon("upload")} Importer un historique</button>
      </footer>`;
    if (focus) {
      const el = document.getElementById(focus);
      if (el) {
        el.focus();
        if (el.setSelectionRange && el.type === "search") el.setSelectionRange(el.value.length, el.value.length);
      }
    }
    if (!pendingFragmentFocused && location.hash === "#attente") {
      const pending = document.getElementById("attente");
      if (pending) {
        pendingFragmentFocused = true;
        pending.focus();
      }
    }
  }

  /* ---------- Detail ---------- */
  function rewardLine(l) {
    if (historical(l)) return { cls: "", text: "Séance historique : statistiques et records, sans XP." };
    const r = l.details?.serverReward;
    if (String(window.state?.user?.id || "").startsWith("guest_")) return { cls: "", text: `≈ ${F().number(P().effortOf(l).xp)} XP estimés (mode découverte).` };
    if (l.syncStatus === "confirmed" && r && typeof r === "object" && r.reward_held) {
      // A session past the daily XP cap can be held with nothing to pay: say what is checked, not « 0 XP arrivent ».
      if (!(Number(r.held_xp) > 0) && !(Number(r.held_credits) > 0)) return { cls: "", text: "Séance en vérification de routine (24 h au plus) : elle comptera dans les objectifs collectifs une fois confirmée." };
      return { cls: "", text: `Récompense en vérification : ${F().number(r.held_xp)} XP arrivent d’eux-mêmes d’ici 24 h, après une vérification de routine.` };
    }
    if (l.syncStatus === "confirmed") {
      const xp = Number(r?.xp ?? l.xp) || 0;
      const capped = r && Number(r.requested_xp) > xp;
      return { cls: "cy", text: `+${F().number(xp)} XP officiels${capped ? ` (plafond de fair-play : ${F().number(r.requested_xp)} demandés)` : ""}.` };
    }
    return { cls: "", text: window.TitanData?.rulesV300?.() ? `≈ ${F().number(P().effortOf(l).xp)} XP, confirmés à la synchronisation.` : "XP confirmée à la synchronisation." };
  }

  function exercisesHtml(l) {
    const list = l.details?.exercises || [];
    if (!list.length) return "";
    return `<section class="jr-detail-block"><p class="asc-eyebrow">Séries</p>${list
      .map((e) => {
        const rows = e.setRows?.length ? e.setRows : Array.from({ length: Number(e.sets) || 0 }, () => ({ weight: e.weight, reps: e.reps }));
        const hold = e.kind === "hold";
        return `<div class="jr-ex"><div class="asc-between"><strong>${esc(e.name)}</strong><span class="asc-small asc-muted">${esc(e.variant || "")}</span></div>
          <ol class="jr-sets">${rows
            .map((s) => `<li class="asc-num">${hold ? `${F().number(s.seconds || 0)} s` : `${Number(s.weight) ? `${F().number(s.weight)} kg × ` : ""}${F().number(s.reps)}`}${s.rir !== null && s.rir !== undefined && s.rir !== "" ? `<small> RIR ${esc(s.rir)}</small>` : ""}</li>`)
            .join("")}</ol>
          ${Number(e.volume) > 0 ? `<p class="asc-small asc-faint">Volume ${esc(F().weight(e.volume))}</p>` : ""}</div>`;
      })
      .join("")}</section>`;
  }

  const EXTRA_LABELS = { climbing_discipline: "Discipline", location: "Lieu", grade_system: "Cotation", belay: "Assurage", max_done: "Meilleure réussie", max_attempt: "Meilleure tentée", attempts: "Essais", successful_routes: "Réussites", pool: "Bassin", session_type: "Type", result: "Résultat", score: "Score" };
  function extrasHtml(l) {
    const x = l.details?.extras || {};
    const fields = Object.fromEntries((window.SPORTS_CONFIG?.[l.sport]?.extraFields || []).map((f) => [f.id, f]));
    const rows = Object.entries(x)
      .filter(([, v]) => v !== null && v !== "" && v !== undefined)
      .map(([k, v]) => [fields[k]?.label || EXTRA_LABELS[k] || k, typeof v === "boolean" ? (v ? "Oui" : "Non") : k === "pool" ? (v === "open" ? "Eau libre" : `${v} m`) : `${v}${fields[k]?.unit ? " " + fields[k].unit : ""}`]);
    const g = l.details?.gpxStats;
    if (g?.movingMinutes) rows.push(["Temps en mouvement", F().duration(g.movingMinutes)]);
    if (g?.descent) rows.push(["Dénivelé négatif", `−${F().number(g.descent)} m`]);
    const gpxView = window.TitanGpxView?.render(g) || "";
    if (!rows.length && !gpxView) return "";
    return `<section class="jr-detail-block"><p class="asc-eyebrow">Détails</p><dl class="jr-kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>${gpxView}</section>`;
  }

  /* V1.7.7 — the GPS bilan of an outing recorded with the position. `details.gps` is the digest the GPS engine wrote when the session
     was saved (js/core/gps-engine.js): it is read as it is, never recomputed here, and it is the reference. A session without it
     keeps the display it always had. Foot sports read a pace, the others a speed (js/core/gps-session.js). */
  const GPS_TIME = [["moving", "En mouvement"], ["stopped", "À l’arrêt"], ["paused", "En pause"], ["missing", "Sans position"], ["interrupted", "Enregistrement interrompu"]];
  const gpsSpeed = (l, metres, seconds) => {
    if (!(seconds >= 30) || !(metres >= 50)) return "–";
    const GS = window.TitanGpsSession, t = GS?.speedText?.(metres / seconds, !!GS.layout?.(l.sport)?.pace);
    return t ? `${t.value} ${t.unit}` : `${F().number((metres / seconds) * 3.6, 1)} km/h`;
  };
  const gpsBar = (parts, clock) => {
    const shown = parts.filter((p) => p.seconds > 0);
    return `<div class="rt-timebar" role="img" aria-label="${esc(`Répartition du temps : ${shown.map((p) => `${p.label.toLowerCase()} ${clock(p.seconds)}`).join(", ")}`)}">${shown.map((p) => `<span class="rt-time rt-time-${p.kind}" style="flex-grow:${Math.max(1, Math.round(p.seconds))}"></span>`).join("")}</div>`;
  };
  function gpsBilanHtml(l) {
    const g = l.details?.gps, E = window.TitanGpsEngine;
    if (!g || typeof g !== "object" || !E?.clock || !(Number(g.elapsedS) > 0)) return "";
    const n = (v) => Math.max(0, Number(v) || 0);
    const times = { moving: n(g.movingS), stopped: n(g.stoppedS), paused: n(g.pausedS), missing: n(g.missingS) };
    const swatch = (kind) => `<span class="rt-swatch rt-time-${kind}" aria-hidden="true"></span>`;
    const rows = [
      [`${swatch("moving")}En mouvement`, E.clock(times.moving)], ["Temps total", E.clock(n(g.elapsedS))], [`${swatch("stopped")}À l’arrêt`, E.clock(times.stopped)], [`${swatch("paused")}En pause`, E.clock(times.paused)],
      ...(times.missing > 0 ? [[`${swatch("missing")}Sans position`, E.clock(times.missing)]] : []),
      ["Moyenne en mouvement", gpsSpeed(l, n(g.distanceM), times.moving)], ["Moyenne globale", gpsSpeed(l, n(g.distanceM), n(g.elapsedS))],
      ["Dénivelé positif", g.ascentM === null || g.ascentM === undefined || g.altitude === "unreliable" ? "pas assez fiable" : `${F().number(g.ascentM)} m · altitude du GPS`],
    ];
    return `<section class="jr-detail-block rt-bilan" data-gps-bilan aria-label="Bilan GPS"><p class="asc-eyebrow">Bilan GPS</p>
      ${gpsBar(GPS_TIME.slice(0, 4).map(([kind, label]) => ({ kind, label, seconds: times[kind] })), E.clock)}
      <dl class="jr-kv rt-bilan-figures">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd class="asc-num">${esc(v)}</dd></div>`).join("")}</dl>
      <p class="asc-small asc-faint">${g.autoPause === false ? "Pause automatique désactivée : la durée de la séance garde les arrêts détectés, pas les pauses ni les trous." : "Durée de la séance = temps en mouvement."}${times.missing > 0 ? " Le temps sans position fiable n’est pas compté comme effort." : ""}</p>
      <div class="rt-bilan-detail" data-gps-detail-slot></div></section>`;
  }
  /** « Voir le détail »: the engine run again on the trace kept in the library, when that trace carries its times. The library trace
      is thinned (3,000 points at most), so these figures may differ slightly from the saved bilan above, which stays the reference. */
  function mountGpsDetail(slot, l, linked) {
    const E = window.TitanGpsEngine;
    if (!slot || !slot.isConnected || !linked?.timed || !E?.analyse) return;
    slot.innerHTML = `<button type="button" class="asc-btn asc-btn-secondary rt-tap" data-gps-detail aria-expanded="false">${icon("chart")} Voir le détail</button><div class="asc-stack-sm" data-gps-detail-out hidden></div>`;
    const button = slot.querySelector("[data-gps-detail]"), out = slot.querySelector("[data-gps-detail-out]");
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      out.hidden = !open;
      if (!open || out.dataset.done) return;
      out.dataset.done = "1";
      let a = null;
      try { a = E.analyse({ sport: l.sport, segs: linked.segs }, { autoPause: l.details?.gps?.autoPause !== false }); } catch { a = null; }
      if (!a || !(a.elapsedS > 0)) { out.innerHTML = '<p class="asc-small asc-muted">Le détail n’a pas pu être calculé sur cette trace.</p>'; return; }
      const label = Object.fromEntries(GPS_TIME), pieces = a.timeline.slice(0, 400).map((t) => ({ kind: t.kind, label: label[t.kind] || t.kind, seconds: (t.to - t.from) / 1000 }));
      const totals = GPS_TIME.map(([kind, text]) => ({ kind, label: text, seconds: a.ms[kind] / 1000 })).filter((p) => p.seconds >= 1);
      out.innerHTML = `<p class="asc-small asc-muted">Détail recalculé sur la trace de ta bibliothèque, allégée (3 000 points au plus) : ces chiffres peuvent différer légèrement du bilan enregistré ci-dessus, qui reste la référence.</p>
        <p class="asc-eyebrow">Au fil de la sortie</p>
        <div class="rt-timebar rt-timebar-line" role="img" aria-label="${esc(`Déroulé : ${totals.map((p) => `${p.label.toLowerCase()} ${E.clock(p.seconds)}`).join(", ")}`)}">${pieces.map((p) => `<span class="rt-time rt-time-${esc(p.kind)}" style="flex-grow:${Math.max(1, Math.round(p.seconds))}"></span>`).join("")}</div>
        <ul class="rt-time-legend asc-small">${totals.map((p) => `<li><span class="rt-swatch rt-time-${esc(p.kind)}" aria-hidden="true"></span>${esc(p.label)} · <span class="asc-num">${esc(E.clock(p.seconds))}</span></li>`).join("")}</ul>
        <p class="asc-small">${a.stops.length ? `${a.stops.length} arrêt${a.stops.length > 1 ? "s" : ""} détecté${a.stops.length > 1 ? "s" : ""}` : "Aucun arrêt détecté"} · distance recalculée ${esc(F().distance(a.distanceM / 1000))}</p>
        ${a.splits.length ? `<div class="rt-table-wrap"><table class="rt-table" data-gps-splits><caption class="asc-eyebrow">Kilomètre par kilomètre · temps en mouvement</caption><thead><tr><th scope="col">Km</th><th scope="col">Temps</th><th scope="col">${window.TitanGpsSession?.layout?.(l.sport)?.pace ? "Allure" : "Vitesse"}</th></tr></thead>
          <tbody>${a.splits.slice(0, 400).map((s) => `<tr><th scope="row">${s.distanceM >= 1000 ? s.index : esc(`${s.index} (${F().number(s.distanceM)} m)`)}</th><td class="asc-num">${esc(E.clock(s.movingS))}</td><td class="asc-num">${esc(gpsSpeed(l, s.distanceM, s.movingS))}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
    });
  }

  function compareHtml(l) {
    const p = X().previousOf(l);
    if (!p) return "";
    const items = [];
    const delta = (label, a, b, fmt, lowerIsBetter = false) => {
      if (!(a > 0) || !(b > 0) || a === b) return;
      const up = a > b;
      const better = lowerIsBetter ? !up : up;
      items.push(`<li data-trend="${better ? "up" : "down"}"><span>${esc(label)}</span><strong class="asc-num">${up ? "+" : "−"}${esc(fmt(Math.abs(a - b)))}</strong></li>`);
    };
    const ma = minutes(l),
      mb = minutes(p);
    if (l.unit === "km" && p.unit === "km") {
      delta("Distance", Number(l.val), Number(p.val), (v) => F().distance(v));
      if (ma && mb && SP().paceMode(l.sport) === "pace") {
        const pa = (ma * 60) / l.val,
          pb = (mb * 60) / p.val;
        delta("Allure", pa, pb, (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")} /km`, true);
      }
    }
    delta("Durée", ma, mb, (v) => F().duration(v));
    if (l.unit === "kg" && p.unit === "kg") delta("Volume", Number(l.val), Number(p.val), (v) => F().weight(v));
    if (!items.length) return "";
    return `<section class="jr-detail-block"><p class="asc-eyebrow">Par rapport au ${esc(new Date(p.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }))}</p><ul class="jr-compare">${items.join("")}</ul>
      <p class="asc-small asc-faint">Comparé à ta séance précédente de ${esc(SP().label(l.sport).toLowerCase())}. Le contexte (terrain, météo, fatigue) n’est pas pris en compte.</p></section>`;
  }

  /* Lot D: the session against the last comparable one (same sport, comparable size, same exercise or grade system), measured
     figures only (js/core/progression.js). A change below its threshold reads « stable »; shared measures are never judged.
     V1.7.1: the selection is shown — the rule applied, the sample, the sessions kept (each opens its sheet), the sessions set aside
     and why, and the limit when a criterion depends on a value that was not recorded. The same module runs on Android. */
  const shortDate = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  function selectionHtml(s, P, limits = "") {
    const n = s.sample;
    const kept = s.retained.map((r) => `<li><button type="button" class="asc-link" data-open-source="${esc(r.id)}">${esc(shortDate(r.date))}</button> <span class="asc-faint">· ${esc(r.summary)}</span></li>`).join("");
    const counts = Object.entries(s.counts).map(([k, v]) => `${v} ${P.REASONS[k] || k}`).join(", ");
    const set = s.excluded.map((x) => `<li><button type="button" class="asc-link" data-open-source="${esc(x.id)}">${esc(shortDate(x.date))}</button> <span class="asc-faint">· ${esc(x.text)}</span></li>`).join("");
    return `<details class="jr-comparables" data-comparables>
      <summary>${n ? `Voir ${n > 1 ? `les ${n} séances comparées` : "la séance comparée"}` : "Voir la règle et les séances examinées"}</summary>
      <p class="asc-small" data-rule="${esc(`${s.rule.id}@${s.rule.version}`)}"><strong>Règle appliquée</strong> · ${esc(s.rule.label)} <span class="asc-faint">(règles ${esc(s.rule.version)})</span></p>
      ${s.rule.criteria.length ? `<ul class="asc-small jr-criteria">${s.rule.criteria.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      <p class="asc-small" data-sample="${n}"><strong>Échantillon</strong> · ${n} séance${n > 1 ? "s" : ""} retenue${n > 1 ? "s" : ""} sur ${s.considered} examinée${s.considered > 1 ? "s" : ""}${counts ? ` <span class="asc-faint">(écartées : ${esc(counts)})</span>` : ""}.</p>
      ${kept ? `<p class="asc-eyebrow">Séances retenues</p><ol class="asc-small jr-sources" data-retained>${kept}</ol>` : ""}
      ${set ? `<p class="asc-eyebrow">Séances écartées</p><ul class="asc-small jr-sources" data-excluded>${set}</ul>` : ""}
      ${limits ? `<p class="asc-eyebrow">Limites</p>${limits}` : ""}
    </details>`;
  }
  function comparisonHtml(l) {
    const P = window.TitanProgression;
    const history = window.state?.history || [];
    const s = P?.comparables?.(l, history);
    if (!s) return "";
    const limits = s.limits.length ? `<ul class="asc-small jr-limits" data-comparison-limit>${s.limits.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "";
    if (s.status === "insufficient")
      return `<section class="jr-detail-block" data-comparison data-status="insufficient"><p class="asc-eyebrow">Comparaison · données insuffisantes</p>${limits}${selectionHtml(s, P)}</section>`;
    const c = P.compare(l, history);
    if (!c || !c.items.length) return "";
    // Reuses the metrics list of the session sheet (moment-metrics): the word, not a colour, carries the direction.
    const line = (i) => {
      const word = P.DIRECTION_TEXT[i.direction] || "";
      const now = i.currentReps !== undefined ? `${P.formatValue(i)} × ${i.currentReps}` : P.formatValue(i);
      const before = i.currentReps !== undefined ? `${P.formatValue(i, "previous")} × ${i.previousReps}` : P.formatValue(i, "previous");
      return `<div><dt>${esc(i.label)}</dt><dd class="asc-num">${esc(now)} <small class="asc-faint">avant ${esc(before)}${word ? ` · ${esc(word)}` : ""}</small></dd></div>`;
    };
    const ref = s.reference ? `<p class="asc-small" data-reference>${s.reference.kind === "best" ? "Meilleure réussite" : "Médiane"} de tes ${s.reference.sessions} séances retenues : <strong>${esc(s.reference.display)}</strong>.</p>` : "";
    return `<section class="jr-detail-block" data-comparison data-status="${esc(s.status)}"><p class="asc-eyebrow">Par rapport à ta séance du ${esc(new Date(c.previous.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }))}</p>
      <dl class="moment-metrics">${c.items.slice(0, 6).map(line).join("")}</dl><p class="asc-small asc-faint">${esc(c.basis)} Seules les valeurs mesurées sont comparées.</p>
      ${ref}${s.status === "limited" ? `<p class="asc-small"><strong>Comparaison élargie</strong> : un critère n’a pas pu être vérifié.</p>${limits}${selectionHtml(s, P)}` : selectionHtml(s, P, limits)}</section>`;
  }

  // A session the server has not confirmed is corrected through « Synchronisation » (the server edit needs a confirmed row).
  const unsent = (l) => l.syncStatus === "pending" || l.syncStatus === "error";
  function detailHtml(l) {
    const metrics = window.TitanMoment?.metrics(l) || [];
    const rw = rewardLine(l);
    const recs = recordIds().get(X().idOf(l)) || [];
    return `<div class="jr-detail">
      <dl class="moment-metrics">${metrics.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="asc-num">${esc(v)}</dd></div>`).join("")}</dl>
      ${recs.length ? `<p class="jr-record">${icon("star")}<span>${recs.length > 1 ? "Records actuels" : "Record actuel"} : ${esc(recs.map((r) => r.label).join(", "))}</span></p>` : ""}
      <p class="jr-reward ${rw.cls}">${esc(rw.text)}</p>
      ${syncHtml(l)}
      <div data-match-slot></div>
      <div data-changes-slot></div>
      ${comparisonHtml(l)}
      ${exercisesHtml(l)}
      ${extrasHtml(l)}
      ${l.details?.note ? `<section class="jr-detail-block"><p class="asc-eyebrow">Note</p><p class="jr-note">${esc(l.details.note)}</p></section>` : ""}
      ${gpsBilanHtml(l)}
      <div data-route-slot></div>
      ${l.archived_at ? "" : compareHtml(l)}
      <div class="jr-actions">
        ${l.archived_at || l.syncStatus === "error" || !window.TitanStory ? "" : `<button type="button" class="asc-btn asc-btn-secondary" data-story>${icon("share")} Partager</button>`}
        ${l.archived_at || unsent(l) ? "" : `<button type="button" class="asc-btn asc-btn-secondary" data-edit>${icon("edit")} Corriger</button>`}
        ${l.archived_at ? "" : `<button type="button" class="asc-btn asc-btn-secondary" data-duplicate>${icon("copy")} Refaire</button>`}
        ${unsent(l) ? "" : `<button type="button" class="asc-btn asc-btn-ghost" data-toggle-archive>${icon(l.archived_at ? "restore" : "archive")} ${l.archived_at ? "Restaurer" : "Archiver"}</button>`}
      </div>
    </div>`;
  }

  let detailRequest = 0;
  const accountContext = () => ({ owner: window.state?.user?.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const currentAccount = (context) => !window.titanAccountTransition?.active
    && context.owner === window.state?.user?.id && context.client === window.titanClient && context.epoch === window.titanAccountTransition?.epoch;
  function guardDialog(d, context) {
    const guard = () => { if (!currentAccount(context)) d.close(); };
    const events = ["titan:account-changing", "titan:account-changed", "titan:history-updated"];
    events.forEach(ev => window.addEventListener(ev, guard));
    d.addEventListener("close", () => events.forEach(ev => window.removeEventListener(ev, guard)), { once: true });
    guard();
  }
  /* V1.6.3: what corrections, archives and restores changed on this session, read from the server (titan_session_changes_v1,
     owner only), worded by js/core/history-ledger.js like on Android. Without the function (bundle v22 not applied) nothing shows. */
  async function mountChanges(slot, l, isCurrent) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!slot || !uuid.test(String(l?.id || "")) || !(Number(l.revision) > 1) || (l.syncStatus && l.syncStatus !== "confirmed")) return;
    if (!window.titanClient?.rpc || !navigator.onLine || String(window.state?.user?.id || "").startsWith("guest_")) return;
    let data = null;
    try { ({ data } = await window.titanClient.rpc("titan_session_changes_v1", { p_log_id: l.id })); } catch { return; }
    if (!isCurrent() || !Array.isArray(data) || !data.length) return;
    const L = window.TitanLedger;
    const when = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    slot.innerHTML = `<section class="jr-detail-block" data-changes aria-label="Modifications de la séance"><p class="asc-eyebrow">Modifications</p>
      <ul class="asc-small jr-changes">${data.map((e) => `<li><span class="asc-faint">${esc(when(e.at))}</span> · ${esc((e.changes || []).map(L.changeText).join(" · "))}</li>`).join("")}</ul>
      <p class="asc-small asc-faint">Référence ${esc(L.reference(l))}, la même sur tes autres appareils. Les récompenses restent celles de la séance initiale.</p></section>`;
  }
  async function openDetail(id) {
    const request = ++detailRequest;
    const context = accountContext();
    if (!currentAccount(context)) return;
    let l;
    try { l = await X().resolve(id); }
    catch (e) {
      if (request !== detailRequest || !currentAccount(context)) return;
      return window.titanShell.toast({ type: "warn", title: "Séance indisponible", message: e.message });
    }
    if (request !== detailRequest || !currentAccount(context)) return;
    if (!l) return window.titanShell.toast({ type: "warn", title: "Séance introuvable", message: "Elle a peut-être été archivée ou n’est pas encore synchronisée sur cet appareil." });
    const body = document.createElement("div");
    body.innerHTML = detailHtml(l);
    const d = window.titanShell.sheet({ title: SP().label(l.sport), eyebrow: `${new Date(l.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${F().time(l.date)}`, body });
    guardDialog(d, context);
    const linkedRoute = window.TitanRoutes?.mountForSession?.(body.querySelector("[data-route-slot]"), l);
    if (l.details?.gps) Promise.resolve(linkedRoute).then((linked) => { if (request === detailRequest && currentAccount(context) && d.open) mountGpsDetail(body.querySelector("[data-gps-detail-slot]"), l, linked); }).catch(() => {});
    window.TitanMatches?.mount(body.querySelector("[data-match-slot]"), l, () => request === detailRequest && currentAccount(context) && d.open);
    mountChanges(body.querySelector("[data-changes-slot]"), l, () => request === detailRequest && currentAccount(context) && d.open);
    body.addEventListener("click", async (e) => {
      if (!currentAccount(context)) return d.close();
      if (e.target.closest("[data-duplicate]")) return X().duplicate(l);
      // V1.7.1: a source of the comparison opens its own sheet (the same journal entry, never a copy).
      const source = e.target.closest("[data-open-source]");
      if (source) {
        d.close();
        return openDetail(source.getAttribute("data-open-source"));
      }
      const matchButton = e.target.closest("[data-match-action]");
      if (matchButton) {
        d.close();
        return window.TitanMatches?.decide(matchButton.getAttribute("data-match-action"), matchButton.getAttribute("data-match-source"), matchButton.getAttribute("data-match-ref"), () => { if (currentAccount(context)) render(); });
      }
      const syncAction = e.target.closest("[data-sync-action]")?.getAttribute("data-sync-action");
      if (syncAction) return runSyncAction(syncAction, l, d, context);
      // « Partager » (before V2): a story card of this session, previewed before anything is shared.
      if (e.target.closest("[data-story]")) return window.TitanStory?.open({ kind: "session", input: window.TitanStory.sessionInput(l) }, { isCurrent: () => d.open && currentAccount(context), route: window.TitanStory.routeOf(l) });
      if (e.target.closest("[data-edit]")) {
        d.close();
        return openEdit(l, context);
      }
      if (e.target.closest("[data-toggle-archive]")) {
        d.close();
        const archive = !l.archived_at;
        const confirmation = window.titanShell.confirm({
          title: archive ? "Archiver cette séance ?" : "Restaurer cette séance ?",
          message: archive ? "Elle sort de tes statistiques, records et objectifs, et reste dans les archives." : "Elle revient dans ton journal, tes statistiques et tes records.",
          detail: "Les récompenses déjà obtenues restent inchangées ; aucune nouvelle récompense n’est attribuée.",
          confirmLabel: archive ? "Archiver" : "Restaurer",
          action: () => {
            if (!currentAccount(context)) throw new Error("Le compte a changé. Rouvre la séance depuis son journal.");
            return archive ? X().archive(l) : X().restore(l);
          },
        });
        guardDialog(document.querySelector("dialog.asc-sheet[open]"), context);
        await confirmation;
      }
    });
  }

  /* V1.6.1: each recovery action is the existing flow that matches the reason (js/core/sync-state.js). */
  async function runSyncAction(action, l, d, context) {
    const item = queueItemOf(l);
    if (action === "export") return window.titanExportPending?.();
    if (action === "send") {
      d.close();
      return window.flushPendingTrainingLogs?.({ retry: true })
        .then((r) => { if (currentAccount(context)) window.titanShell.toast({ type: r?.remaining ? "warn" : "ok", title: r?.remaining ? "Envoi incomplet" : "Séance confirmée dans ton compte", message: r?.remaining ? "Elle reste enregistrée sur cet appareil et repartira automatiquement." : "Tu la retrouves sur tes autres appareils." }); })
        .catch(() => { if (currentAccount(context)) window.titanShell.toast({ type: "warn", title: "Envoi impossible", message: "Ta séance reste enregistrée sur cet appareil." }); })
        .finally(() => { if (currentAccount(context)) render(); });
    }
    if (action === "correct" && item && window.TitanSyncState?.replaceable(item)) return X().duplicate({ ...item.payload, id: X().idOf(l), client_event_id: X().idOf(l) }, { replaces: item.key });
    if (action === "discard" && item) {
      d.close();
      return window.titanShell.confirm({
        title: "Retirer cette séance de cet appareil ?",
        message: item.status === "error" ? "Le serveur l’a refusée : elle n’est ni dans ton compte ni récompensée." : "Elle n’a pas encore été confirmée par ton compte.",
        detail: "Exporte d’abord une copie si tu veux la ressaisir plus tard.",
        confirmLabel: "Retirer",
        danger: true,
        action: async () => {
          if (!currentAccount(context)) throw new Error("Le compte a changé.");
          await window.TitanQueue.remove(item.key, context.owner);
          window.state.history = (window.state.history || []).filter((h) => X().idOf(h) !== X().idOf(l));
          await window.TitanQueue.saveHistory(context.owner, [...window.state.history, ...(window.state.archivedHistory || [])]).catch(() => {});
          window.dispatchEvent(new CustomEvent("titan:history-updated"));
        },
      }).then(() => { if (currentAccount(context)) render(); });
    }
  }

  /* ---------- Correction ---------- */
  function localInput(date) {
    const d = new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function openEdit(l, context = accountContext()) {
    if (!currentAccount(context) || (l.user_id && l.user_id !== context.owner)) return;
    const exercises = l.details?.exercises || [];
    const editableSets = exercises.length > 0 && !exercises.some((e) => e.kind === "hold");
    const climbing = SP().formOf(l.sport) === "climbing" || Boolean(l.details?.extras?.grade_system);
    const previousExtras = l.details?.extras || {};
    const managed = climbing ? ["max_done", "attempts", "successful_routes"] : [];
    const catalogFields = (window.SPORTS_CONFIG?.[l.sport]?.extraFields || [])
      .filter(f => f && /^[a-zA-Z0-9_-]+$/.test(f.id) && !managed.includes(f.id) && ["number", "select", "checkbox", "text"].includes(f.type) && !f.eliteOnly);
    // Same contract as the entry form: irrelevant historical fields are not offered, but one that holds a value stays editable.
    const metricFields = (window.TitanSportContracts ? window.TitanSportContracts.entryFields(l.sport, catalogFields, { values: previousExtras, skip: managed }) : catalogFields)
      .sort((a, b) => (a.priority || 99) - (b.priority || 99));
    const metricInput = f => {
      const v = previousExtras[f.id] ?? "";
      const name = `metric.${esc(f.id)}`;
      const label = `${esc(f.label || f.id)}${f.unit ? ` (${esc(f.unit)})` : ""}`;
      let control;
      if (f.type === "select" || f.type === "checkbox") {
        const options = f.type === "checkbox" ? [["true", "Oui"], ["false", "Non"]] : (f.options || []).map(o => [String(o), String(o)]);
        // Historical values remain selectable when the catalog vocabulary changes.
        if (v !== "" && !options.some(([k]) => k === String(v))) options.unshift([String(v), String(v)]);
        control = `<select name="${name}"><option value="">Non renseigné</option>${options.map(([k, label]) => `<option value="${esc(k)}" ${String(v) === k ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
      } else if (f.type === "number") {
        control = `<input class="asc-input" type="number" inputmode="decimal" name="${name}" value="${esc(v)}" step="${Number(f.step) || "any"}" ${f.min != null ? `min="${Number(f.min)}"` : ""} ${f.max != null ? `max="${Number(f.max)}"` : ""}>`;
      } else control = `<input class="asc-input" name="${name}" maxlength="120" value="${esc(v)}">`;
      return `<label class="asc-field" data-metric="${esc(f.id)}"><span>${label}</span>${control}</label>`;
    };
    const timeUnit = ["min", "h"].includes(l.unit);
    // V1.6.6: the positive elevation of a ride, a run or a hike (details.elevation), corrected like its other measures.
    const elevated = l.unit === "km" && SP().hasElevation?.(l.sport) === true;
    const body = document.createElement("form");
    body.className = "asc-stack jr-edit";
    body.noValidate = true;
    const setRow = (i, j, s) => `<div class="seance-set" data-set><span class="asc-faint">${j + 1}</span>
      <input class="asc-input" type="number" inputmode="decimal" min="0" max="1000" step="0.5" name="w" value="${esc(s.weight ?? 0)}" aria-label="Charge">
      <input class="asc-input" type="number" inputmode="numeric" min="1" max="500" step="1" name="r" value="${esc(s.reps ?? 1)}" aria-label="Répétitions">
      <input class="asc-input" type="number" inputmode="numeric" min="0" max="10" step="1" name="rir" value="${s.rir === null || s.rir === undefined ? "" : esc(s.rir)}" placeholder="—" aria-label="RIR">
      <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-del-set aria-label="Retirer la série">${icon("minus")}</button></div>`;
    body.innerHTML = `
      <label class="asc-field"><span>Date et heure</span><input class="asc-input" type="datetime-local" name="date" value="${localInput(l.date)}" max="${localInput(Date.now())}" required></label>
      ${
        editableSets
          ? exercises
              .map(
                (e, i) => `<fieldset class="seance-ex" data-ex="${i}"><legend class="seance-label">${esc(e.name)}</legend>
          <div class="seance-sets"><div class="seance-set seance-set-head"><span>#</span><span>kg</span><span>rép.</span><span>RIR</span><span></span></div>
          ${(e.setRows?.length ? e.setRows : window.TitanInsights.sets(e)).map((s, j) => setRow(i, j, s)).join("")}</div>
          <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-add-set>${icon("plus")} Série</button></fieldset>`,
              )
              .join("")
          : !timeUnit && !exercises.length
            ? `<label class="asc-field"><span>${l.unit === "km" ? "Distance (km)" : l.unit === "m" ? "Distance (m)" : `Valeur (${esc(l.unit)})`}</span><input class="asc-input" type="number" inputmode="decimal" name="val" min="0.01" max="300000" step="any" value="${esc(l.val)}" required></label>`
            : ""
      }
      ${exercises.length && !editableSets ? `<p class="asc-note">${icon("info")}<span>Les maintiens chronométrés se corrigent en dupliquant la séance puis en archivant celle-ci.</span></p>` : ""}
      <label class="asc-field"><span>Durée (min)${timeUnit ? "" : ' <small class="asc-faint">facultatif</small>'}</span><input class="asc-input" type="number" inputmode="decimal" name="duration" min="1" max="1440" step="any" value="${esc(minutes(l) || "")}" ${timeUnit ? "required" : ""}></label>
      ${elevated ? `<label class="asc-field"><span>Dénivelé positif (m) <small class="asc-faint">facultatif</small></span><input class="asc-input" type="number" inputmode="numeric" name="elevation" min="0" max="12000" step="1" value="${esc(l.details?.elevation ?? "")}"></label>` : ""}
      ${
        climbing
          ? `<div class="asc-form-grid"><label class="asc-field"><span>Meilleure réussie</span><input class="asc-input" name="max_done" value="${esc(l.details?.extras?.max_done || "")}"></label>
        <label class="asc-field"><span>Essais</span><input class="asc-input" type="number" min="0" max="200" name="attempts" value="${esc(l.details?.extras?.attempts ?? "")}"></label>
        <label class="asc-field"><span>Réussites</span><input class="asc-input" type="number" min="0" max="200" name="successful_routes" value="${esc(l.details?.extras?.successful_routes ?? "")}"></label></div>`
          : ""
      }
      ${metricFields.length ? `<details class="seance-more seance-block"><summary>Mesures du sport <small class="asc-faint">facultatif</small></summary><div class="asc-form-grid">${metricFields.map(metricInput).join("")}</div></details>` : ""}
      <label class="asc-field"><span>Note</span><textarea name="note" maxlength="2000">${esc(l.details?.note || "")}</textarea></label>
      <p class="asc-small asc-faint">Statistiques et records sont recalculés à partir des mesures corrigées. Les récompenses restent celles de la séance initiale.</p>
      <p class="asc-small jr-edit-error" role="alert"></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-primary">Enregistrer</button></div>`;
    const d = window.titanShell.sheet({ title: "Corriger la séance", eyebrow: SP().label(l.sport), body });
    guardDialog(d, context);
    const metricValues = () => Object.fromEntries(metricFields.map(f => {
      const el = body.elements.namedItem(`metric.${f.id}`);
      const v = el.value;
      return [f.id, f.type === "checkbox" && v !== "" ? v === "true" : v];
    }));
    const metricVisible = (f, values) => {
      const rule = f.visibleWhen;
      if (!rule?.field) return true;
      if (Array.isArray(rule.in)) return rule.in.map(String).includes(String(values[rule.field]));
      if (rule.equals !== undefined) return String(values[rule.field]) === String(rule.equals);
      return true;
    };
    const updateMetricVisibility = () => {
      const values = metricValues();
      for (const f of metricFields) body.querySelector(`[data-metric="${f.id}"]`).hidden = !metricVisible(f, values);
    };
    body.addEventListener("change", updateMetricVisibility);
    updateMetricVisibility();
    body.addEventListener("click", (e) => {
      if (e.target.closest("[data-cancel]")) return d.close();
      const add = e.target.closest("[data-add-set]");
      if (add) {
        const box = add.parentElement.querySelector(".seance-sets");
        const rows = box.querySelectorAll("[data-set]");
        if (rows.length >= 30) return;
        const last = rows[rows.length - 1];
        box.insertAdjacentHTML("beforeend", setRow(0, rows.length, { weight: last?.querySelector("[name=w]").value || 0, reps: last?.querySelector("[name=r]").value || 8, rir: null }));
      }
      const del = e.target.closest("[data-del-set]");
      if (del) {
        const box = del.closest(".seance-sets");
        if (box.querySelectorAll("[data-set]").length > 1) del.closest("[data-set]").remove();
        box.querySelectorAll("[data-set] > span").forEach((s, i) => (s.textContent = i + 1));
      }
    });
    body.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentAccount(context)) return d.close();
      const err = body.querySelector(".jr-edit-error");
      const fd = new FormData(body);
      const date = new Date(fd.get("date"));
      if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 60000) return (err.textContent = "Choisis une date passée valide.");
      const patch = { date: date.toISOString(), note: String(fd.get("note") || "") };
      const dur = String(fd.get("duration") || "").replace(",", ".");
      if (editableSets) {
        patch.exercises = [...body.querySelectorAll("[data-ex]")].map((fs) => {
          const ex = exercises[Number(fs.dataset.ex)];
          return {
            name: ex.name,
            // The server defaults a missing kind to « weighted »: a bodyweight exercise must keep its own.
            ...(ex.kind ? { kind: ex.kind } : {}),
            variant: ex.variant || "",
            equipment: ex.equipment || "",
            setRows: [...fs.querySelectorAll("[data-set]")].map((r) => ({ weight: Number(r.querySelector("[name=w]").value) || 0, reps: Math.round(Number(r.querySelector("[name=r]").value)) || 0, rir: r.querySelector("[name=rir]").value === "" ? null : Number(r.querySelector("[name=rir]").value) })),
          };
        });
        if (patch.exercises.some((ex) => ex.setRows.some((s) => s.reps < 1 || s.reps > 500 || s.weight < 0 || s.weight > 1000))) return (err.textContent = "Chaque série garde entre 1 et 500 répétitions et une charge de 0 à 1000 kg.");
      } else if (fd.has("val")) {
        const v = Number(String(fd.get("val")).replace(",", "."));
        if (!(v > 0)) return (err.textContent = "Indique une valeur supérieure à zéro.");
        patch.val = v;
      }
      if (timeUnit) {
        const m = Number(dur);
        if (!(m >= 1 && m <= 1440)) return (err.textContent = "La durée va de 1 minute à 24 heures.");
        patch.val = l.unit === "h" ? Math.round((m / 60) * 100) / 100 : m;
        patch.duration = m;
      } else if (dur) {
        const m = Number(dur);
        if (!(m >= 1 && m <= 1440)) return (err.textContent = "La durée va de 1 minute à 24 heures.");
        patch.duration = m;
      } else patch.duration = null;
      // Same plausibility as creation (shared bounds): a marathon corrected to 1 minute used to become a record.
      {
        const finalMinutes = patch.duration !== undefined ? patch.duration : minutes(l) || null;
        const finalVal = patch.val !== undefined ? patch.val : Number(l.val);
        const issue = (window.TitanTraining?.measureIssues?.({ km: l.unit === "km" ? finalVal : null, meters: l.unit === "m" ? finalVal : null, minutes: finalMinutes }) || [])[0];
        if (issue) return (err.textContent = issue.message);
      }
      if (climbing) {
        const best = String(fd.get("max_done") || "").trim();
        const system = l.details?.extras?.grade_system || "Fontainebleau bloc";
        if (best && window.TitanInsights?.grade && !window.TitanInsights.grade(best, system)) return (err.textContent = `Cotation « ${best} » non reconnue pour ${system}.`);
        const n = (k) => (String(fd.get(k) || "").trim() === "" ? null : Math.round(Number(fd.get(k))));
        patch.extras = { max_done: best || null, attempts: n("attempts"), successful_routes: n("successful_routes") };
        if (patch.extras.attempts !== null && patch.extras.successful_routes !== null && patch.extras.successful_routes > patch.extras.attempts) return (err.textContent = "Les réussites ne peuvent pas dépasser les essais.");
      }
      const values = metricValues();
      const metricPatch = {};
      for (const f of metricFields) {
        const input = body.elements.namedItem(`metric.${f.id}`);
        const visible = metricVisible(f, values);
        const raw = visible ? input.value.trim() : "";
        // Unchanged/absent fields do not introduce zeroes or erase unknown historical IDs.
        if (!raw) {
          if (Object.prototype.hasOwnProperty.call(previousExtras, f.id)) metricPatch[f.id] = null;
          continue;
        }
        let value = f.type === "checkbox" ? raw === "true" : raw;
        if (f.type === "number") {
          value = Number(raw.replace(",", "."));
          if (!Number.isFinite(value) || (f.min != null && value < f.min) || (f.max != null && value > f.max)) {
            input.closest("details")?.setAttribute("open", "");
            input.focus();
            return (err.textContent = `Vérifie ${f.label || f.id}${f.unit ? ` (${f.unit})` : ""}.`);
          }
        }
        if (value !== previousExtras[f.id]) metricPatch[f.id] = value;
      }
      if (Object.keys(metricPatch).length) patch.extras = { ...(patch.extras || {}), ...metricPatch };
      if (elevated) {
        const raw = String(fd.get("elevation") ?? "").trim().replace(",", ".");
        const next = raw === "" ? null : Number(raw);
        if (next !== null && !(Number.isFinite(next) && next >= 0 && next <= 12000)) return (err.textContent = "Le dénivelé va de 0 à 12 000 m.");
        const was = l.details?.elevation === undefined || l.details?.elevation === null || l.details?.elevation === "" ? null : Number(l.details.elevation);
        if ((next === null ? null : Math.round(next)) !== was) patch.elevation = next === null ? null : Math.round(next);
      }
      // V1.6.3: only what changed is sent, so the session keeps its date (the form has no seconds), unit and reference, and its
      // « Modifications » list shows the real correction (same rule as the Android edit screen).
      if (Math.floor(new Date(l.date).getTime() / 60000) === Math.floor(date.getTime() / 60000)) delete patch.date;
      if (patch.note === String(l.details?.note || "")) delete patch.note;
      if ("duration" in patch) {
        const was = minutes(l);
        if (patch.duration === null ? was === null || was === undefined : Number(patch.duration) === Number(was)) delete patch.duration;
      }
      if ("val" in patch && Number(patch.val) === Number(l.val)) delete patch.val;
      if (!Object.keys(patch).length) return (err.textContent = "Rien n’a changé : modifie une valeur ou annule.");
      const submit = body.querySelector("[type=submit]");
      submit.disabled = true;
      try {
        const updated = await X().update(l, patch);
        if (!updated || !currentAccount(context)) return;
        d.close();
        const what = (window.TitanLedger?.changes(l, updated) || []).map(window.TitanLedger.changeText).join(" · ");
        window.titanShell.toast({ type: "ok", title: "Séance corrigée", message: `${what ? `${what}. ` : ""}Statistiques et records sont à jour.` });
      } catch (error) {
        if (!currentAccount(context)) return;
        err.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
  }

  /* ---------- Events ---------- */
  function onClick(e) {
    const t = e.target.closest("button");
    if (!t || !root.contains(t)) return;
    if (t.closest?.("[data-routes-open]")) return window.TitanRoutes?.openLibrary?.();
    if (t.dataset.open) return openDetail(t.dataset.open);
    if (t.hasAttribute("data-more")) {
      ui.shown += PAGE;
      renderResults();
      return;
    }
    if (t.dataset.view) {
      ui.view = t.dataset.view;
      ui.day = null;
      savePrefs();
      return render();
    }
    if (t.dataset.family) {
      ui.family = t.dataset.family;
      ui.shown = PAGE;
      savePrefs();
      return render();
    }
    if (t.dataset.month) {
      ui.month = t.dataset.month;
      ui.day = null;
      return render();
    }
    if (t.dataset.day) {
      ui.day = ui.day === t.dataset.day ? null : t.dataset.day;
      render();
      if (ui.day) root.querySelector(".jr-day-list")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (t.hasAttribute("data-day-clear")) {
      ui.day = null;
      return render();
    }
    if (t.hasAttribute("data-reset")) {
      ui = { ...ui, q: "", family: "all", period: "all", day: null, shown: PAGE };
      savePrefs();
      return render();
    }
    if (t.hasAttribute("data-archived")) {
      ui.archived = !ui.archived;
      ui.shown = PAGE;
      ui.day = null;
      return render();
    }
    if (t.hasAttribute("data-export")) return window.titanExportSessionsCSV?.(filtered());
    // V1.6.4: a whole history file (TITAN export, CSV profile, Strava), previewed, resumable and withdrawable (js/app/migration.js).
    if (t.hasAttribute("data-history-import")) return window.titanHistoryMigration?.open();
    if (t.hasAttribute("data-export-pending")) return window.titanExportPending?.();
    if (t.hasAttribute("data-discard-refused")) {
      const context = accountContext();
      if (!currentAccount(context)) return;
      return window.titanShell.confirm({
        title: "Retirer les séances refusées ?",
        message: "Le serveur les a refusées : elles ne sont ni dans tes statistiques serveur ni récompensées. Elles disparaîtront de cet appareil.",
        detail: "Exporte d’abord une copie si tu veux les ressaisir avec des valeurs corrigées.",
        confirmLabel: "Retirer",
        danger: true,
        action: async () => {
          if (!currentAccount(context)) throw new Error("Le compte a changé.");
          await window.titanDiscardRefusedSessions?.();
        },
      }).then(() => { if (currentAccount(context)) render(); });
    }
    if (t.hasAttribute("data-retry")) {
      const context = accountContext();
      if (!currentAccount(context)) return;
      t.disabled = true;
      window.flushPendingTrainingLogs?.({ retry: true })
        .then((r) => {
          if (currentAccount(context)) window.titanShell.toast({ type: r?.remaining ? "warn" : "ok", title: r?.remaining ? "Envoi incomplet" : "Séances envoyées", message: r?.remaining ? `${r.remaining} séance(s) restent sur cet appareil.` : "Tout est synchronisé." });
        })
        .catch(() => {
          if (currentAccount(context)) window.titanShell.toast({ type: "warn", title: "Envoi impossible", message: "Tes séances restent conservées sur cet appareil." });
        })
        .finally(() => { if (currentAccount(context)) render(); });
    }
  }

  let inputTimer = null;
  function onInput(e) {
    if (e.target.id === "jr-q") {
      ui.q = e.target.value;
      ui.shown = PAGE;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(renderResults, 120);
    }
  }
  function onChange(e) {
    if (e.target.id === "jr-period") {
      ui.period = e.target.value;
      ui.shown = PAGE;
      savePrefs();
      render();
    }
  }

  let booted = false;
  function start() {
    root = document.getElementById("journal");
    if (!root || !window.state?.user || !window.TitanSports) return;
    if (!booted) {
      booted = true;
      SP().ensure();
      root.addEventListener("click", onClick);
      root.addEventListener("input", onInput);
      root.addEventListener("change", onChange);
      const params = new URLSearchParams(location.search);
      if (params.get("q")) ui.q = params.get("q");
      if (params.get("archives") === "1") ui.archived = true;
      render();
      root.setAttribute("aria-busy", "false");
      const session = params.get("session");
      if (session) setTimeout(() => openDetail(session), 50);
      return;
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
  ["titan:history-updated", "titan:history-error", "titan:pending-changed", "titan:flags-updated", "online", "offline"].forEach((ev) => window.addEventListener(ev, queue));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
