/* TITAN 300 — Records: each mark with its source session, its context and its own history. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const I = () => window.TitanInsights;
  const X = () => window.TitanSessions;
  const B = () => window.TitanSportBrowser;
  const DAY = 86400000;
  const KIND_ORDER = { time: 0, distance: 1, strength: 2, climbing: 3, duration: 9 };

  let root = null;
  let navigation = null;

  const logs = () => window.state?.history || [];
  const value = (r, v = r.value) => F().recordValue(r.unit, v);
  const all = () => (I()?.records?.(logs(), "all", Date.now()) || []).slice();

  /** Successive improvements of one record, oldest first (bounded work: one sport, 600 sessions). */
  function progression(rec) {
    const pool = logs()
      .filter((l) => l.sport === rec.sport && !l.archived_at)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-600);
    const steps = [];
    const prefix = [];
    let last = null;
    for (const l of pool) {
      prefix.push(l);
      const r = I().records(prefix, rec.sport, Date.now()).find((x) => x.id === rec.id);
      if (!r) continue;
      const v = String(r.value);
      if (v !== last) {
        steps.push({ value: r.value, date: r.log.date, log: r.log });
        last = v;
      }
    }
    return steps;
  }

  function recentlyBroken(list) {
    const since = Date.now() - 30 * DAY;
    return list
      .filter((r) => r.kind !== "duration" && new Date(r.log.date).getTime() >= since)
      .sort((a, b) => new Date(b.log.date) - new Date(a.log.date))
      .slice(0, 3);
  }

  function cardHtml(r) {
    return `<button type="button" class="rc-card" data-record="${esc(r.id)}" data-kind="${esc(r.kind)}">
      <span class="rc-label">${esc(r.label)}</span>
      <strong class="rc-value asc-num">${esc(value(r))}</strong>
      <span class="rc-date">${esc(new Date(r.log.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }))}</span>
    </button>`;
  }

  function render() {
    if (!root) return;
    const list = all();
    const recent = recentlyBroken(list);
    const bySport = new Map();
    for (const r of list.sort((a, b) => (KIND_ORDER[a.kind] ?? 5) - (KIND_ORDER[b.kind] ?? 5))) {
      if (!bySport.has(r.sport)) bySport.set(r.sport, []);
      bySport.get(r.sport).push(r);
    }
    const lastActivity = new Map();
    for (const l of logs()) {
      if (l.archived_at || new Date(l.date).getTime() > Date.now()) continue;
      if (!lastActivity.has(l.sport) || new Date(l.date) > new Date(lastActivity.get(l.sport))) lastActivity.set(l.sport, l.date);
    }
    const groups = B().entries([...bySport].map(([sport, records]) => ({ sport, records, last: lastActivity.get(sport), sortLast: records.reduce((last, r) => new Date(r.log.date) > new Date(last || 0) ? r.log.date : last, null) })));
    const result = navigation.select(groups);
    const u = navigation.settings;
    B().preserveFocus(() => { root.innerHTML = `
      ${recent.length && u.sport === "all" && !u.query && u.scope === "all" && u.family === "all" && result.page === 1 ? `<section class="asc-hero is-record rc-recent"><p class="asc-eyebrow am">Ces 30 derniers jours</p><div class="rc-recent-list">${recent
        .map((r) => `<button type="button" class="rc-recent-item" data-record="${esc(r.id)}"><span class="asc-small asc-muted">${esc(SP().label(r.sport))} · ${esc(r.label)}</span><strong class="asc-num">${esc(value(r))}</strong><span class="asc-small asc-faint">${esc(F().relativeDay(r.log.date))}</span></button>`)
        .join("")}</div></section>` : ""}
      ${navigation.controls()}
      ${!list.length && !u.query && u.scope === "all" ? `<p class="asc-small asc-muted">Tes records naîtront de tes séances, avec leur source et leur contexte. <a href="/training">Enregistrer une séance</a></p>` : ""}
      ${result.items
        .map(
          (s) => `<section class="asc-section rc-sport" data-family="${esc(s.family)}">
        <div class="asc-section-head"><h2><span class="rc-sport-icon">${icon(SP().FAMILY_ICON[s.family])}</span>${esc(s.label)}</h2><span class="sn-sport-actions">${s.hasData ? `<span class="asc-small asc-muted">${s.records.length} record${s.records.length > 1 ? "s" : ""}</span>` : ""}${B().favoriteButton(s.sport, s.label)}</span></div>
        ${s.hasData ? `<div class="rc-grid">${s.records.map(cardHtml).join("")}</div>` : `<p class="asc-small asc-muted">Aucune donnée pour ce sport. <a href="/training?sport=${encodeURIComponent(s.sport)}">Enregistrer une séance</a></p>`}</section>`,
        )
        .join("")}
      ${result.total ? "" : navigation.empty()}${navigation.footer()}
      <p class="asc-small asc-faint rc-foot">Les records sont recalculés depuis ton journal : une séance corrigée ou archivée les met à jour. Les durées longues ne sont pas des objectifs ; elles restent des repères.</p>`; });
    root.setAttribute("aria-busy", "false");
  }

  function openRecord(id) {
    const r = all().find((x) => x.id === id);
    if (!r) return;
    const steps = progression(r);
    const body = document.createElement("div");
    body.className = "asc-stack";
    body.innerHTML = `
      <p class="rc-big asc-num">${esc(value(r))}</p>
      <p class="asc-small asc-muted">${esc(r.context || "")}</p>
      <a class="asc-row" href="/journal?session=${encodeURIComponent(X().idOf(r.log))}"><span class="asc-row-icon am">${icon("star")}</span><span class="asc-row-main"><span class="asc-row-title">Séance source</span><span class="asc-row-sub">${esc(new Date(r.log.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</span></span>${icon("chevron")}</a>
      <div class="asc-row-flex">${window.TitanCard ? `<button type="button" class="asc-btn asc-btn-secondary" data-card-record>${icon("share")} Créer une image</button>` : ""}${window.TitanShare?.available() ? `<button type="button" class="asc-btn asc-btn-ghost" data-share-record>${icon("send")} Partager avec mes amis</button>` : ""}</div>
      ${steps.length > 1 ? `<section class="asc-stack-sm"><p class="asc-eyebrow">Progression</p><ol class="rc-steps">${steps
        .slice()
        .reverse()
        .map((s, i) => `<li${i === 0 ? ' class="is-current"' : ""}><span class="asc-num">${esc(value(r, s.value))}</span><span class="asc-small asc-muted">${esc(new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }))}</span></li>`)
        .join("")}</ol></section>` : `<p class="asc-small asc-faint">Premier repère : la prochaine séance comparable dira si tu le bats.</p>`}`;
    window.titanShell.sheet({ title: r.label, eyebrow: SP().label(r.sport), body });
    body.querySelector("[data-card-record]")?.addEventListener("click", () => {
      const prev = steps.length > 1 ? steps[steps.length - 2] : null;
      window.TitanCard.open({
        kind: "record",
        eyebrow: `Record · ${SP().label(r.sport)}`,
        title: r.label,
        value: value(r),
        detail: prev ? `avant : ${value(r, prev.value)}` : "premier repère",
        date: new Date(r.log.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
        context: r.context || "",
        name: window.TitanCard.userName(),
        filename: "titan-record",
      });
    });
    body.querySelector("[data-share-record]")?.addEventListener("click", () => {
      const prev = steps.length > 1 ? steps[steps.length - 2] : null;
      window.TitanShare.open({ kind: "record", title: `${SP().label(r.sport)} : ${r.label.toLowerCase()} ${value(r)}`, detail: prev ? `avant : ${value(r, prev.value)}` : "", sport: r.sport, logId: r.log.syncStatus === "confirmed" ? r.log.id : null });
    });
  }

  let booted = false;
  function start() {
    root = document.getElementById("records");
    if (!root || !window.state?.user || !window.TitanInsights || !B()) return;
    if (!booted) {
      booted = true;
      SP().ensure();
      navigation = B().create("records", { sorts: [["alphabetical", "Nom A–Z"], ["recent", "Records les plus récents"]] });
      root.addEventListener("click", (e) => {
        if (navigation.handle(e)) return render();
        const c = e.target.closest("[data-record]");
        if (c) openRecord(c.dataset.record);
      });
      ["input", "change"].forEach((event) => root.addEventListener(event, (e) => { if (navigation.handle(e)) render(); }));
      const q = new URLSearchParams(location.search).get("sport");
      if (q) navigation.settings.sport = q;
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
  window.addEventListener("titan:history-updated", queue);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
