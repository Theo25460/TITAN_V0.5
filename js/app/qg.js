/* TITAN — QG: what matters now. The page opens on the painting of the world in progress; under it the rank and the XP as one line,
   then the one action of the day (the only slab of colour), the week as a programme, and on a wide screen a second column with the
   chapter, the two doors the navigation does not show, and the last sessions. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const F = () => window.TitanFormat;
  const P = () => window.TitanProgress;
  const D = () => window.TitanData;
  const root = () => document.getElementById("qg");
  let goalsCache = [];
  let guestToImport = 0;
  let renderQueued = false;
  let context = null, readSequence = 0, cadenceDialog = null, importJob = null;

  function current(ctx) {
    return !!ctx && context === ctx && ctx.owner === D().owner() && ctx.data === D() && ctx.client === window.titanClient
      && ctx.epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active;
  }
  function invalidate() {
    readSequence++; context = null; goalsCache = []; guestToImport = 0; importJob = null;
    const el = root();
    if (el) { el.innerHTML = '<p class="asc-small asc-muted">Synchronisation du compte…</p>'; el.setAttribute("aria-busy", "true"); }
    const title = document.getElementById("qg-title"); if (title) title.textContent = "Ton QG";
    const dialog = cadenceDialog; cadenceDialog = null; if (dialog?.open) dialog.close();
  }
  function adopt() {
    if (current(context)) return context;
    invalidate();
    if (!D()?.owner() || window.titanAccountTransition?.active) return null;
    context = { owner: D().owner(), data: D(), client: window.titanClient, epoch: window.titanAccountTransition?.epoch };
    return context;
  }
  async function refreshData() {
    const ctx = adopt(); if (!ctx) return;
    const request = ++readSequence;
    const [goals, candidates] = await Promise.allSettled([
      Promise.resolve().then(() => current(ctx) ? ctx.data.goals() : []),
      Promise.resolve().then(() => current(ctx) ? ctx.data.guestCandidates() : []),
    ]);
    if (!current(ctx) || request !== readSequence) return;
    goalsCache = goals.status === "fulfilled" && Array.isArray(goals.value) ? goals.value : [];
    guestToImport = candidates.status === "fulfilled" && Array.isArray(candidates.value) ? candidates.value.length : 0;
    queue();
  }

  const TONE = {
    cy: { eyebrow: "À faire maintenant", cls: "is-accent" },
    am: { eyebrow: "Moment remarquable", cls: "is-record" },
    err: { eyebrow: "Attention", cls: "is-error" },
    ok: { eyebrow: "Aujourd’hui", cls: "is-accent" },
    info: { eyebrow: "Repère", cls: "" },
  };

  function heroHtml(a) {
    const tone = TONE[a.tone] || TONE.cy;
    // The slab says what to do; a label above its title is kept only when it carries something the title does not (a draft, a record, an alert).
    const label = a.eyebrow || (a.tone === "err" || a.tone === "am" ? tone.eyebrow : "");
    return `<section class="asc-hero qg-hero ${tone.cls} ${a.value ? "has-figure" : ""} asc-appear" aria-labelledby="qg-hero-title">
      ${label ? `<p class="asc-eyebrow qg-hero-label">${esc(label)}</p>` : ""}
      <h2 id="qg-hero-title" class="qg-hero-title">${esc(a.title)}</h2>
      ${a.value ? `<p class="qg-hero-figure asc-num" aria-label="${esc(a.value)}">${esc(a.value)}</p>` : ""}
      <p class="asc-lead">${esc(a.text)}</p>
      <div class="asc-actions qg-hero-actions">
        <a id="qg-hero-cta" class="asc-btn asc-btn-primary" href="${esc(a.cta.href)}">${esc(a.cta.label)} ${icon("arrow")}</a>
        ${a.why ? `<details class="qg-why"><summary>Pourquoi ce repère ?</summary><p>${esc(a.why)}</p></details>` : ""}
      </div>
    </section>`;
  }

  /** 106 -> 1<small>h</small>46 ; 45 -> 45<small>min</small>. */
  function statDur(min) {
    const m = Math.round(Math.abs(Number(min) || 0));
    if (m < 60) return `${m}<small>min</small>`;
    return `${Math.floor(m / 60)}<small>h</small>${String(m % 60).padStart(2, "0")}`;
  }

  function weekHtml(cad, recapNow, hasSessions) {
    const f = F();
    const w = recapNow.week;
    const notches = cad.weeks
      .map((wk, i) => {
        const last = i === cad.weeks.length - 1;
        const period = last ? "Semaine en cours" : `Semaine du ${new Date(wk.start + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
        const label = wk.state === "pause" ? `${period} : cadence en pause`
          : last
          ? `Semaine en cours : ${wk.activeDays} jour${wk.activeDays > 1 ? "s" : ""} actif${wk.activeDays > 1 ? "s" : ""} sur ${cad.target}`
          : `${period} : ${
              wk.state === "held" ? "tenue" : `${wk.activeDays} jour${wk.activeDays > 1 ? "s" : ""} actif${wk.activeDays > 1 ? "s" : ""}`
            }`;
        return `<span class="asc-notch" data-state="${wk.state}" style="--fill:${wk.fill}%" role="img" aria-label="${esc(label)}" title="${esc(label)}"></span>`;
      })
      .join("");
    const status = cad.currentPaused ? "<strong>Cadence en pause</strong>" : cad.remaining === 0
      ? `<strong class="qg-held">${icon("check")} Semaine tenue</strong>`
      : `<strong>${cad.currentDays}/${cad.target}</strong> jour${cad.target > 1 ? "s" : ""} actif${cad.target > 1 ? "s" : ""} cette semaine`;
    const delta = recapNow.deltaMinutes;
    // A new account reads its week target only: three zeros and « pas encore d’historique » said nothing (V13-40, ANTI-IA-06).
    const stats = hasSessions ? `<div class="asc-stats">
          <div class="asc-stat"><span class="asc-stat-value">${w.sessions}</span><span class="asc-stat-label">séance${w.sessions > 1 ? "s" : ""}</span></div>
          <div class="asc-stat"><span class="asc-stat-value">${statDur(w.minutes)}</span><span class="asc-stat-label">de pratique${w.estimatedMinutes ? " (en partie estimée)" : ""}</span></div>
          ${w.distance ? `<div class="asc-stat"><span class="asc-stat-value">${f.number(w.distance, 1)}<small>km</small></span><span class="asc-stat-label">parcourus</span></div>` : ""}
          ${delta === null ? "" : `<div class="asc-stat" title="Comparé à la moyenne de tes 4 dernières semaines, au même jour de la semaine"><span class="asc-stat-value ${delta > 0 ? "is-up" : ""}">${Math.round(delta) === 0 ? "=" : statDur(delta)}</span><span class="asc-stat-label">${Math.round(delta) === 0 ? "comme d’habitude à ce stade" : delta > 0 ? "de plus que d’habitude à ce stade" : "de moins que d’habitude à ce stade"}</span></div>`}
        </div>` : "";
    const held = hasSessions ? `<span class="asc-faint">${cad.held} semaine${cad.held > 1 ? "s" : ""} tenue${cad.held > 1 ? "s" : ""} sur les ${cad.window} dernières · ${f.number(cad.lifetimeHeld)} au total</span>`
      : `<span class="asc-faint">Une semaine est tenue quand tu atteins ta semaine type. Le repos ne coûte rien.</span>`;
    return `<section class="asc-section asc-appear" aria-labelledby="qg-week">
      <div class="asc-section-head"><h2 id="qg-week">Cette semaine</h2><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-action="cadence">Semaine type : ${cad.target} jour${cad.target > 1 ? "s" : ""} ${icon("edit")}</button></div>
      <div class="qg-week${hasSessions ? "" : " is-new"}">
        ${stats}
        ${programHtml(hasSessions)}
        <div class="qg-cadence">
          <div class="asc-notches" aria-label="Cadence des 8 dernières semaines">${notches}</div>
          <div class="asc-between asc-small" style="flex-wrap:wrap;gap:var(--s1) var(--s3)"><span class="asc-muted">${status}</span>${held}</div>
        </div>
      </div>
    </section>`;
  }

  /* The week as a programme: one line per sport, one column per day, the usual week as dashed frames. On a Monday morning the week
     is still empty: last week is drawn under it, so the figure never opens on a blank grid. */
  function programHtml(hasSessions) {
    const V = window.TitanProgramView;
    if (!V || !window.TitanProgram || !hasSessions) return "";
    const now = new Date();
    const list = P().activeLogs(D().logs());
    const plan = D().plan ? D().plan().map((p) => p.sport) : null;
    const grid = V.week(list, { now, plan });
    const before = new Date(now); before.setDate(before.getDate() - 7);
    const previous = grid.totals.sessions === 0 ? V.week(list, { now, start: before }) : null;
    return `<div class="qg-program"><a class="qg-program-link" href="/stats" aria-label="Voir ma semaine dans Progrès">${V.html(grid)}</a>
      ${previous && previous.totals.sessions ? `<p class="asc-small asc-muted qg-program-label">La semaine dernière</p>${V.html(previous, { label: "Programme de la semaine dernière" })}` : ""}</div>`;
  }

  /* The rank, the level and the XP towards the next one, in one strip at the top of the QG (same order as the Android header).
     The bar is drawn only from a server-confirmed progression, or from the local estimate of the discovery mode, named as such. */
  function ascentHtml(p) {
    const f = F();
    const pct = Math.max(0, Math.min(100, Math.round((p.xp / Math.max(1, p.next)) * 100)));
    const nextRank = p.nextRank ? `Prochain rang : <strong>${esc(p.nextRank.name)}</strong> au niveau ${p.nextRank.level}.` : "Tu as atteint le dernier rang. La progression continue.";
    const u = window.titanShell?.user?.();
    const known = p.guest || p.confirmed;
    const portrait = u ? `<span class="qg-portrait" style="--p:${known ? pct : 0}%" aria-hidden="true"><img src="/assets/renaissance/${esc(u.avatar)}-s.webp" alt="" width="64" height="64" decoding="async"></span>` : "";
    return `<section class="qg-ascent asc-appear" aria-labelledby="qg-ascent">
      <div class="qg-rank">
        ${portrait}
        <div class="qg-rank-main">
          <h2 id="qg-ascent" class="qg-rank-name">Niveau ${p.level} · ${esc(p.rank.name)}</h2>
          ${known ? `<div class="asc-ascent" role="progressbar" aria-valuemin="0" aria-valuemax="${p.next}" aria-valuenow="${p.xp}" aria-label="Progression vers le niveau ${p.level + 1}"><span style="--p:${pct}%"></span></div>
          <p class="asc-small asc-muted qg-ascent-line"><span class="qg-xp">${p.guest ? "≈ " : ""}${f.number(p.xp)} / ${f.number(p.next)} XP</span> ${p.guest ? "· estimation" : `vers le niveau ${p.level + 1}`}</p>`
          : `<p class="asc-small asc-muted qg-ascent-line">La barre du niveau s’affiche dès que le serveur répond.</p>`}
        </div>
        ${window.TitanCrest ? `<div class="qg-rank-reward"><span class="qg-crest">${window.TitanCrest.svg(window.TitanCrest.rankIdOf(p.level), 64)}</span></div>` : ""}
      </div>
      <div class="qg-ascent-foot">
        <details class="qg-why"><summary>Pourquoi mon niveau monte ?</summary><p>${nextRank} Ton niveau monte avec l’effort réel (durée × ressenti), pas avec le nombre de séances. ${D().rulesV300() ? "1 minute d’effort modéré ≈ 10 XP, quel que soit ton sport." : "L’XP est calculée par le serveur à chaque séance."} Les mêmes plafonds par jour et par semaine s’appliquent à tout le monde, et un jour de repos ne te retire rien.${p.guest ? " En mode découverte, le calcul est fait sur cet appareil et reste indicatif." : ""}</p></details>
        <a class="asc-link asc-small" href="/profile">Profil ${icon("chevron")}</a>
      </div>
    </section>`;
  }

  /* What a session brought, said only as far as it is known: official XP once the server confirmed, an estimate in discovery mode,
     an explicit wait otherwise. Nothing is shown as earned before the confirmation (V13-43, ANTI-IA-03). */
  function gainHtml(l, guest) {
    const f = F();
    if (l.syncStatus === "error") return '<span class="asc-chip err">À corriger</span>';
    if (l.details?.historical) return '<span class="asc-chip">Historique · sans XP</span>';
    if (guest) { const xp = P().effortOf(l).xp || 0; return xp ? `<span class="qg-gain is-estimate">≈ ${f.number(xp)} XP estimés</span>` : ""; }
    if (l.syncStatus === "pending") return '<span class="asc-chip warn">XP en attente</span>';
    const r = l.details?.serverReward;
    if (l.syncStatus === "confirmed" && r && typeof r === "object" && r.reward_held) return '<span class="asc-chip warn">XP en vérification</span>';
    const xp = Number(r?.xp ?? l.xp) || 0;
    return l.syncStatus === "confirmed" && xp > 0 ? `<span class="qg-gain">+${f.number(xp)} XP</span>` : "";
  }

  function lastHtml(list, guest) {
    const f = F();
    const recent = list.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
    if (!recent.length) return "";
    const row = (last) => {
      const meta = P().sportMeta(last.sport);
      const m = P().minutesOf(last);
      const main = last.unit === "km" ? f.distance(last.val) : last.unit === "kg" && Number(last.val) > 0 ? f.weight(last.val) : f.duration(m.minutes);
      const sub = [f.relativeDay(last.date), m.minutes && last.unit === "km" ? f.duration(m.minutes) : "", last.unit === "km" && m.minutes && !m.estimated ? f.pace(last.val, m.minutes) : ""]
        .filter(Boolean)
        .join(" · ");
      return `<a class="asc-row" href="/journal?log=${encodeURIComponent(last.client_event_id || last.id)}">
        <span class="asc-row-icon">${icon(window.TitanSports?.iconOf ? window.TitanSports.iconOf(last.sport) : familyIcon(meta.family))}</span>
        <span class="asc-row-main"><span class="asc-row-title">${esc(meta.label)}</span><span class="asc-row-sub">${esc(sub)}</span></span>
        <span class="asc-row-end"><strong>${esc(main)}</strong>${gainHtml(last, guest)}</span>
      </a>`;
    };
    return `<section class="asc-section asc-appear" aria-labelledby="qg-last">
      <div class="asc-section-head"><h2 id="qg-last">${recent.length > 1 ? "Dernières séances" : "Dernière séance"}</h2><a class="asc-link asc-small" href="/journal">Journal ${icon("chevron")}</a></div>
      <div class="asc-list">${recent.map(row).join("")}</div>
    </section>`;
  }

  function familyIcon(family) {
    return { endurance: "run", force: "weight", technique: "mountain", jeu: "target", mobilite: "leaf" }[family] || "bolt";
  }

  function insightsHtml(items) {
    if (!items.length) return "";
    return `<section class="asc-section asc-appear" aria-labelledby="qg-insights">
      <div class="asc-section-head"><h2 id="qg-insights">Repères</h2></div>
      <ul class="asc-list qg-insights">${items
        .map(
          (i) => `<li class="qg-insight" data-tone="${i.tone}">
          <span class="asc-row-icon">${icon(i.tone === "am" ? "trophy" : i.tone === "err" ? "alert" : i.id.startsWith("goal") ? "target" : i.id.startsWith("mastery") ? "ascent" : "sparkle")}</span>
          <div class="asc-row-main"><a class="asc-row-title" href="${esc(i.cta?.href || "#")}">${esc(i.title)}</a><span class="asc-row-sub">${esc(i.text)}</span>
          <details class="qg-why"><summary>Pourquoi ?</summary><p>${esc(i.why)}</p></details></div>
        </li>`,
        )
        .join("")}</ul>
    </section>`;
  }

  function goalHtml(goals, list) {
    const f = F();
    const active = goals.filter((g) => !g.archived_at).map((g) => ({ g, p: window.TitanInsights.goalProgress(g, list) })).filter((x) => !x.p.ended && !x.p.complete);
    if (!active.length)
      return `<a class="asc-row" href="/objectifs"><span class="asc-row-icon">${icon("target")}</span><span class="asc-row-main"><span class="asc-row-title">Fixer un objectif</span><span class="asc-row-sub">Séances, minutes ou kilomètres, sur la période de ton choix.</span></span>${icon("chevron")}</a>`;
    const { g, p } = active.sort((a, b) => b.p.ratio - a.p.ratio)[0];
    const val = g.metric === "distance" ? `${f.number(p.value, 1)} / ${f.number(g.target)} km` : g.metric === "minutes" ? `${f.duration(p.value)} / ${f.duration(g.target)}` : `${p.value} / ${g.target}`;
    return `<a class="asc-row qg-goal" href="/objectifs"><span class="asc-row-icon">${icon("target")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(g.title)}</span>
      <span class="asc-ascent thin" aria-hidden="true"><span style="--p:${Math.round(p.ratio * 100)}%"></span></span>
      <span class="asc-row-sub">${esc(val)} · jusqu’au ${new Date(g.end_date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span></span>${icon("chevron")}</a>`;
  }

  function adventureHtml(canClaim) {
    const s = window.TitanAdventure?.snapshot;
    const C = window.TitanCodex;
    if (!s || !C) return "";
    const c = (s.campaigns || []).find((x) => x.id === s.selected_world && x.chapter > 0) || (s.campaigns || []).find((x) => x.chapter > 0 && x.chapter <= 9);
    if (!c)
      return `<a class="asc-row" href="/adventure"><span class="asc-row-icon">${icon("compass")}</span><span class="asc-row-main"><span class="asc-row-title">Commencer l’aventure</span><span class="asc-row-sub">Démarre une campagne avant ta prochaine séance pour y faire compter tes jours actifs.</span></span>${icon("chevron")}</a>`;
    const world = C.worlds.find((w) => w.id === c.id);
    if (c.chapter > 9)
      return `<a class="asc-row" href="/adventure"><span class="asc-row-icon">${icon("compass")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(world?.name || "Monde")} terminé</span><span class="asc-row-sub">Choisis ton prochain horizon.</span></span>${icon("chevron")}</a>`;
    const chapter = world?.chapters?.[c.chapter - 1];
    const progress = P().campaignProgress(c);
    const summary = progress.objectives.map(o => `${F().number(o.value)}/${F().number(o.target)} ${o.id === "days" ? c.route === "journal" ? "jours annotés" : "jours" : "min"}`).join(" · ");
    const remaining = progress.ready ? canClaim ? "Étape prête à valider" : "Connexion nécessaire pour valider" : progress.objectives.filter(o => o.remaining > 0).map(o => `${F().number(o.remaining)} ${o.id === "days" ? `jour${o.remaining > 1 ? "s" : ""} restant${o.remaining > 1 ? "s" : ""}` : "min d’effort restantes"}`).join(" · ");
    return `<a class="asc-row" href="/adventure?world=${esc(c.id)}"><span class="asc-row-icon">${icon("compass")}</span><span class="asc-row-main"><span class="asc-row-title">${esc(chapter?.name || `Chapitre ${c.chapter}`)}</span>
      <span class="asc-ascent thin" aria-hidden="true"><span style="--p:${progress.percent}%"></span></span>
      <span class="asc-small asc-muted" data-rpg-summary>${esc(world?.name || "")} · chapitre ${c.chapter}/9 · ${esc(summary)} · ${esc(remaining)}</span></span>${icon("chevron")}</a>`;
  }

  /* V11-17: in the first week of a month, offer last month's report once. Optional, dismissible, remembered on this device only. */
  const monthKey = (now) => `titan.month-report.${window.state?.user?.id || "guest"}.${now.getFullYear()}-${now.getMonth() + 1}`;
  function monthPromptHtml(now) {
    if (now.getDate() > 7 || !window.TitanMonthReport) return "";
    try { if (localStorage.getItem(monthKey(now))) return ""; } catch { /* storage unavailable: show it, it is harmless */ }
    const m = window.TitanMonthReport.build(D().logs(), { now, offset: 1, minutesOf: (l) => P().minutesOf(l) });
    if (!m.sessions) return "";
    return `<div class="asc-note qg-month">${icon("star")}<div><strong>Ton bilan de ${window.TitanMonthReport.MONTHS[m.from.getMonth()]} est prêt</strong> · ${m.activeDays} jour${m.activeDays > 1 ? "s" : ""} actif${m.activeDays > 1 ? "s" : ""}, ${m.sports.length} sport${m.sports.length > 1 ? "s" : ""}. <a class="asc-link" href="/stats?mois=1">Le voir</a> · <button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-action="dismiss-month">Plus tard</button></div></div>`;
  }

  /* V11-19: your sports one tap from a new session. Recent first, then favourites; nothing is shown before there is something to show. */
  function shortcutsHtml(list) {
    const sports = window.TitanSports, cfg = window.SPORTS_CONFIG;
    if (!sports || !cfg) return "";
    const recent = list.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map((l) => l.sport);
    const favorites = Array.isArray(window.state?.user?.favoriteSports) ? window.state.user.favoriteSports : [];
    const ids = [...new Set([...recent.slice(0, 20), ...favorites])].filter((id) => cfg[id]).slice(0, 4);
    if (!ids.length) return "";
    return `<section class="asc-section asc-appear" aria-labelledby="qg-sports"><div class="asc-section-head"><h2 id="qg-sports">Tes sports</h2></div>
      <div class="seance-chips">${ids.map((id) => `<a class="seance-chip" href="/training?sport=${encodeURIComponent(id)}">${icon(sports.iconOf(id))}${esc(sports.label(id))}</a>`).join("")}</div></section>`;
  }

  function guestHtml() {
    return `<div class="asc-note qg-guest">${icon("phone")}<div><strong>Mode découverte</strong> · tes séances restent sur cet appareil. <a class="asc-link" href="/login?mode=signup">Créer un compte</a> pour les sauvegarder et les reprendre partout.</div></div>`;
  }

  /* The navigation already reaches Séance, Aventure and Progrès from every page. The QG shows the two places it does not: the
     circle and the planned week. Two ruled doors, not tiles. */
  function doorsHtml() {
    const door = (href, name, label, sub) => `<a class="qg-door" href="${href}">${icon(name)}<span class="qg-door-text"><strong>${label}</strong><small>${esc(sub)}</small></span>${icon("chevron")}</a>`;
    return `<nav class="qg-doors" aria-label="Raccourcis du QG">
      ${door("/social", "group", "Ma communauté", "Amis, défis, clubs")}
      ${door("/prevoir", "calendar", "Prévoir ma semaine", "Tes jours de sport, à l’avance")}
    </nav>`;
  }

  /* The painting at the top of the page is the world in progress (the valley until one is chosen). */
  function paintBanner() {
    const img = document.getElementById("qg-art");
    const s = window.TitanAdventure?.snapshot, C = window.TitanCodex;
    if (!img || !s || !C?.worlds) return;
    const campaign = (s.campaigns || []).find((x) => x.id === s.selected_world && x.chapter > 0) || (s.campaigns || []).find((x) => x.chapter > 0 && x.chapter <= 9);
    const world = C.worlds.find((w) => w.id === (campaign?.id || s.selected_world));
    const image = /^[a-z]+$/.test(world?.image || "") ? world.image : "valley";
    if (img.dataset.world === image) return;
    img.dataset.world = image;
    img.srcset = `/assets/renaissance/${image}-small.webp 800w, /assets/renaissance/${image}.webp 1600w`;
    img.src = `/assets/renaissance/${image}-small.webp`;
  }

  /* A new account: what TITAN does, in three lines, under the single action. Shown until the first session exists. */
  function howHtml() {
    return `<section class="asc-section qg-how asc-appear" aria-labelledby="qg-how">
      <div class="asc-section-head"><h2 id="qg-how">Comment ça marche</h2></div>
      <ol class="qg-how-list">
        <li><span class="qg-how-n" aria-hidden="true">1</span><p><strong>Tu fais du sport.</strong> Tu notes ta séance : le sport, la durée, ton ressenti. Une minute suffit.</p></li>
        <li><span class="qg-how-n" aria-hidden="true">2</span><p><strong>Ton effort compte.</strong> Chaque minute d’effort devient de l’XP et fait monter ton niveau, quel que soit ton sport.</p></li>
        <li><span class="qg-how-n" aria-hidden="true">3</span><p><strong>Ton aventure avance.</strong> Tes jours actifs allument les balises du monde que tu as choisi.</p></li>
      </ol>
    </section>`;
  }

  // Keep live sections and their controls in place when background reads finish.
  // Replacing the entire QG restarted animations, closed details and lost focus.
  function patchNode(node, next) {
    if (node.isEqualNode(next)) return;
    if (node.nodeType !== next.nodeType || node.nodeName !== next.nodeName) {
      node.replaceWith(next);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) { node.textContent = next.textContent; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of [...node.attributes]) {
      if (node.tagName === "DETAILS" && attr.name === "open") continue;
      if (!next.hasAttribute(attr.name)) node.removeAttribute(attr.name);
    }
    for (const attr of next.attributes) {
      if (node.getAttribute(attr.name) !== attr.value) node.setAttribute(attr.name, attr.value);
    }
    patchChildren(node, next);
  }

  function nodeKey(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    return node.id || node.getAttribute("aria-labelledby") || node.getAttribute("data-action")
      || node.getAttribute("href") || (node.tagName === "DETAILS" ? `details:${node.className}` : null);
  }

  function patchChildren(node, next) {
    const remaining = [...node.childNodes];
    let cursor = node.firstChild;
    for (const child of [...next.childNodes]) {
      const key = nodeKey(child);
      const old = remaining.find(candidate => candidate.nodeType === child.nodeType && candidate.nodeName === child.nodeName
        && nodeKey(candidate) === key && (key || candidate.nodeType !== Node.ELEMENT_NODE || candidate.getAttribute("class") === child.getAttribute("class")));
      if (old) {
        remaining.splice(remaining.indexOf(old), 1);
        if (old !== cursor) node.insertBefore(old, cursor);
        patchNode(old, child);
        cursor = old.nextSibling;
      } else node.insertBefore(child, cursor);
    }
    remaining.forEach(child => child.remove());
  }

  /* What the server opens beside the practice itself (steps, the day's intent, the common quest, the collective goal, TITAN Duo, the
     season, the ranking between friends) used to be seven full cards under the QG: a signed-in account scrolled 6 700 px, five times
     past the same « facultatif, aucun XP » note. They are one list of folded rows, each saying where it stands in a line; a row
     opens in place and the device remembers which ones its owner keeps open. */
  const MORE = [
    ["pas", "TitanStepsCard", "gauge", "Pas aujourd’hui"],
    ["rv", "TitanIntents", "target", "Rendez-vous du jour"],
    ["cq", "TitanCommonQuest", "group", "Quête commune de la semaine"],
    ["wg", "TitanWorldGoal", "globe", "Objectif collectif"],
    ["bd", "TitanBuddy", "link", "TITAN Duo"],
    ["ss", "TitanSeason", "calendar", "Saison"],
    ["rk", "TitanRanking", "bars", "Classement entre amis"],
  ];
  const MORE_KEY = "titan_qg_open_v1";
  function moreOpen() {
    try { const v = JSON.parse(localStorage.getItem(MORE_KEY) || "[]"); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); }
  }
  function moreHtml() {
    const open = moreOpen();
    const rows = MORE.map(([key, name, glyph, title]) => {
      const module = window[name], html = module?.html?.() || "";
      if (!html) return "";
      const brief = module.brief?.() || "";
      return `<details class="asc-fold" id="qg-more-${key}" data-more="${key}"${open.has(key) ? " open" : ""}><summary><span class="asc-row-icon">${icon(glyph)}</span><span class="asc-row-main"><span class="asc-row-title">${esc(title)}</span>${brief ? `<span class="asc-row-sub">${esc(brief)}</span>` : ""}</span></summary><div class="asc-fold-body">${html}</div></details>`;
    }).join("");
    return rows ? `<section class="asc-section asc-appear qg-more" aria-labelledby="qg-more-title"><div class="asc-section-head"><h2 id="qg-more-title">Autour de ta pratique</h2><span class="asc-small asc-faint">Facultatif</span></div><div class="asc-fold-list">${rows}</div></section>` : "";
  }
  document.addEventListener("toggle", (event) => {
    const row = event.target;
    if (!(row instanceof HTMLElement) || !row.matches?.(".asc-fold[data-more]")) return;
    const open = moreOpen();
    if (row.open) open.add(row.dataset.more); else open.delete(row.dataset.more);
    try { localStorage.setItem(MORE_KEY, JSON.stringify([...open])); } catch { /* storage refused: the row still opens */ }
  }, true);

  function paint(el, html) {
    const focused = el.contains(document.activeElement) ? document.activeElement : null;
    const template = document.createElement("template");
    template.innerHTML = html;
    const key = node => node.id || node.getAttribute("aria-labelledby") || node.className;
    const existing = [...el.children];
    let cursor = el.firstElementChild;
    for (const next of [...template.content.children]) {
      const old = existing.find(node => key(node) === key(next) && node.tagName === next.tagName);
      if (old) {
        existing.splice(existing.indexOf(old), 1);
        if (old !== cursor) el.insertBefore(old, cursor);
        patchNode(old, next);
        cursor = old.nextElementSibling;
      } else {
        el.insertBefore(next, cursor);
      }
    }
    existing.forEach(node => node.remove());
    if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }

  function render() {
    const el = root();
    if (!el) return;
    const account = adopt();
    if (!account || !window.state?.user || !window.TitanProgress) return;
    const f = F();
    const list = P().activeLogs(D().logs());
    const settings = D().cadenceSettings();
    const now = new Date();
    const online = navigator.onLine;
    const guest = D().isGuest();
    const ctx = {
      logs: D().logs(), goals: goalsCache, now, cadenceTarget: settings.target, pauses: settings.pauses,
      adventure: online || guest ? window.TitanAdventure?.snapshot : null,
      pending: D().pending(), plan: D().planToday?.(now), draftSport: D().sessionDraft()?.sport,
      online, guest, historyAvailable: online || guest || list.length > 0,
    };
    const action = P().nextAction(ctx);
    const others = P().insights(ctx).filter((i) => i.id !== action.id).slice(0, 3);
    const cad = P().cadence(D().logs(), { target: settings.target, pauses: settings.pauses, now });
    const recapNow = P().recap(D().logs(), { now, current: true });
    const name = (window.state.user.name || "").trim();
    document.getElementById("qg-date").textContent = f.longDate(now);
    document.getElementById("qg-title").textContent = guest || !name || /^agent$/i.test(name) ? "Ton QG" : `Bonjour, ${name.split(/\s+/)[0]}.`;
    paintBanner();
    const more = moreHtml();
    // A new account reads one line about TITAN first. It is drawn with the rest of the QG (not kept hidden in the page head), so
    // nothing already on screen moves when it appears.
    // Two columns on a wide screen: what I do (the action, my week) on the left; where I stand and where to go on the right.
    paint(el, `
      ${list.length ? "" : `<p class="asc-lead" id="qg-lead">Ton journal de sport : chaque séance fait monter ton niveau et avancer ton aventure.</p>`}
      ${ascentHtml(D().progression())}
      <div class="qg-cols">
        <div class="qg-col qg-col-main">
          ${heroHtml(action)}
          ${!online ? `<div class="asc-note qg-offline">${icon("offline")}<span><strong>Hors ligne.</strong> Tes séances saisies ici restent sur cet appareil.</span></div>` : ""}
          ${guest ? guestHtml() : ""}
          ${!D().isGuest() && guestToImport ? `<div class="asc-note qg-guest">${icon("upload")}<div><strong>${guestToImport} séance${guestToImport > 1 ? "s" : ""} de découverte</strong> sur cet appareil. <button type="button" class="asc-link" data-action="import-guest" ${importJob ? 'disabled aria-busy="true"' : ''} style="background:none;border:0;padding:0">${importJob ? "Import en cours…" : "Les ajouter à mon compte"}</button>${D().rulesV300() ? `<p class="asc-small asc-faint">Celles de plus de 30 jours entrent dans ton historique, sans XP.</p>` : ""}</div></div>` : ""}
          ${list.length ? "" : howHtml()}
          ${weekHtml(cad, recapNow, list.length > 0)}
          ${monthPromptHtml(now)}
          ${shortcutsHtml(list)}
        </div>
        <div class="qg-col qg-col-side">
          <section class="asc-section asc-appear" aria-labelledby="qg-paths"><div class="asc-section-head"><h2 id="qg-paths">En cours</h2></div>
            <div class="asc-list qg-paths">${adventureHtml(online || guest)}${goalHtml(goalsCache, D().logs())}</div>
          </section>
          ${doorsHtml()}
          ${lastHtml(list, guest)}
          ${insightsHtml(others)}
        </div>
      </div>
      ${more}`);
    el.setAttribute("aria-busy", "false");
  }

  function queue() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function cadenceSheet() {
    const ctx = adopt(); if (!ctx) return;
    if (cadenceDialog?.open) return cadenceDialog;
    const settings = D().cadenceSettings();
    const week = F().dateKey(F().weekStart(new Date()));
    const paused = settings.pauses.includes(week);
    const body = document.createElement("div");
    body.className = "asc-stack";
    body.innerHTML = `<p class="asc-muted">Combien de jours actifs comptent pour toi une semaine réussie ? Le repos des autres jours ne coûte rien.</p>
      <div class="asc-seg" role="group" aria-label="Jours actifs par semaine">${[1, 2, 3, 4, 5, 6, 7]
        .map((n) => `<button type="button" data-n="${n}" aria-pressed="${n === settings.target}">${n}</button>`)
        .join("")}</div>
      <hr class="asc-divider">
      <div class="asc-between"><div><strong>Semaine en pause</strong><p class="asc-small asc-faint">Vacances, blessure, examens : cette semaine sort de ta cadence au lieu de compter comme manquée.</p></div>
      <button type="button" class="asc-btn ${paused ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm" data-pause aria-pressed="${paused}">${paused ? "En pause" : "Mettre en pause"}</button></div>`;
    const d = window.titanShell.sheet({ title: "Ta semaine type", eyebrow: "Cadence", body,
      onClose: () => { if (cadenceDialog === d) cadenceDialog = null; } });
    cadenceDialog = d;
    const allowed = () => {
      if (!d.open || !d.isConnected) return false;
      if (current(ctx)) return true;
      invalidate(); queue(); return false;
    };
    body.querySelectorAll("[data-n]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!allowed()) return;
        ctx.data.setCadenceTarget(Number(b.dataset.n));
        body.querySelectorAll("[data-n]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        queue();
      }),
    );
    body.querySelector("[data-pause]").addEventListener("click", (e) => {
      if (!allowed()) return;
      const on = ctx.data.togglePause(week);
      e.currentTarget.setAttribute("aria-pressed", String(on));
      e.currentTarget.textContent = on ? "En pause" : "Mettre en pause";
      e.currentTarget.className = `asc-btn ${on ? "asc-btn-primary" : "asc-btn-secondary"} asc-btn-sm`;
      queue();
    });
    return d;
  }

  document.addEventListener("click", async (e) => {
    if (e.target.closest('[data-action="cadence"]')) cadenceSheet();
    if (e.target.closest('[data-action="dismiss-month"]')) {
      try { localStorage.setItem(monthKey(new Date()), "1"); } catch { /* the prompt may come back on reload */ }
      queue();
    }
    const imp = e.target.closest('[data-action="import-guest"]');
    if (!imp || !root()?.contains(imp)) return;
    if (!current(context)) { invalidate(); queue(); return; }
    const ctx = context;
    if (importJob || ctx.data.isGuest() || !guestToImport) return;
    const job = { ctx }; importJob = job;
    imp.disabled = true; imp.setAttribute("aria-busy", "true"); imp.textContent = "Import en cours…";
    try {
      const n = await ctx.data.importGuestSessions();
      if (!current(ctx) || importJob !== job) return;
      guestToImport = 0;
      window.titanShell.toast({ type: "ok", title: "Import lancé", message: `${n} séance${n > 1 ? "s" : ""} rejoignent ton compte. La confirmation arrive dans le journal.` });
    } catch {
      if (!current(ctx) || importJob !== job) return;
      window.titanShell.toast({ type: "err", title: "Import impossible", message: "Réessaie quand tu es connecté." });
    } finally {
      if (importJob === job) { importJob = null; if (current(ctx)) queue(); }
    }
  });
  window.addEventListener("titan:pending-changed", queue);
  ["online", "offline", "pageshow"].forEach(ev => window.addEventListener(ev, queue));
  window.addEventListener("storage", (e) => { if (e.key === D()?.sessionDraftKey()) queue(); });
  window.addEventListener("titan:steps-updated", queue);
  window.addEventListener("titan:intents-updated", queue);
  window.addEventListener("titan:common-quest-updated", queue);
  window.addEventListener("titan:world-goal-updated", queue);
  window.addEventListener("titan:buddy-updated", queue);
  window.addEventListener("titan:season-updated", queue);
  window.addEventListener("titan:ranking-updated", queue);
  ["titan:history-updated", "titan:adventure-updated"].forEach(ev => window.addEventListener(ev, () => { refreshData(); queue(); }));
  window.addEventListener("titan:account-changing", invalidate);
  window.addEventListener("titan:account-changed", () => { refreshData(); queue(); });
  async function boot() {
    const ctx = adopt(); queue();
    await Promise.resolve(window.TitanAdventure?.refresh?.()).catch(() => {});
    if (current(ctx)) refreshData();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();
