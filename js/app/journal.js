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
  let ui = { q: "", family: "all", period: "all", view: "list", archived: false, month: null, day: null };
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

  function filtered() {
    const q = norm(ui.q).trim();
    const since = ui.period === "all" ? -Infinity : Date.now() - Number(ui.period) * DAY;
    return source()
      .filter((l) => {
        const t = new Date(l.date).getTime();
        if (!Number.isFinite(t) || t < since) return false;
        if (ui.family !== "all" && SP().familyOf(l.sport) !== ui.family) return false;
        if (ui.day && F().dateKey(l.date) !== ui.day) return false;
        if (!q) return true;
        const hay = norm([SP().label(l.sport), l.details?.note, ...(l.details?.exercises || []).map((e) => `${e.name} ${e.variant || ""}`), l.details?.extras?.max_done, l.details?.extras?.location].join(" "));
        return q.split(/\s+/).every((w) => hay.includes(w));
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function recordIds() {
    const ids = new Map();
    for (const r of window.TitanInsights?.records?.(window.state?.history || [], "all", Date.now()) || []) {
      if (r.kind === "duration") continue;
      const id = X().idOf(r.log);
      if (!ids.has(id)) ids.set(id, []);
      ids.get(id).push(r);
    }
    return ids;
  }

  // Self-explanatory values only: a bare "2" means nothing in a list.
  const LABELLED = { Exercices: (v) => `${v} exercice${v === "1" ? "" : "s"}`, Séries: (v) => `${v} série${v === "1" ? "" : "s"}`, Répétitions: (v) => `${v} rép.`, Réussites: (v) => `${v} réussies`, Meilleure: (v) => `max ${v}` };
  function shortMetrics(l) {
    return (window.TitanMoment?.metrics(l) || [])
      .filter(([k]) => k !== "Ressenti")
      .slice(0, 3)
      .map(([k, v]) => (LABELLED[k] ? LABELLED[k](v) : v))
      .join(" · ");
  }

  function syncBadge(l) {
    if (l.syncStatus === "error") return `<span class="asc-chip jr-badge err" title="Envoi refusé">${icon("alert")}À vérifier</span>`;
    if (l.syncStatus === "pending") return `<span class="asc-chip jr-badge" title="En attente de synchronisation">${icon("cloudUp")}En attente</span>`;
    return "";
  }

  /* ---------- Rendering ---------- */
  function rowHtml(l, recs) {
    const d = new Date(l.date);
    const fam = SP().familyOf(l.sport);
    const rec = recs.get(X().idOf(l));
    return `<button type="button" class="jr-row" data-open="${esc(X().idOf(l))}" data-family="${esc(fam)}">
      <span class="jr-date"><span class="asc-num">${d.getDate()}</span><small>${d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</small></span>
      <span class="jr-icon">${icon(SP().FAMILY_ICON[fam])}</span>
      <span class="jr-text"><span class="jr-title">${esc(SP().label(l.sport))}</span><span class="jr-sub">${esc(shortMetrics(l))}</span></span>
      <span class="jr-tags">${rec ? `<span class="asc-chip jr-badge am" title="${esc(rec.map((r) => r.label).join(", "))}">${icon("star")}Record</span>` : ""}${historical(l) ? '<span class="asc-chip jr-badge" title="Ajoutée plus de 30 jours après la séance : sans XP">Historique</span>' : ""}${syncBadge(l)}</span>
    </button>`;
  }

  function listHtml(list) {
    if (!list.length) return emptyHtml();
    const recs = recordIds();
    const groups = new Map();
    for (const l of list) {
      const d = new Date(l.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
    let out = "";
    let shown = 0;
    for (const [key, logs] of groups) {
      if (shown > 400) {
        out += `<p class="asc-small asc-faint jr-more">${F().number(list.length - shown)} séances plus anciennes : affine la recherche ou la période pour les voir.</p>`;
        break;
      }
      const [y, m] = key.split("-").map(Number);
      const mins = logs.reduce((n, l) => n + (minutes(l) || 0), 0);
      out += `<section class="jr-month" aria-label="${esc(new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}">
        <header class="jr-month-head"><h2>${esc(new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: y === new Date().getFullYear() ? undefined : "numeric" }))}</h2><span class="asc-small asc-muted">${logs.length} séance${logs.length > 1 ? "s" : ""}${mins ? ` · ${esc(F().duration(mins))}` : ""}</span></header>
        <div class="jr-rows">${logs.map((l) => rowHtml(l, recs)).join("")}</div></section>`;
      shown += logs.length;
    }
    return out;
  }

  function emptyHtml() {
    const any = source().length;
    if (ui.archived) return `<div class="asc-empty"><h2>Aucune séance archivée</h2><p>Une séance archivée sort de tes statistiques mais reste ici, restaurable à tout moment.</p></div>`;
    if (!any) return `<div class="asc-empty"><h2>Ton journal commence à ta première séance</h2><p>Course, musculation, escalade, padel : enregistre ce que tu as vraiment fait, en moins d’une minute.</p><a class="asc-btn asc-btn-primary" href="/training">${icon("plus")} Enregistrer une séance</a></div>`;
    return `<div class="asc-empty"><h2>Aucune séance ne correspond</h2><p>Change la période, la famille ou la recherche.</p><button type="button" class="asc-btn asc-btn-secondary" data-reset>${icon("restore")} Tout afficher</button></div>`;
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
    for (const l of source().filter((l) => ui.family === "all" || SP().familyOf(l.sport) === ui.family)) {
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
    return `<div class="asc-note ${errors.length ? "err" : ""} jr-pending">${icon(errors.length ? "alert" : "cloudUp")}<div class="asc-stack-sm">
      <p><strong>${items.length} séance${items.length > 1 ? "s" : ""} sur cet appareil</strong> ${errors.length ? `dont ${errors.length} refusée${errors.length > 1 ? "s" : ""} par le serveur (${esc(errors[0].reason || "données invalides")}).` : navigator.onLine ? "en cours d’envoi." : "partiront au retour du réseau."}</p>
      <div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-retry>${icon("cloudUp")} Réessayer</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-export-pending>${icon("download")} Exporter une copie</button></div></div></div>`;
  }

  function summaryHtml(list) {
    if (!list.length) return "";
    const mins = list.reduce((n, l) => n + (minutes(l) || 0), 0);
    const km = list.filter((l) => l.unit === "km").reduce((n, l) => n + (Number(l.val) || 0), 0);
    const days = new Set(list.map((l) => F().dateKey(l.date))).size;
    return `<dl class="jr-summary">
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

  function render() {
    if (!root) return;
    const list = filtered();
    const fams = Object.keys(SP().FAMILY_LABEL);
    const archivedCount = (window.state?.archivedHistory || []).length;
    const focus = document.activeElement?.id;
    root.innerHTML = `
      ${pendingHtml()}
      <div class="jr-tools">
        <div class="seance-search jr-search"><label class="sr-only" for="jr-q">Rechercher dans le journal</label><span class="seance-search-icon">${icon("search")}</span>
          <input id="jr-q" class="asc-input" type="search" autocomplete="off" placeholder="Sport, exercice, note, cotation…" value="${esc(ui.q)}"></div>
        <div class="jr-filters">
          <div class="asc-seg" role="group" aria-label="Vue">${[["list", "Liste"], ["calendar", "Calendrier"]].map(([k, l]) => `<button type="button" data-view="${k}" aria-pressed="${ui.view === k}">${l}</button>`).join("")}</div>
          ${ui.view === "list" ? `<label class="sr-only" for="jr-period">Période</label><select id="jr-period" class="jr-select">${PERIODS.map(([k, l]) => `<option value="${k}" ${ui.period === k ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
        </div>
        <div class="seance-chips jr-fams" role="group" aria-label="Famille">
          <button type="button" class="seance-chip" data-family="all" aria-pressed="${ui.family === "all"}">Tout</button>
          ${fams.map((f) => `<button type="button" class="seance-chip" data-family="${f}" aria-pressed="${ui.family === f}">${icon(SP().FAMILY_ICON[f])}${esc(SP().FAMILY_LABEL[f])}</button>`).join("")}
        </div>
      </div>
      ${ui.archived ? `<p class="asc-note">${icon("archive")}<span>Archives : ces séances sont hors statistiques. Ouvre une séance pour la restaurer.</span></p>` : ""}
      <div id="jr-results" aria-live="polite">${resultsHtml(list)}</div>
      <footer class="jr-foot">
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-archived>${icon(ui.archived ? "journal" : "archive")} ${ui.archived ? "Retour au journal" : `Archives${archivedCount ? ` (${archivedCount})` : ""}`}</button>
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-export>${icon("download")} Exporter (CSV)</button>
      </footer>`;
    if (focus) {
      const el = document.getElementById(focus);
      if (el) {
        el.focus();
        if (el.setSelectionRange && el.type === "search") el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }

  /* ---------- Detail ---------- */
  function rewardLine(l) {
    if (historical(l)) return { cls: "", text: "Séance historique : statistiques et records, sans XP." };
    const r = l.details?.serverReward;
    if (String(window.state?.user?.id || "").startsWith("guest_")) return { cls: "", text: `≈ ${F().number(P().effortOf(l).xp)} XP estimés (mode découverte).` };
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
      .filter(([, v]) => v !== null && v !== "" && v !== undefined && v !== false)
      .map(([k, v]) => [fields[k]?.label || EXTRA_LABELS[k] || k, v === true ? "Oui" : k === "pool" ? (v === "open" ? "Eau libre" : `${v} m`) : `${v}${fields[k]?.unit ? " " + fields[k].unit : ""}`]);
    const g = l.details?.gpxStats;
    if (g?.movingMinutes) rows.push(["Temps en mouvement", F().duration(g.movingMinutes)]);
    if (g?.descent) rows.push(["Dénivelé négatif", `−${F().number(g.descent)} m`]);
    if (!rows.length) return "";
    return `<section class="jr-detail-block"><p class="asc-eyebrow">Détails</p><dl class="jr-kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></section>`;
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

  function detailHtml(l) {
    const metrics = window.TitanMoment?.metrics(l) || [];
    const rw = rewardLine(l);
    const recs = recordIds().get(X().idOf(l)) || [];
    return `<div class="jr-detail">
      <dl class="moment-metrics">${metrics.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="asc-num">${esc(v)}</dd></div>`).join("")}</dl>
      ${recs.length ? `<p class="jr-record">${icon("star")}<span>${recs.length > 1 ? "Records actuels" : "Record actuel"} : ${esc(recs.map((r) => r.label).join(", "))}</span></p>` : ""}
      <p class="jr-reward ${rw.cls}">${esc(rw.text)}${l.syncStatus === "pending" ? " En attente de synchronisation." : ""}${l.syncStatus === "error" ? (historical(l) ? " Le serveur l’acceptera avec sa prochaine mise à jour : elle partira alors d’elle-même. Tu peux déjà l’exporter." : " Le serveur a refusé l’envoi : exporte cette séance puis enregistre-la de nouveau.") : ""}</p>
      ${exercisesHtml(l)}
      ${extrasHtml(l)}
      ${l.details?.note ? `<section class="jr-detail-block"><p class="asc-eyebrow">Note</p><p class="jr-note">${esc(l.details.note)}</p></section>` : ""}
      ${l.archived_at ? "" : compareHtml(l)}
      <div class="jr-actions">
        ${l.archived_at ? "" : `<button type="button" class="asc-btn asc-btn-secondary" data-edit>${icon("edit")} Corriger</button>`}
        ${l.archived_at ? "" : `<button type="button" class="asc-btn asc-btn-secondary" data-duplicate>${icon("copy")} Refaire</button>`}
        <button type="button" class="asc-btn asc-btn-ghost" data-toggle-archive>${icon(l.archived_at ? "restore" : "archive")} ${l.archived_at ? "Restaurer" : "Archiver"}</button>
      </div>
    </div>`;
  }

  function openDetail(id) {
    const l = X().find(id);
    if (!l) return window.titanShell.toast({ type: "warn", title: "Séance introuvable", message: "Elle a peut-être été archivée ou n’est pas encore synchronisée sur cet appareil." });
    const body = document.createElement("div");
    body.innerHTML = detailHtml(l);
    const d = window.titanShell.sheet({ title: SP().label(l.sport), eyebrow: `${new Date(l.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${F().time(l.date)}`, body });
    body.addEventListener("click", async (e) => {
      if (e.target.closest("[data-duplicate]")) return X().duplicate(l);
      if (e.target.closest("[data-edit]")) {
        d.close();
        return openEdit(l);
      }
      if (e.target.closest("[data-toggle-archive]")) {
        d.close();
        const archive = !l.archived_at;
        await window.titanShell.confirm({
          title: archive ? "Archiver cette séance ?" : "Restaurer cette séance ?",
          message: archive ? "Elle sort de tes statistiques, records et objectifs, et reste dans les archives." : "Elle revient dans ton journal, tes statistiques et tes records.",
          detail: "Les récompenses déjà obtenues restent inchangées ; aucune nouvelle récompense n’est attribuée.",
          confirmLabel: archive ? "Archiver" : "Restaurer",
          action: () => (archive ? X().archive(l) : X().restore(l)),
        });
      }
    });
  }

  /* ---------- Correction ---------- */
  function localInput(date) {
    const d = new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function openEdit(l) {
    const exercises = l.details?.exercises || [];
    const editableSets = exercises.length > 0 && !exercises.some((e) => e.kind === "hold");
    const climbing = SP().formOf(l.sport) === "climbing" || Boolean(l.details?.extras?.grade_system);
    const timeUnit = ["min", "h"].includes(l.unit);
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
      ${
        climbing
          ? `<div class="asc-form-grid"><label class="asc-field"><span>Meilleure réussie</span><input class="asc-input" name="max_done" value="${esc(l.details?.extras?.max_done || "")}"></label>
        <label class="asc-field"><span>Essais</span><input class="asc-input" type="number" min="0" max="200" name="attempts" value="${esc(l.details?.extras?.attempts ?? "")}"></label>
        <label class="asc-field"><span>Réussites</span><input class="asc-input" type="number" min="0" max="200" name="successful_routes" value="${esc(l.details?.extras?.successful_routes ?? "")}"></label></div>`
          : ""
      }
      <label class="asc-field"><span>Note</span><textarea name="note" maxlength="2000">${esc(l.details?.note || "")}</textarea></label>
      <p class="asc-small asc-faint">Statistiques et records sont recalculés à partir des mesures corrigées. Les récompenses restent celles de la séance initiale.</p>
      <p class="asc-small jr-edit-error" role="alert"></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="submit" class="asc-btn asc-btn-primary">Enregistrer</button></div>`;
    const d = window.titanShell.sheet({ title: "Corriger la séance", eyebrow: SP().label(l.sport), body });
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
      if (climbing) {
        const best = String(fd.get("max_done") || "").trim();
        const system = l.details?.extras?.grade_system || "Fontainebleau bloc";
        if (best && window.TitanInsights?.grade && !window.TitanInsights.grade(best, system)) return (err.textContent = `Cotation « ${best} » non reconnue pour ${system}.`);
        const n = (k) => (String(fd.get(k) || "").trim() === "" ? null : Math.round(Number(fd.get(k))));
        patch.extras = { max_done: best || null, attempts: n("attempts"), successful_routes: n("successful_routes") };
        if (patch.extras.attempts !== null && patch.extras.successful_routes !== null && patch.extras.successful_routes > patch.extras.attempts) return (err.textContent = "Les réussites ne peuvent pas dépasser les essais.");
      }
      const submit = body.querySelector("[type=submit]");
      submit.disabled = true;
      try {
        await X().update(l, patch);
        d.close();
        window.titanShell.toast({ type: "ok", title: "Séance corrigée", message: "Statistiques et records sont à jour." });
      } catch (error) {
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
    if (t.dataset.open) return openDetail(t.dataset.open);
    if (t.dataset.view) {
      ui.view = t.dataset.view;
      ui.day = null;
      savePrefs();
      return render();
    }
    if (t.dataset.family) {
      ui.family = t.dataset.family;
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
      ui = { ...ui, q: "", family: "all", period: "all", day: null };
      savePrefs();
      return render();
    }
    if (t.hasAttribute("data-archived")) {
      ui.archived = !ui.archived;
      ui.day = null;
      return render();
    }
    if (t.hasAttribute("data-export")) return window.titanExportSessionsCSV?.(filtered());
    if (t.hasAttribute("data-export-pending")) return window.titanExportPending?.();
    if (t.hasAttribute("data-retry")) {
      t.disabled = true;
      window.flushPendingTrainingLogs?.({ retry: true })
        .then((r) => window.titanShell.toast({ type: r?.remaining ? "warn" : "ok", title: r?.remaining ? "Envoi incomplet" : "Séances envoyées", message: r?.remaining ? `${r.remaining} séance(s) restent sur cet appareil.` : "Tout est synchronisé." }))
        .catch(() => window.titanShell.toast({ type: "warn", title: "Envoi impossible", message: "Tes séances restent conservées sur cet appareil." }))
        .finally(render);
    }
  }

  let inputTimer = null;
  function onInput(e) {
    if (e.target.id === "jr-q") {
      ui.q = e.target.value;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(renderResults, 120);
    }
  }
  function onChange(e) {
    if (e.target.id === "jr-period") {
      ui.period = e.target.value;
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
  ["titan:history-updated", "titan:pending-changed"].forEach((ev) => window.addEventListener(ev, queue));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
