/* TITAN 300 — Records: each mark with its source session, its context and its own history. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const SP = () => window.TitanSports;
  const I = () => window.TitanInsights;
  const X = () => window.TitanSessions;
  const DAY = 86400000;
  const KIND_ORDER = { time: 0, distance: 1, strength: 2, climbing: 3, duration: 9 };

  let root = null;
  let sportFilter = "all";

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
    if (!list.length) {
      root.innerHTML = `<div class="asc-empty"><h2>Tes records naîtront de tes séances</h2><p>Distance la plus longue, temps sur 5 ou 10 km, charge la plus lourde, cotation la plus dure : chaque record garde sa séance source et son contexte.</p><a class="asc-btn asc-btn-primary" href="/training">${icon("plus")} Enregistrer une séance</a></div>`;
      root.setAttribute("aria-busy", "false");
      return;
    }
    const sports = [...new Set(list.map((r) => r.sport))].sort((a, b) => SP().label(a).localeCompare(SP().label(b), "fr"));
    if (sportFilter !== "all" && !sports.includes(sportFilter)) sportFilter = "all";
    const recent = recentlyBroken(list);
    const shown = list.filter((r) => sportFilter === "all" || r.sport === sportFilter);
    const bySport = new Map();
    for (const r of shown.sort((a, b) => (KIND_ORDER[a.kind] ?? 5) - (KIND_ORDER[b.kind] ?? 5))) {
      if (!bySport.has(r.sport)) bySport.set(r.sport, []);
      bySport.get(r.sport).push(r);
    }
    root.innerHTML = `
      ${recent.length && sportFilter === "all" ? `<section class="asc-hero is-record rc-recent"><p class="asc-eyebrow am">Ces 30 derniers jours</p><div class="rc-recent-list">${recent
        .map((r) => `<button type="button" class="rc-recent-item" data-record="${esc(r.id)}"><span class="asc-small asc-muted">${esc(SP().label(r.sport))} · ${esc(r.label)}</span><strong class="asc-num">${esc(value(r))}</strong><span class="asc-small asc-faint">${esc(F().relativeDay(r.log.date))}</span></button>`)
        .join("")}</div></section>` : ""}
      ${sports.length > 1 ? `<div class="seance-chips jr-fams rc-filter" role="group" aria-label="Sport"><button type="button" class="seance-chip" data-sport-filter="all" aria-pressed="${sportFilter === "all"}">Tous</button>${sports.map((s) => `<button type="button" class="seance-chip" data-sport-filter="${esc(s)}" aria-pressed="${sportFilter === s}">${esc(SP().label(s))}</button>`).join("")}</div>` : ""}
      ${[...bySport.entries()]
        .map(
          ([sport, recs]) => `<section class="asc-section rc-sport" data-family="${esc(SP().familyOf(sport))}">
        <div class="asc-section-head"><h2><span class="rc-sport-icon">${icon(SP().FAMILY_ICON[SP().familyOf(sport)])}</span>${esc(SP().label(sport))}</h2><span class="asc-small asc-muted">${recs.length} record${recs.length > 1 ? "s" : ""}</span></div>
        <div class="rc-grid">${recs.map(cardHtml).join("")}</div></section>`,
        )
        .join("")}
      <p class="asc-small asc-faint rc-foot">Les records sont recalculés depuis ton journal : une séance corrigée ou archivée les met à jour. Les durées longues ne sont pas des objectifs ; elles restent des repères.</p>`;
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
    if (!root || !window.state?.user || !window.TitanInsights) return;
    if (!booted) {
      booted = true;
      SP().ensure();
      root.addEventListener("click", (e) => {
        const f = e.target.closest("[data-sport-filter]");
        if (f) {
          sportFilter = f.dataset.sportFilter;
          return render();
        }
        const c = e.target.closest("[data-record]");
        if (c) openRecord(c.dataset.record);
      });
      const q = new URLSearchParams(location.search).get("sport");
      if (q) sportFilter = q;
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
