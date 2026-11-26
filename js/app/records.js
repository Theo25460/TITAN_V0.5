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
  let viewContext = null;
  let awaitingHistory = false;
  const details = new Set();
  const context = () => ({ owner: window.state?.user?.id, client: window.titanClient, epoch: window.titanAccountTransition?.epoch });
  const currentContext = job => !!job?.owner && job.owner === window.state?.user?.id && job.client === window.titanClient && job.epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active;
  function invalidate() {
    awaitingHistory = true;
    viewContext = null;
    for (const detail of details) {
      detail.dialog.close();
      detail.dialog.remove();
    }
    details.clear();
    if (root) {
      root.innerHTML = '<p class="asc-note" role="status">Les records reviennent après la synchronisation de ton journal.</p>';
      root.setAttribute("aria-busy", "false");
    }
  }
  function activeView() {
    if (!awaitingHistory && currentContext(viewContext)) return true;
    invalidate();
    return false;
  }

  const logs = () => window.state?.history || [];
  const value = (r, v = r.value) => F().recordValue(r.unit, v);
  const all = () => (I()?.records?.(logs(), "all", Date.now()) || []).slice();

  /** Successive improvements of one record, oldest first (bounded work: one sport, 600 sessions). */
  function progression(rec) {
    const pool = logs()
      .filter((l) => l.sport === rec.sport && !l.archived_at)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-600);
    // Linear: each session's own value for this record (records() of a single session, same rules), then a running best. It used
    // to recompute every record on every prefix of the history (4 s for 600 strength sessions, per opening of the sheet).
    const score = (r) => (r.kind === "climbing" ? I().grade(r.value, r.log?.details?.extras?.grade_system)?.score ?? -Infinity : Number(r.value));
    const better = (a, b) => (rec.kind === "time" ? score(a) < score(b) : score(a) > score(b));
    const steps = [];
    let best = null;
    for (const l of pool) {
      const r = I().records([l], rec.sport, Date.now()).find((x) => x.id === rec.id);
      if (!r || (best && !better(r, best))) continue;
      best = r;
      steps.push({ value: r.value, date: r.log.date, log: r.log });
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

  const isFresh = (r) => r.kind !== "duration" && new Date(r.log.date).getTime() >= Date.now() - 30 * DAY;
  function cardHtml(r) {
    const fresh = isFresh(r);
    return `<button type="button" class="rc-card" data-record="${esc(r.id)}" data-kind="${esc(r.kind)}"${fresh ? ' data-fresh="true"' : ""}>
      <span class="rc-label">${esc(r.label)}</span>
      <strong class="rc-value asc-num">${esc(value(r))}</strong>
      <span class="rc-date">${esc(new Date(r.log.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }))}</span>
      ${fresh ? `<span class="sig-state is-rare rc-fresh">${icon("star")}Ce mois-ci</span>` : ""}
    </button>`;
  }

  /* The head of the page: the relic of mastery stands on an amber-inked plate with what was beaten in the last thirty days — each
     mark with the one it replaced. With records but none this month, the plate says so and shows the latest one. With no record at
     all the relic stays in the shade: nothing is shown as earned. */
  const RELIC = (size, locked) => `<span class="sig-object rc-relic${locked ? " is-locked" : ""}" aria-hidden="true"><img src="/assets/objects/relique-maitrise-256.webp" srcset="/assets/objects/relique-maitrise-256.webp 256w, /assets/objects/relique-maitrise-512.webp 512w" sizes="${size}px" width="${size}" height="${size}" alt="" decoding="async" draggable="false"></span>`;
  function vaultHtml(list, recent) {
    if (!list.length) return `<section class="sig-empty rc-none">${RELIC(96, true)}<h3>Aucun record pour l’instant</h3><p>Un record naît d’une séance : une distance, une durée sur un parcours, une charge, une cotation. Le premier arrive avec ta prochaine mesure.</p><a class="asc-btn asc-btn-primary" href="/training">${icon("plus")} Enregistrer une séance</a></section>`;
    const marks = list.filter((r) => r.kind !== "duration");
    const sports = new Set(marks.map((r) => r.sport)).size;
    const latest = marks.slice().sort((a, b) => new Date(b.log.date) - new Date(a.log.date))[0];
    const shown = recent.length ? recent : latest ? [latest] : [];
    const rows = shown.map((r) => {
      const steps = progression(r);
      const prev = steps.length > 1 ? steps[steps.length - 2] : null;
      return `<li><button type="button" class="rc-recent-item" data-record="${esc(r.id)}">
        <strong class="asc-num">${esc(value(r))}</strong>
        <span class="rc-recent-what"><span class="rc-recent-label">${esc(r.label)}</span><span class="rc-recent-sport">${esc(SP().label(r.sport))} · ${esc(F().relativeDay(r.log.date))}</span></span>
        <span class="rc-recent-prev">${prev ? `avant ${esc(value(r, prev.value))}` : "premier repère"}</span>
      </button></li>`;
    }).join("");
    return `<section class="sig-plate is-relief is-amber rc-recent rc-vault" aria-labelledby="rc-vault-title">
      <div class="rc-vault-head">${RELIC(120, false)}
        <div><h2 id="rc-vault-title">${recent.length ? `${recent.length === 1 ? "Un record battu" : `${recent.length} records battus`} ces 30 derniers jours` : "Pas de nouveau record ces 30 derniers jours"}</h2>
        <p class="rc-vault-count">${marks.length} record${marks.length > 1 ? "s" : ""} dans ${sports} sport${sports > 1 ? "s" : ""}${recent.length ? "" : latest ? " · le dernier ci-dessous" : ""}</p></div></div>
      ${rows ? `<ul class="rc-recent-list">${rows}</ul>` : ""}
    </section>`;
  }

  function render() {
    if (!root) return;
    if (awaitingHistory || window.titanAccountTransition?.active || !window.state?.user?.id) return invalidate();
    viewContext = context();
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
    // V1.6.6: records of a partial copy are those of the sessions this device holds; say so, as the journal does.
    const coverage = window.TitanHistoryWindow?.describe(window.titanHistoryCoverageOf?.(window.state?.user?.id), { online: navigator.onLine, loading: window.titanHistoryLoading === true });
    B().preserveFocus(() => { root.innerHTML = `
      ${coverage ? `<p class="asc-note${coverage.tone === "warn" ? " warn" : ""}" data-coverage="${esc(coverage.state)}" role="status">${icon(navigator.onLine ? "cloud" : "offline")}<span>${esc(coverage.text)}</span></p>` : ""}
      ${u.sport === "all" && !u.query && u.scope === "all" && u.family === "all" && result.page === 1 ? vaultHtml(list, recent) : ""}
      ${navigation.controls()}
      <div class="rc-sports">${result.items
        .map(
          (s) => `<section class="asc-section rc-sport" data-family="${esc(s.family)}">
        <div class="asc-section-head"><h2><span class="rc-sport-icon">${icon(SP().iconOf(s.sport))}</span>${esc(s.label)}</h2><span class="sn-sport-actions">${s.hasData ? `<span class="asc-small asc-muted">${s.records.length} record${s.records.length > 1 ? "s" : ""}</span>` : ""}${B().favoriteButton(s.sport, s.label)}</span></div>
        ${s.hasData ? `<div class="rc-grid">${s.records.map(cardHtml).join("")}</div>` : `<p class="asc-small asc-muted">Aucune donnée pour ce sport. <a href="/training?sport=${encodeURIComponent(s.sport)}">Enregistrer une séance</a></p>`}</section>`,
        )
        .join("")}</div>
      ${result.total || (!list.length && u.sport === "all" && !u.query && u.scope === "all" && u.family === "all") ? "" : navigation.empty()}${navigation.footer()}
      <p class="asc-small asc-faint rc-foot">Les records sont recalculés depuis ton journal : une séance corrigée ou archivée les met à jour. Les durées longues ne sont pas des objectifs ; elles restent des repères.</p>`; });
    root.setAttribute("aria-busy", "false");
  }

  /* The staircase of a record: one step per mark beaten, in time. Up is always better (a faster time climbs too). */
  function stepsChart(r, steps) {
    if (steps.length < 3) return "";
    const score = (s) => (r.kind === "climbing" ? I().grade(s.value, s.log?.details?.extras?.grade_system)?.score : Number(s.value));
    const ys = steps.map(score);
    if (ys.some((v) => !Number.isFinite(v))) return "";
    const t0 = new Date(steps[0].date).getTime(), t1 = new Date(steps[steps.length - 1].date).getTime();
    const lo = Math.min(...ys), hi = Math.max(...ys), W = 320, H = 104, P = 10;
    const x = (s) => Math.round((P + (t1 > t0 ? (new Date(s.date).getTime() - t0) / (t1 - t0) : 1) * (W - 2 * P)) * 10) / 10;
    const y = (v) => { const k = hi > lo ? (v - lo) / (hi - lo) : 1; return Math.round((H - P - (r.kind === "time" ? 1 - k : k) * (H - 2 * P - 8)) * 10) / 10; };
    let d = `M${x(steps[0])} ${y(ys[0])}`;
    for (let i = 1; i < steps.length; i++) d += ` H${x(steps[i])} V${y(ys[i])}`;
    const day = (s) => new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    const first = steps[0], last = steps[steps.length - 1];
    return `<figure class="rc-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${steps.length - 1} améliorations : de ${value(r, first.value)} le ${day(first)} à ${value(r, last.value)} le ${day(last)}`)}" preserveAspectRatio="none">
        <path class="rc-chart-area" d="${d} V${H} H${x(steps[0])} Z"/><path class="rc-chart-line" d="${d}" vector-effect="non-scaling-stroke"/></svg>
      <figcaption><span><strong class="asc-num">${esc(value(r, first.value))}</strong> ${esc(day(first))}</span><span><strong class="asc-num">${esc(value(r, last.value))}</strong> ${esc(day(last))}</span></figcaption></figure>`;
  }

  function detailHtml(r, steps) {
    return `
      <p class="rc-big asc-num">${esc(value(r))}</p>
      <p class="asc-small asc-muted">${esc(r.context || "")}</p>
      <a class="asc-row" data-record-source href="/journal?session=${encodeURIComponent(X().idOf(r.log))}"><span class="asc-row-icon am">${icon("star")}</span><span class="asc-row-main"><span class="asc-row-title">Séance source</span><span class="asc-row-sub">${esc(new Date(r.log.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</span></span>${icon("chevron")}</a>
      <div class="asc-row-flex">${window.TitanStory ? `<button type="button" class="asc-btn asc-btn-secondary" data-story-record>${icon("share")} Partager en story</button>` : ""}${window.TitanCard ? `<button type="button" class="asc-btn asc-btn-secondary" data-card-record>${icon("share")} Créer une image</button>` : ""}${window.TitanShare?.available() ? `<button type="button" class="asc-btn asc-btn-ghost" data-share-record>${icon("send")} Partager avec mes amis</button>` : ""}</div>
      ${steps.length > 1 ? `<section class="asc-stack-sm"><p class="asc-eyebrow">Progression</p>${stepsChart(r, steps)}<ol class="rc-steps">${steps
        .slice()
        .reverse()
        .map((s, i) => `<li${i === 0 ? ' class="is-current"' : ""}><span class="asc-num">${esc(value(r, s.value))}</span><span class="asc-small asc-muted">${esc(new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }))}</span></li>`)
        .join("")}</ol></section>` : `<p class="asc-small asc-faint">Premier repère : la prochaine séance comparable dira si tu le bats.</p>`}`;
  }

  const detailKey = (r, steps) => JSON.stringify([r.id, r.label, r.value, r.unit, r.context, X().idOf(r.log), r.log.date, r.log.syncStatus, steps.map(s => [s.value, s.date])]);

  function openRecord(id) {
    if (!activeView()) return;
    let r = all().find(x => x.id === id);
    if (!r) return;
    const job = viewContext;
    let steps = progression(r), generation = 0, closed = false;
    let key = detailKey(r, steps);
    const body = document.createElement("div");
    body.className = "asc-stack";
    body.innerHTML = detailHtml(r, steps);
    const entry = { dialog: null, update };
    const dialog = window.titanShell.sheet({ title: r.label, eyebrow: SP().label(r.sport), body, onClose: () => {
      closed = true;
      details.delete(entry);
      requestAnimationFrame(() => {
        if (!currentContext(job) || awaitingHistory || document.querySelector("dialog[open]") || document.activeElement !== document.body) return;
        const target = [...root.querySelectorAll("[data-record]")].find(el => el.dataset.record === id) || root.querySelector("#records-query");
        target?.focus({ preventScroll: true });
      });
    } });
    entry.dialog = dialog;
    details.add(entry);
    const live = () => !closed && dialog.open && dialog.isConnected && currentContext(job) && !awaitingHistory;
    const topmost = () => [...document.querySelectorAll("dialog[open]")].at(-1) === dialog;
    function restoreAction(selector) {
      if (live() && topmost() && [document.body, dialog].includes(document.activeElement)) body.querySelector(selector)?.focus({ preventScroll: true });
    }
    function update() {
      if (!currentContext(job)) { if (!currentContext(viewContext)) invalidate(); return; }
      if (!live()) return;
      const next = all().find(x => x.id === id);
      if (!next) { dialog.close(); return; }
      const focused = body.contains(document.activeElement) ? document.activeElement.closest("[data-story-record], [data-card-record], [data-share-record], [data-record-source]") : null;
      const selector = focused?.hasAttribute("data-story-record") ? "[data-story-record]" : focused?.hasAttribute("data-card-record") ? "[data-card-record]" : focused?.hasAttribute("data-share-record") ? "[data-share-record]" : focused ? "[data-record-source]" : null;
      const nextSteps = progression(next), nextKey = detailKey(next, nextSteps);
      if (nextKey === key) return;
      r = next;
      steps = nextSteps;
      key = nextKey;
      ++generation;
      body.innerHTML = detailHtml(r, steps);
      if (selector) restoreAction(selector);
    }
    body.addEventListener("click", e => {
      if (!live()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!currentContext(job) && !currentContext(viewContext)) invalidate();
        return;
      }
      const prev = steps.length > 1 ? steps[steps.length - 2] : null;
      // « Partager » (before V2): this record as a 9:16 success card; « avant » is the previous step of its own history.
      if (e.target.closest("[data-story-record]")) {
        const sourceGeneration = generation;
        void window.TitanStory.open({ kind: "achievement", input: {
          type: "record", title: r.label, value: value(r), sport: SP().label(r.sport), sportId: r.sport,
          previous: prev ? value(r, prev.value) : null, date: r.log.date, name: window.titanShell?.user?.()?.guest ? "" : window.titanShell?.user?.()?.name || "",
        } }, { isCurrent: () => live() && sourceGeneration === generation }).then(sheet => {
          if (sheet?.open) sheet.addEventListener("close", () => restoreAction("[data-story-record]"), { once: true });
          else restoreAction("[data-story-record]");
        });
      }
      if (e.target.closest("[data-card-record]")) {
        const sourceGeneration = generation;
        void window.TitanCard.open({
          kind: "record", eyebrow: `Record · ${SP().label(r.sport)}`, title: r.label, value: value(r),
          detail: prev ? `avant : ${value(r, prev.value)}` : "premier repère",
          date: new Date(r.log.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
          context: r.context || "", name: window.TitanCard.userName(), filename: "titan-record",
          isCurrent: () => live() && sourceGeneration === generation,
        }).then(sheet => {
          if (sheet?.open) sheet.addEventListener("close", () => restoreAction("[data-card-record]"), { once: true });
          else restoreAction("[data-card-record]");
        });
      }
      if (e.target.closest("[data-share-record]")) {
        void window.TitanShare.open({ kind: "record", title: `${SP().label(r.sport)} : ${r.label.toLowerCase()} ${value(r)}`, detail: prev ? `avant : ${value(r, prev.value)}` : "", sport: r.sport, logId: r.log.syncStatus === "confirmed" ? r.log.id : null }).then(() => restoreAction("[data-share-record]"));
      }
    }, true);
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
        if (!activeView()) { e.preventDefault(); return; }
        if (navigation.handle(e)) return render();
        const c = e.target.closest("[data-record]");
        if (c) openRecord(c.dataset.record);
      });
      ["input", "change"].forEach((event) => root.addEventListener(event, (e) => { if (activeView() && navigation.handle(e)) render(); }));
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
  window.addEventListener("titan:account-changing", invalidate);
  window.addEventListener("titan:account-changed", invalidate);
  window.addEventListener("titan:history-updated", () => {
    if (window.titanAccountTransition?.active) return invalidate();
    if (viewContext && !currentContext(viewContext)) invalidate();
    awaitingHistory = false;
    viewContext = context();
    for (const detail of [...details]) detail.update();
    queue();
  });
  window.addEventListener("titan:history-error", () => {
    if (awaitingHistory && root) root.innerHTML = '<p class="asc-note" role="status">Synchronisation du journal interrompue. Les records seront actualisés à sa reprise.</p>';
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
