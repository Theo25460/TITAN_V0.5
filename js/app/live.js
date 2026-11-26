/* TITAN LIVE on the web — same engine as Android (js/core/live-*.js), behind the server flag screens.live.
   Prepare → live (sport view / adventure view) → report → the usual session form (/training) pre-filled with a bounded
   journal. The web records no GPS trace (see js/app/parcours.js): route sports advance on the adventure trail at the pace
   of normalised effort, and the real map stays empty rather than invented. */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc ? window.titanEsc(s) : String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const V = () => window.TitanLiveVoies;
  const L = () => window.TitanLiveEngine;
  const W = () => window.TitanLiveWorld;
  const owner = () => window.state?.user?.id || null;
  const liveKey = () => `titan_live_v1:${owner()}`;
  const settleKey = () => `titan_live_settle_v1:${owner()}`;
  const flagOn = () => window.titanFlags?.enabled?.("screens.live", false) === true;

  let consequences = null;
  let root = null, state = null, prep = null, tab = "seance", viewMode = "sport", cue = null, offer = null, interrupted = null;
  let tick = null, lastSave = 0, wake = null, world = null, worldError = null, report = {}, rpe = null, booted = false;

  const clock = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`; };
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full: the session still runs */ } };

  /* ---------------- persistence ---------------- */
  function persist(force) {
    const t = Date.now();
    if (!force && t - lastSave < 10000) return;
    lastSave = t;
    write(liveKey(), state ? { state, savedAt: t } : null);
  }
  function restore() {
    const saved = read(liveKey(), null);
    if (!saved?.state || saved.state.v !== 1 || Date.now() - saved.savedAt > 2 * 86400000) return null;
    const r = L().resume(saved.state, Date.now());
    if (!r) return null;
    const gap = r.out.find((o) => o.type === "interrupted");
    if (gap) interrupted = gap;
    return r.state;
  }

  /* ---------------- engine wiring ---------------- */
  function send(input) {
    if (!state) return;
    const r = L().step(state, input, Date.now());
    state = r.state;
    for (const o of r.out) {
      if (o.type === "cue") { cue = o.cue; deliver(o.cue.text, o.cue.channels); }
      if (o.type === "event" && state.level >= 1) { cue = { text: o.event.text, why: "Événement de la Voie" }; if (o.narrate) deliver(o.event.text, ["audio"]); }
      if (o.type === "mission_offer") offer = o.mission;
      if (o.type === "mission_done") window.showNotification?.("success", "Mission accomplie", o.mission.label);
    }
    persist(input.type !== "tick");
    // A tick redraws the page only when something other than the clocks changed. Rebuilding the whole view every second stole
    // the focus and the caret of a field being edited, and lost a tap that landed while the buttons were being replaced.
    if (input.type === "tick" && !r.out.length) {
      const editing = root?.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (editing || shape(L().view(state, Date.now())) === drawnShape) return softUpdate();
    }
    render();
  }

  /** Everything the live view shows except the running clocks and the goal bar: when it is unchanged, a tick is a soft update. */
  function shape(v) {
    return JSON.stringify([state.status, viewMode, v.panel, v.beats, v.planCount, v.tapsAllowed, Math.round(v.elan.value),
      v.restLeftS === null ? -1 : v.restLeftS > 0 ? 1 : 0, v.bell ? [v.bell.phase, v.bell.round] : 0, v.panel === "flow" ? v.activeS % 10 < 4 : 0,
      v.echo ? v.echo.beats : -1, v.goal ? v.goal.ratio >= 1 : 0, v.missions.active.map((m) => [m.id, m.value ?? 0]), state.missions.done.length,
      v.lastEvent?.text || "", cue?.text || "", offer?.id || "", state.feel, !!interrupted, v.fields.pointsWon, v.fields.pointsLost,
      v.stages ? v.stages.reached : -1, v.threshold ? v.threshold.status : "", v.discoveries ? v.discoveries.length : -1, v.interlude ? v.interlude.text : ""]);
  }
  let drawnShape = "";

  function softUpdate() {
    const v = L().view(state, Date.now());
    const main = root.querySelector(".live-clock");
    if (main) { main.textContent = clock(v.activeS); main.setAttribute("aria-label", `Temps actif ${clock(v.activeS)}`); }
    const small = root.querySelector(".live-clock-sm");
    if (small) small.textContent = clock(v.restLeftS ?? v.bell?.leftS ?? 0);
    const bar = root.querySelector(".live-bar");
    if (bar && v.goal) { bar.setAttribute("aria-valuenow", String(Math.round(v.goal.ratio * 100))); bar.firstElementChild.style.width = `${Math.round(v.goal.ratio * 100)}%`; }
  }

  function deliver(text, channels) {
    if (!channels?.includes("audio") || !window.speechSynthesis || state.level < 2) return;
    try {
      if (window.speechSynthesis.speaking) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      window.speechSynthesis.speak(u);
    } catch { /* no voice: the screen shows the cue */ }
  }

  async function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) wake = await navigator.wakeLock.request("screen");
      if (!on && wake) { await wake.release(); wake = null; }
    } catch { wake = null; }
  }

  function startTicking() {
    clearInterval(tick);
    tick = setInterval(() => { if (state?.status === "active") send({ type: "tick" }); }, 1000);
  }

  /* ---------------- preparation ---------------- */
  function freshPrep(sport) {
    const conf = V().resolve(sport);
    return { sport, intent: "atteindre", immersion: conf.defaultImmersion, goalKind: "none", goalValue: "", planCount: conf.plan.count || 0, recovery: false, project: false, picked: [] };
  }
  /** The athlete's own comparable sessions: only those the server counted (js/core/live-prepare.js, shared with Android). */
  const journalContext = (sport) => window.TitanLivePrepare.context(sport, window.state?.history || [], { now: Date.now() });
  function prepState(seed) {
    const p = prep;
    const ctx = journalContext(p.sport);
    const free = p.intent === "explorer"; // exploring carries no figure: neither goal nor plan nor comparison
    return L().create({
      sportId: p.sport, intent: p.intent, immersion: p.immersion, seed, owner: owner(), recovery: p.recovery, project: p.project,
      baseline: ctx.baseline, echo: p.intent === "depasser" ? ctx.echo : null, reference: free ? null : ctx.reference,
      goal: free || p.goalKind === "none" ? null : { kind: p.goalKind, value: Number(String(p.goalValue).replace(",", ".")) || 0 },
      plan: p.planCount ? { count: p.planCount } : undefined,
      knownExercises: ctx.knownExercises,
    });
  }

  /* ---------------- hand-off to /training ---------------- */
  function handOff() {
    let s = state;
    const t = Date.now();
    for (const [id, raw] of Object.entries(report)) {
      const v = Number(String(raw).replace(",", "."));
      if (raw !== "" && Number.isFinite(v)) s = L().step(s, { type: "field", id: `r_${id}`, value: v }, t).state;
    }
    const d = L().toDraft({ ...s, ended: { ...(s.ended || {}), rpe } });
    const now = new Date();
    const extras = { ...d.extras };
    for (const [id, raw] of Object.entries(report)) if (raw !== "") extras[id] = Number(String(raw).replace(",", "."));
    const draft = {
      step: "form", sport: d.sport, query: "", when: "now", date: window.TitanFormat.dateKey(now),
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      distance: "", meters: "", value: "", durH: d.durationMin >= 60 ? String(Math.floor(d.durationMin / 60)) : "", durM: String(d.durationMin % 60), durS: "",
      elevation: "", pool: "25", climbing: { discipline: "Bloc", location: "Salle", system: "Fontainebleau bloc", belay: "", attempts: "", successes: "", best: "" },
      exercises: (d.exercises || []).map((e) => ({ name: e.name, variant: "", kind: s.voie === "corps" ? "bodyweight" : "weighted", sets: e.setRows.map((r) => ({ weight: r.load ?? "", reps: r.reps ?? "", rir: r.rir ?? "", seconds: "" })) })),
      extras, rpe, note: "", gpx: null, keepTrace: false, updatedAt: t,
      live: L().journal(s),
    };
    write(window.TitanData.sessionDraftKey(owner()), draft);
    state = null;
    write(liveKey(), null);
    keepAwake(false);
    location.href = `/training?sport=${encodeURIComponent(d.sport)}&from=live`;
  }

  /* ---------------- settlement and world ---------------- */
  async function flushSettlements() {
    const client = window.titanClient;
    if (!client || !owner() || String(owner()).startsWith("guest_")) return;
    const list = read(settleKey(), []);
    const keep = [];
    for (const p of list.slice(0, 10)) {
      try {
        const { data, error } = await client.rpc("titan_live_settle_v1", { p_event: p.eventId });
        // Any error (offline, expired session, LIVE switched off for a while…) keeps the entry: only a final server answer drops it,
        // and the 3-day window below bounds the retries. Dropping on error lost the world reward of a session recorded offline.
        if (error) { keep.push(p); continue; }
        if (data?.status === "held") keep.push(p);
        else if (data?.status === "settled" && !data.replay) window.showNotification?.("success", "Le monde a réagi", `+${data.essenceAmount} ${V().ESSENCES[data.essence]?.label || ""} · +${data.eclats} éclats`);
      } catch { keep.push(p); }
    }
    write(settleKey(), [...keep, ...list.slice(10)].filter((p) => Date.now() - p.addedAt < 3 * 86400000));
  }
  /* V1.5.2: the Camp is the return point of the Vallée. What the Veilleur's outcome opened is read from the adventure server,
     never from the LIVE world: it needs no coin, no find and no live session. */
  async function loadConsequences() {
    try { consequences = await window.TitanConsequencePanel?.load({ fresh: true }) || null; } catch { consequences = null; }
  }
  async function loadWorld() {
    if (!window.titanClient || !owner() || String(owner()).startsWith("guest_")) { worldError = "Le Camp de base se rebâtit avec un compte : connecte-toi pour le retrouver."; render(); return; }
    void loadConsequences().then(() => { if (tab === "camp") render(); });
    try {
      const { data, error } = await window.titanClient.rpc("titan_live_world_v1");
      if (error) throw error;
      world = data; worldError = null;
    } catch (e) { worldError = e?.message || "Camp indisponible"; }
    render();
  }
  async function buildOne(id) {
    try {
      const { data, error } = await window.titanClient.rpc("titan_live_build_v1", { p_building: id });
      if (error) throw error;
      world = data;
      window.showNotification?.("success", "Le camp s’agrandit", W().BUILDINGS[id].name);
    } catch (e) {
      window.showNotification?.("warn", "Construction impossible", /LIVE_NOT_ENOUGH/.test(e?.message || "") ? "Il manque encore des ressources : chaque séance live en rapporte." : "Réessaie dans un instant.");
    }
    render();
  }

  /* ---------------- rendering ---------------- */
  const seg = (name, options, value) => `<div class="asc-seg" role="group" aria-label="${esc(name)}">${options.map(([v, l, dis]) => `<button type="button" data-act="${esc(name)}" data-v="${esc(v)}" aria-pressed="${v === value}"${dis ? " disabled" : ""}>${esc(l)}</button>`).join("")}</div>`;

  function render() {
    if (!root) return;
    if (!flagOn()) {
      root.innerHTML = `<section class="asc-panel asc-stack"><p class="asc-eyebrow cy">TITAN LIVE</p><h1 class="asc-h1">Bientôt disponible</h1><p class="asc-muted">La séance immersive n’est pas encore ouverte sur ton compte. Ta séance s’enregistre comme d’habitude.</p><a class="asc-btn asc-btn-primary" href="/training">Enregistrer une séance</a></section>`;
      return;
    }
    const tabs = seg("tab", [["seance", "Séance live"], ["camp", "Camp de base"]], tab);
    // The page says where it stands, so that the styles can quieten everything while a session runs.
    root.dataset.state = tab === "camp" ? "camp" : state && state.status !== "ready" ? (state.status === "ended" ? "report" : "run") : prep ? "prep" : "pick";
    root.innerHTML = `<div class="live-tabs">${tabs}</div>${tab === "camp" ? campHtml() : state && state.status !== "ready" ? (state.status === "ended" ? reportHtml() : liveHtml()) : prep ? prepHtml() : pickHtml()}`;
  }

  /* One scene from the choice of the sport to the Camp: the ascent of « l'Expédition » opens every state of the page, and what
     the state has to say (the sport, the clock of the session told, the chapter of the Cordée) is written on its sky. */
  const stage = (svg, copy, attrs = "") => `<div class="live-stage"${attrs}>${svg}<div class="live-stage-copy">${copy}</div></div>`;
  /** The scene before anything happened: the traveller at the camp, the plan (when there is one) as the waypoints ahead. */
  const stillScene = (c, planCount) => sceneSvg({ beats: 0, planCount: planCount || null, echo: null, goal: null, elan: { value: 0, max: 90 } }, c, false, true);

  function pickHtml() {
    const fav = (window.state?.user?.favoriteSports || []).filter((s) => window.SPORTS_CONFIG?.[s]);
    const ids = [...new Set([...fav, ...window.TitanSports.POPULAR])].slice(0, 12);
    return `<section class="live-flow live-pick">${stage(stillScene({ sport: "titan", family: "endurance" }, 0), `<p class="asc-eyebrow cy">TITAN LIVE</p><h1 class="asc-h1">Quelle séance vas-tu vivre ?</h1>
      <p>Chaque sport a sa Voie : ses missions, son rythme, son accompagnement.</p>`)}
      <div class="live-grid">${ids.map((id) => `<button type="button" class="asc-btn asc-btn-secondary" data-act="pick" data-v="${esc(id)}">${esc(window.TitanSports.label(id))}</button>`).join("")}</div>
      <label class="asc-field"><span>Autre sport</span><input class="asc-input" data-k="search" placeholder="Badminton, escalade, yoga…" autocomplete="off"></label>
      <div class="live-grid" id="live-results"></div></section>`;
  }

  /* The three intents, told apart before a word is read: a trail cut into stages up to a flag, one mark set just above the
     last one, places scattered with no line between them. Drawn here; no image exists for them. */
  const INTENT_GLYPH = {
    atteindre: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M5 34 18 27 31 22 44 13 57 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><g fill="currentColor"><circle cx="18" cy="27" r="3.4"/><circle cx="31" cy="22" r="3.4"/><circle cx="44" cy="13" r="3.4"/></g><path d="M57 8V1l6 2.6L57 6" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    depasser: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M4 22h56" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 4" opacity=".7"/><path d="M4 12h56" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M32 35V15m-7 7 7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    explorer: '<svg viewBox="0 0 64 40" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="28" r="2.6"/><circle cx="22" cy="10" r="3.6"/><circle cx="36" cy="26" r="2.2"/><circle cx="47" cy="8" r="2.8"/><circle cx="57" cy="24" r="3.2"/></g><path d="M3 37c6-4 11 3 17 0s11-4 17-1 12 3 18 0c2-1 4-1 6 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"/></svg>',
  };
  /* What each intent really changes (docs/live/GAME_DESIGN.md § 2 bis), in the order a session is lived. */
  const INTENT_CHANGES = {
    atteindre: ["Ton plan ou ton objectif est découpé en étapes, quatre au plus.", "Les étapes se cochent une à une, annoncées une fois. Aucune comparaison avec tes séances passées.", "Le récit dit les étapes franchies : ce qui est fait reste fait."],
    depasser: ["Un seul seuil, tiré de ta dernière séance réellement comparable.", "Le seuil s’affiche avec ta référence. Il se retire de lui-même si l’effort ressenti atteint 8 ou en récupération.", "Seuil franchi avec de la réserve, ou mis de côté quand il le fallait."],
    explorer: ["Rien à régler : ni objectif, ni plan chiffré.", "Aucun chiffre sur la vue aventure : un carnet de découvertes se remplit.", "Un récit sans un seul chiffre."],
  };

  /** What the chosen intent will concretely do in this session, for this sport, from this athlete's own journal. */
  function intentPreview(ds, c) {
    let own = "";
    if (prep.intent === "atteindre") {
      const st = L().stages(ds, 0);
      own = st ? `<p class="live-own"><strong>Tes étapes :</strong> ${st.list.map((x) => esc(x.label)).join(" · ")}</p>` : `<p class="live-own asc-muted">Choisis un objectif ou un plan : il sera découpé en étapes.</p>`;
    } else if (prep.intent === "depasser") {
      const th = L().thresholdOf(ds, 0);
      own = `<p class="live-own"><strong>${th.status === "open" ? "Ton seuil" : "Aujourd’hui"} :</strong> ${esc(th.text)}</p>${c.serene ? "" : `<p class="asc-small asc-muted">${esc(journalContext(prep.sport).basis)}</p>`}`;
    } else own = `<p class="live-own asc-muted">${esc(c.curios.length ? "Le monde se révèle au fil de la pratique." : "Pratique librement : la séance compte comme les autres.")}</p>`;
    return `<div class="live-intent" data-intent="${esc(prep.intent)}">${own}
      <ol class="live-changes">${["Avant", "Pendant", "Après"].map((when, i) => `<li><span class="live-when">${when}</span><span>${esc(INTENT_CHANGES[prep.intent][i])}</span></li>`).join("")}</ol></div>`;
  }

  function prepHtml() {
    const c = V().resolve(prep.sport);
    const ds = prepState("prepare");
    const missions = L().preparable(ds).slice(0, 8);
    const free = prep.intent === "explorer";
    const imm = Object.values(V().IMMERSION).map((i) => [i.id, i.label, i.level > c.maxImmersion]);
    // The web records no GPS trace: a distance goal could never move, so it is not offered here (Android measures it).
    const goals = [["none", "Aucun"], ["time", "Durée"], ["beats", cap(c.beat.many)]];
    const stake = W().stake(prep.sport, world);
    // Two parts: what this session is (the scene, the intent and what it changes, what it feeds), then what can be set. The
    // action to start stays in reach under them: the page is long, the decision is not.
    return `<section class="live-flow live-prep" data-intent="${esc(prep.intent)}">
      <div class="live-prep-main">
        ${stage(stillScene(c, free ? 0 : prep.planCount), `<p class="asc-eyebrow cy">${esc(c.voieName)}</p><h1 class="asc-h1">${esc(c.label)}</h1>`)}
        <p class="live-signature">${esc(c.signature)}</p>
        <div class="live-block"><h2 class="asc-h3">Ton intention</h2>
          <div class="live-intents" role="group" aria-label="Ton intention">${Object.values(V().INTENTS).map((i) => `<button type="button" class="live-intent-card" data-act="intent" data-v="${i.id}" aria-pressed="${prep.intent === i.id}">${INTENT_GLYPH[i.id]}<strong>${esc(i.label)}</strong><span>${esc(i.short)}</span></button>`).join("")}</div>
          ${intentPreview(ds, c)}</div>
        <div class="live-block live-stake"><h2 class="asc-h3">Ce que cette séance fait avancer</h2><ul class="live-brings">${stake.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p class="asc-small asc-muted">La séance compte pour ton suivi sportif même si tu n’ouvres jamais le Camp de base.</p></div>
      </div>
      <div class="live-prep-side">
        ${free ? "" : `<div class="live-block"><h2 class="asc-h3">Objectif (facultatif)</h2>${seg("goal", goals, prep.goalKind)}${prep.goalKind !== "none" ? `<label class="asc-field"><span>Valeur</span><input class="asc-input" data-k="goalValue" inputmode="decimal" value="${esc(prep.goalValue)}"></label>` : `<p class="asc-small asc-muted">Sans objectif, ${c.plan.count ? "ton plan sert de cap." : "la séance reste libre."}</p>`}</div>
        ${c.plan.count ? `<div class="live-block live-plan"><h2 class="asc-h3">Plan : ${prep.planCount} ${esc(prep.planCount > 1 ? c.beat.many : c.beat.one)}</h2><div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-secondary" data-act="plan" data-v="-1">Moins</button><button type="button" class="asc-btn asc-btn-secondary" data-act="plan" data-v="1">Plus</button></div></div>` : ""}`}
        <div class="live-block"><h2 class="asc-h3">Immersion</h2>${seg("immersion", imm, prep.immersion)}<p class="asc-small asc-muted">${esc(V().IMMERSION[prep.immersion].hint)}</p>${c.maxImmersion < 3 ? `<p class="asc-small asc-muted">${esc(c.safetyLabel)} : ${esc(c.safetyWhy)}</p>` : ""}</div>
        <div class="live-block"><h2 class="asc-h3">Missions</h2><p class="asc-small asc-muted">${c.offerMode === "before" ? "Pendant l’effort, TITAN ne te sollicitera pas : choisis jusqu’à deux missions, elles se valident à la fin." : "Jusqu’à deux maintenant, ou laisse TITAN t’en proposer au bon moment."}</p>
          <div class="live-missions">${missions.map((m) => `<button type="button" class="live-choice" data-act="mission" data-v="${esc(m.id)}" aria-pressed="${prep.picked.includes(m.id)}"><strong>${esc(m.label)}</strong><span class="asc-small asc-muted">${esc(m.text)}</span>${m.safetyNote ? `<span class="asc-small asc-muted">${esc(m.safetyNote)}</span>` : ""}</button>`).join("")}</div></div>
        <div class="live-block live-toggles"><label class="live-toggle"><input type="checkbox" data-k="recovery"${prep.recovery ? " checked" : ""}> Séance de récupération</label>
        ${c.voie === "paroi" ? `<label class="live-toggle"><input type="checkbox" data-k="project"${prep.project ? " checked" : ""}> Je travaille un projet</label>` : ""}
        <p class="asc-small asc-muted">${esc(c.fallback)}</p></div>
      </div>
      <div class="live-start"><button type="button" class="asc-btn asc-btn-ghost" data-act="back">Changer de sport</button><button type="button" class="asc-btn asc-btn-primary" data-act="start">Commencer</button></div>
    </section>`;
  }

  /** « L'Expédition »: the adventure view. Geometry from the shared core (js/core/live-scene.js), colours from Ascension tokens. */
  function sceneSvg(v, c, ended = false, decorative = false) {
    const s = window.TitanLiveScene.scene({ beats: v.beats, planCount: v.planCount, echoBeats: v.echo ? v.echo.beats : null,
      goalRatio: v.goal ? v.goal.ratio : null, elan: v.elan, seed: c.sport, ended });
    const label = decorative ? "" : v.label ? v.label : v.numbers === false ? `${cap(c.voieName)} : le sentier avance avec ta pratique${s.summit.reached ? ", sommet atteint" : ""}`
      : `${cap(c.voieName)} : ${v.beats} ${v.beatLabel}${v.planCount ? ` sur ${v.planCount}` : ""}, élan du jour ${Math.round(v.elan.value)} sur ${v.elan.max}${v.echo ? `, Écho à ${v.echo.beats}` : ""}${s.summit.reached ? ", sommet atteint" : ""}`;
    const t = s.traveller;
    return `<svg class="live-scene" data-family="${esc(c.family)}" viewBox="0 0 ${s.width} ${s.height}" ${decorative ? 'aria-hidden="true"' : `role="img" aria-label="${esc(label)}"`}>
      <defs><linearGradient id="live-sky" x1="0" y1="0" x2="0" y2="1"><stop class="live-sky-top" offset="0"/><stop class="live-sky-low" offset="1"/></linearGradient></defs>
      <rect class="live-sky" width="${s.width}" height="${s.height}"/>
      ${s.stars.map((p) => `<circle class="live-star" cx="${p.x}" cy="${p.y}" r="${p.r}"/>`).join("")}
      <circle class="live-disc-halo" cx="${s.sky.x}" cy="${s.sky.y}" r="${s.sky.r + 7}"/><circle class="live-disc" cx="${s.sky.x}" cy="${s.sky.y}" r="${s.sky.r}"/>
      ${s.ridges.map((d, i) => `<path class="live-ridge r${i + 1}" d="${d}"/>`).join("")}
      <path class="live-path" d="${s.trail}"/>${s.done ? `<path class="live-path-done" d="${s.done}"/>` : ""}
      <g class="live-summit${s.summit.reached ? " reached" : ""}"><path d="M${s.summit.x} ${s.summit.y} v-22"/><path class="live-flag" d="M${s.summit.x} ${s.summit.y - 22} l13 5 l-13 5 z"/></g>
      ${s.nodes.map((n) => `<circle class="live-node${n.lit ? " on" : ""}${n.next ? " next" : ""}" cx="${n.x}" cy="${n.y}" r="${n.lit ? 5 : n.next ? 4.5 : 3.2}"/>`).join("")}
      ${s.echo ? `<circle class="live-echo" cx="${s.echo.x}" cy="${s.echo.y}" r="10"/>` : ""}
      <path class="live-camp" d="M${s.camp.x - 7} ${s.camp.y + 4} l7 -11 l7 11 z"/>
      <g class="live-traveller"><circle cx="${t.x}" cy="${t.y}" r="9"/>${t.x === s.summit.x && t.y === s.summit.y ? "" : `<path d="M${t.x - 6} ${t.y - 13} l6 -6 l6 6"/><path class="second" d="M${t.x - 6} ${t.y - 20} l6 -6 l6 6"/>`}</g>
    </svg>`;
  }

  function panelHtml(v, c) {
    const big = (act, label, sub, extra = "") => `<button type="button" class="live-big" data-act="${act}" ${extra}${v.tapsAllowed ? "" : " disabled"}><strong>${esc(label)}</strong>${sub ? `<span>${esc(sub)}</span>` : ""}</button>`;
    switch (v.panel) {
      case "sets": return `${v.restLeftS !== null ? `<p class="asc-eyebrow ${v.restLeftS ? "" : "cy"}">${v.restLeftS ? "La braise refroidit" : "Prêt pour la frappe suivante"}</p><p class="live-clock-sm">${clock(v.restLeftS)}</p>` : ""}
        <div class="live-form"><label class="asc-field"><span>Exercice</span><input class="asc-input" data-k="exercise" value="${esc(prep?.exercise || "")}" placeholder="Squat, pompes…" aria-describedby="live-ref"><span class="asc-small asc-muted live-ref" id="live-ref">${refText()}</span></label>
        <label class="asc-field"><span>Répétitions</span><input class="asc-input" data-k="reps" inputmode="numeric" value="${esc(prep?.reps || "8")}"></label>
        <label class="asc-field"><span>${c.voie === "forge" ? "Charge (kg)" : "Lest (kg, facultatif)"}</span><input class="asc-input" data-k="load" inputmode="decimal" value="${esc(prep?.load || "")}"></label>
        <label class="asc-field"><span>Répétitions en réserve</span><input class="asc-input" data-k="rir" inputmode="numeric" value="${esc(prep?.rir ?? "2")}"></label></div>
        <button type="button" class="asc-btn asc-btn-primary asc-btn-block" data-act="set">Valider la ${esc(c.beat.one)}</button>`;
      case "wall": return `<label class="asc-field"><span>Cotation (facultatif)</span><input class="asc-input" data-k="grade" value="${esc(prep?.grade || "")}"></label><div class="live-row">${big("attempt", "Flash", "du premier coup", 'data-v="flash"')}${big("attempt", "Réussite", "", 'data-v="send"')}${big("attempt", "Chute", "prise révélée", 'data-v="fall"')}</div>`;
      case "score":
        if (c.voie === "escouade") return `${v.tapsAllowed ? "" : `<p class="asc-small asc-muted">Pendant le jeu, rien à toucher : mets en pause à la ${esc(c.beat.one)}.</p>`}${big("period", `${cap(c.beat.one)} terminée`, `${v.beats}${v.planCount ? ` sur ${v.planCount}` : ""}`)}`;
        if (c.voie === "cible") return `<p class="asc-small asc-muted">TITAN se tait pendant le tir.</p><label class="asc-field"><span>Score de la ${esc(c.beat.one)} (facultatif)</span><input class="asc-input" data-k="score" inputmode="decimal"></label><button type="button" class="asc-btn asc-btn-primary asc-btn-block" data-act="end-unit">${esc(cap(c.beat.one))} terminée</button>`;
        return `<div class="live-row">${big("point", `Point pour moi · ${Number(v.fields.pointsWon || 0)}`, "", 'data-v="1"')}${big("point", `Point adverse · ${Number(v.fields.pointsLost || 0)}`, "", 'data-v="0"')}</div><div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-act="game" data-v="1">${esc(cap(c.beat.one))} gagnée</button><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-act="game" data-v="0">${esc(cap(c.beat.one))} perdue</button></div>`;
      case "rounds":
        if (c.voie === "stade") return `${v.restLeftS ? `<p class="asc-small asc-muted">Récupération : encore ${clock(v.restLeftS)}</p>` : ""}<button type="button" class="asc-btn asc-btn-primary asc-btn-block" data-act="attempt" data-v="mark">Tentative notée</button>`;
        return v.bell ? `<p class="asc-eyebrow ${v.bell.phase === "work" ? "cy" : ""}">${v.bell.phase === "work" ? `${esc(cap(c.beat.one))} ${v.bell.round} sur ${v.bell.of}` : v.bell.phase === "rest" ? "Repos · rempart" : "Format terminé"}</p><p class="live-clock-sm">${clock(v.bell.leftS)}</p>${c.voie === "dojo" ? `<div class="asc-row-flex"><input class="asc-input" data-k="technique" placeholder="Technique travaillée (facultatif)"><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-act="technique">Noter</button></div>` : ""}` : `<p class="asc-muted">Note tes ${esc(c.beat.many)} à la fin.</p>`;
      case "flow": return c.voie === "scene" ? `<div class="live-row">${big("routine", "Passage complet", "sans arrêt", 'data-v="1"')}${big("routine", "Passage travaillé", "avec arrêts", 'data-v="0"')}</div>` : `<p class="live-breath">${v.activeS % 10 < 4 ? "Inspire" : "Expire"}</p><p class="asc-small asc-muted">Guide facultatif : 4 temps pour inspirer, 6 pour expirer.</p>`;
      case "legs": return big("leg", "Segment suivant", `segment ${v.beats + 1}`);
      case "log": return `<div class="asc-panel"><strong>${esc(c.safetyLabel)}</strong><p class="asc-small asc-muted">${esc(c.safetyWhy)}</p></div>`;
      default: return `<p class="asc-small asc-muted">Sur le web, TITAN n’enregistre pas de trace GPS : la carte d’aventure avance à ton effort, et tu indiqueras ta distance à la fin.</p>`;
    }
  }

  /** What the athlete did last time on the exercise being typed (a sport fact, shown for every intent), and — when
   *  surpassing was chosen — the one reasonable step above it. */
  function refText() {
    const r = state ? L().referenceFor(state, prep?.exercise || "") : null;
    return r ? `${esc(`La dernière fois : ${r.last}.`)}${r.suggest ? ` <strong>${esc(`Seuil du jour : ${r.suggest}.`)}</strong>` : ""}` : "";
  }

  /** The part of the screen that belongs to the intent: stages to tick, one threshold, or discoveries without a figure. */
  function intentHtml(v) {
    if (v.stages) return `<div class="live-intent" data-intent="atteindre"><p class="asc-eyebrow">Tes étapes · ${v.stages.reached} sur ${v.stages.of}</p><ol class="live-stages">${v.stages.list.map((x) => `<li class="${x.reached ? "on" : ""}"><span aria-hidden="true">${x.reached ? "✓" : x.index}</span>${esc(x.label)}<span class="sr-only">${x.reached ? " (franchie)" : " (à venir)"}</span></li>`).join("")}</ol></div>`;
    if (v.threshold) return `<div class="live-intent" data-intent="depasser" data-status="${esc(v.threshold.status)}"><p class="asc-eyebrow">${v.threshold.status === "done" ? "Seuil franchi" : v.threshold.status === "aside" ? "Seuil mis de côté" : "Un seul seuil"}</p><p class="asc-small">${esc(v.threshold.text)}</p></div>`;
    if (v.discoveries) return `<div class="live-intent" data-intent="explorer"><p class="asc-eyebrow">Carnet de découvertes</p>${v.discoveries.length ? `<ul class="live-finds">${v.discoveries.map((d) => `<li>${esc(cap(d))}</li>`).join("")}</ul>` : `<p class="asc-small asc-muted">Rien à atteindre. Pratique : le monde se révèle en chemin.</p>`}</div>`;
    return "";
  }

  function liveHtml() {
    const c = V().resolve(state.sport);
    const v = L().view(state, Date.now());
    drawnShape = shape(v);
    // While the body works the page is quiet: one large clock, the gesture of the sport, the ascent. Nothing here is a bright field.
    return `<section class="live-flow live-run" data-view="${viewMode}" data-status="${state.status === "active" ? "active" : "paused"}" data-intent="${esc(state.intent || "")}">
      <h1 class="sr-only">Séance en cours : ${esc(c.label)}</h1>
      <div class="live-viewseg">${seg("view", [["sport", "Vue sportive"], ["aventure", "Vue aventure"]], viewMode)}</div>
      ${interrupted ? `<div class="live-warn"><strong>Séance retrouvée</strong><p class="asc-small asc-muted">La page a été fermée pendant ${Math.round(interrupted.gapS / 60)} min. Le chrono a continué.</p><div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-secondary" data-act="trim">J’étais à l’arrêt</button><button type="button" class="asc-btn asc-btn-secondary" data-act="keepgap">Je continuais</button></div></div>` : ""}
      <div class="live-head"><p class="asc-eyebrow ${state.status === "active" ? "cy" : ""}">${state.status === "active" ? esc(c.label) : "En pause"}</p><p class="live-clock" aria-label="Temps actif ${clock(v.activeS)}">${clock(v.activeS)}</p>
        ${v.goal ? `<div class="live-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v.goal.ratio * 100)}" aria-label="Progression de l’objectif"><i style="width:${Math.round(v.goal.ratio * 100)}%"></i></div>` : ""}</div>
      <div class="live-cols">
        <div class="live-pane live-pane-sport">${panelHtml(v, c)}</div>
        <div class="live-pane live-pane-aventure"><div class="live-stage">${sceneSvg(v, c)}</div>
          ${v.numbers === false ? `<p class="live-scene-line asc-muted">Le sentier avance avec ta pratique.</p>` : `<p class="live-scene-line"><strong class="asc-num">${v.beats}</strong> ${esc(v.beatLabel)}${v.planCount ? ` sur ${v.planCount}` : ""} <span class="asc-muted">· Élan du jour ${Math.round(v.elan.value)} / ${v.elan.max}</span></p>`}
          ${v.lastEvent && (v.lastEvent.text === cue?.text || (v.numbers === false && /\d/.test(v.lastEvent.text))) ? "" : `<p class="live-tagline">${esc(v.lastEvent?.text || c.tagline)}</p>`}
          ${intentHtml(v)}</div>
      </div>
      ${v.interlude ? `<p class="live-interlude">${esc(v.interlude.text)}</p>` : ""}
      ${cue && state.level >= 1 ? `<div class="live-cue" role="status"><strong>${esc(cue.text)}</strong>${cue.why ? `<span class="asc-small asc-muted">Pourquoi : ${esc(cue.why)}</span>` : ""}</div>` : ""}
      ${offer && v.tapsAllowed ? `<div class="live-offer"><p class="asc-eyebrow cy">Mission proposée</p><strong>${esc(offer.label)}</strong><p class="asc-small asc-muted">${esc(offer.text)}</p><div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-primary" data-act="accept">Accepter</button><button type="button" class="asc-btn asc-btn-ghost" data-act="decline">Pas aujourd’hui</button></div></div>` : ""}
      ${v.missions.active.map((m) => `<div class="live-mission"><span class="asc-small">Mission en cours</span><strong>${esc(m.label)}</strong><span class="asc-small asc-muted">${m.metric === "declared" ? "À confirmer à la fin." : m.metric === "report" ? "Se vérifie au rapport." : m.target != null ? `${m.value ?? 0} / ${Math.ceil(m.target)}` : esc(m.text)}</span></div>`).join("")}
      ${v.tapsAllowed ? `<div class="live-feel"><p class="asc-small asc-muted" id="live-feel-label">Effort ressenti (facultatif)</p><div class="live-feel-row" role="group" aria-labelledby="live-feel-label">${[3, 5, 7, 8, 9].map((x) => `<button type="button" data-act="feel" data-v="${x}" aria-pressed="${state.feel === x}">${x}<small>/10</small></button>`).join("")}</div></div>` : ""}
      <div class="live-controls"><button type="button" class="asc-btn asc-btn-secondary" data-act="pause">${state.status === "active" ? "Pause" : "Reprendre"}</button><button type="button" class="asc-btn asc-btn-primary" data-act="finish">Terminer</button></div>
    </section>`;
  }

  function reportHtml() {
    const c = V().resolve(state.sport);
    const v = L().view(state, Date.now());
    const rm = c.missions.filter((m) => m.verify === "report" && state.missions.active.includes(m.id));
    const fields = [...new Set(rm.flatMap((m) => [m.check.field, m.check.requires, m.check.per?.field].filter(Boolean)))];
    const label = (id) => (window.TitanSports.conf(c.sport)?.extraFields || []).find((f) => f.id === id)?.label || id;
    const declared = c.missions.filter((m) => m.check.metric === "declared" && state.missions.active.includes(m.id));
    const lines = L().recap(state).lines;
    // The session told: the same ascent, stopped where the effort brought it, the time on its sky, then the story in the
    // order it happened — its first sentence says what the intent became.
    return `<section class="live-flow live-report" data-intent="${esc(state.intent || "")}">
      ${stage(sceneSvg(v, c, true), `<p class="asc-eyebrow cy">${esc(c.voieName)} · séance terminée</p><h1 class="asc-h1 live-clock-end">${clock(v.activeS)}</h1>`)}
      <div class="live-story" aria-label="Le récit de ta séance"><p class="asc-eyebrow">Le récit de ta séance</p>${lines.map((l, i) => `<p${i === 0 ? ' class="live-story-lead"' : ""}>${esc(l)}</p>`).join("")}</div>
      ${v.numbers === false ? "" : `<dl class="live-recap" aria-label="Ce que ton effort a tracé">
        <div><dt>${esc(cap(v.beatLabel))}</dt><dd class="asc-num">${v.beats}${v.planCount ? ` / ${v.planCount}` : ""}</dd></div>
        <div><dt>Missions accomplies</dt><dd class="asc-num">${state.missions.done.length}</dd></div>
        <div><dt>Élan du jour</dt><dd class="asc-num">${Math.round(v.elan.value)} / ${v.elan.max}</dd></div>
      </dl>`}
      <div class="live-block"><h2 class="asc-h3">Effort ressenti</h2><div class="asc-scale" role="group" aria-label="Effort ressenti de 1 à 10">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => `<button type="button" data-act="rpe" data-v="${x}" aria-pressed="${rpe === x}">${x}</button>`).join("")}</div></div>
      ${fields.length ? `<div class="live-block"><h2 class="asc-h3">Rapport</h2>${fields.map((f) => `<label class="asc-field"><span>${esc(label(f))}</span><input class="asc-input" data-k="report:${esc(f)}" inputmode="decimal" value="${esc(report[f] ?? "")}"></label>`).join("")}</div>` : ""}
      ${declared.length ? `<div class="live-block"><h2 class="asc-h3">Missions à confirmer</h2><div class="live-missions">${declared.map((m) => `<button type="button" class="live-choice" data-act="declare" data-v="${esc(m.id)}"><strong>${esc(m.label)}</strong><span class="asc-small asc-muted">${esc(m.text)}</span><span class="asc-small">Je l’ai fait</span></button>`).join("")}</div></div>` : ""}
      <p class="asc-small asc-muted">Tu vérifies ensuite la séance dans le formulaire habituel. Les récompenses du monde sont confirmées par le serveur après l’envoi, à ta prochaine visite du Camp de base.</p>
      <div class="live-end"><button type="button" class="asc-btn asc-btn-primary asc-btn-block" data-act="keep">Vérifier et enregistrer</button>
      <button type="button" class="asc-btn asc-btn-ghost" data-act="abandon">Abandonner la séance</button></div>
    </section>`;
  }

  const retourHtml = () => window.TitanConsequencePanel?.campHtml(consequences) || "";
  function campHtml() {
    // The Camp is the foot of the same ascent: while it loads or when it cannot be read, the scene stays and says so.
    const campScene = (beats) => sceneSvg({ beats, planCount: 10, echo: null, goal: null, elan: { value: 0, max: 90 }, label: `La Cordée : ${beats} chapitre${beats > 1 ? "s" : ""} sur 10` }, { sport: "camp", family: "mobilite", voieName: "Le Camp de base" });
    if (worldError) return `<section class="live-flow live-campv">${stage(campScene(0), `<p class="asc-eyebrow cy">Le Camp de base</p><h1 class="asc-h1">Le camp ne répond pas</h1>`)}
      <div class="sig-empty"><h3>Rien n’est perdu</h3><p>${esc(/compte/.test(worldError) ? worldError : "Le Camp de base n’a pas pu être lu. Tes séances et ce que tu as bâti sont conservés.")}</p><button type="button" class="asc-btn asc-btn-secondary" data-act="reload-world">Réessayer</button></div>${retourHtml()}</section>`;
    if (!world) return `<section class="live-flow live-campv" aria-busy="true">${stage(campScene(0), `<p class="asc-eyebrow cy">Le Camp de base</p><h1 class="asc-h1">Le camp se prépare…</h1>`)}<div class="asc-skeleton live-skeleton"></div></section>`;
    const w = world;
    const cordee = W().cordee({ days: w.days, voies: w.distinctVoies });
    const res = [["Éclats", w.wallet.eclats, "eclats"], ...Object.values(V().ESSENCES).map((e) => [e.label, w.wallet.essences[e.id] || 0, e.family])];
    const pips = (n, of) => Array.from({ length: of }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("");
    return `<section class="live-flow live-campv">
      ${stage(campScene(cordee.unlocked), `<p class="asc-eyebrow cy">Le Camp de base</p><h1 class="asc-h1">${esc(cordee.unlocked ? cordee.chapters[cordee.chapters.length - 1].title : "Le camp sous la neige")}</h1>`)}
      <p class="live-signature">Tes séances live retressent la Cordée. Rien ici ne s’achète et rien ne se perd.</p>
      ${retourHtml()}
      <div class="live-res">${res.map(([l, n, f]) => `<div class="live-res-item" data-family="${esc(f)}"><span class="asc-small asc-muted">${esc(l)}</span><strong class="asc-num">${Number(n)}</strong></div>`).join("")}</div>
      <div class="live-camp-cols">
        <div class="live-block live-horizon"><h2 class="asc-h3">Ce qui vient</h2>${W().horizon(w).map((h) => `<div class="live-next${h.ready ? " ready" : ""}"><strong>${esc(h.title)}</strong><span class="asc-small asc-muted">${esc(h.text)}</span>${h.ready ? `<span class="sig-state is-worn">Prêt</span>` : ""}</div>`).join("")}<p class="asc-small asc-muted">Rien n’expire : ces repères avancent quand tu reviens, à ton rythme.</p></div>
        <div class="live-block"><h2 class="asc-h3">La Cordée · ${cordee.unlocked} / ${cordee.of}</h2>${cordee.chapters.length ? `<ol class="live-chapters" reversed>${cordee.chapters.slice().reverse().map((ch) => `<li class="live-chapter"><span class="live-chapter-n asc-num" aria-hidden="true">${ch.index}</span><div><strong><span class="sr-only">${ch.index}. </span>${esc(ch.title)}</strong><p class="asc-small asc-muted">${esc(ch.text)}</p></div></li>`).join("")}</ol>` : `<p class="asc-muted">La première séance live déblaie le seuil du camp.</p>`}</div>
      </div>
      <div class="live-block"><h2 class="asc-h3">Bâtiments</h2><div class="live-buildings">${Object.values(W().BUILDINGS).map((b) => {
        const level = w.buildings[b.id] || 0;
        const plan = W().buildPlan(b.id, level, w.wallet);
        const cost = plan ? `${plan.useEssence ? `${plan.useEssence} ${esc(V().ESSENCES[plan.essence]?.label || "")}` : ""}${plan.useEssence && plan.useEclats ? " + " : ""}${plan.useEclats ? `${plan.useEclats} éclats` : ""}` : "";
        // A level that cannot be paid yet is said as a sentence: no button that does nothing.
        return `<div class="sig-plate live-building${plan?.affordable ? " is-relief" : ""}" data-slot="camp/${esc(b.id)}-${level}"><div class="live-building-head"><strong>${esc(b.name)}</strong><span class="sig-state${level ? " is-owned" : " is-locked"}">${esc(W().LEVEL_NAMES[level])}</span></div>
          <span class="live-levels" role="img" aria-label="Niveau ${level} sur ${W().MAX_LEVEL}">${pips(level, W().MAX_LEVEL)}</span>
          <p class="asc-small asc-muted">${esc(b.text)}</p>
          ${!plan ? `<p class="asc-small">Niveau maximal</p>` : plan.affordable ? `<button type="button" class="asc-btn asc-btn-primary" data-act="build" data-v="${esc(b.id)}">Rebâtir · ${cost}</button>` : `<p class="asc-small live-cost">Niveau « ${esc(W().LEVEL_NAMES[level + 1])} » : ${cost}. Pas encore réunis.</p>`}</div>`;
      }).join("")}</div></div>
      <div class="live-block"><h2 class="asc-h3">Les Marches</h2><div class="live-marches">${Object.keys(V().VOIES).map((id) => { const r = W().region(id, w.voies[id]); if (!r.lands) return ""; const arc = W().arc(id, w.voies[id]); return `<div class="live-marche"><div class="live-building-head"><strong>${esc(r.name)}</strong><span class="asc-small asc-muted asc-num">${r.lands} / ${r.of} terres</span></div><span class="live-levels" aria-hidden="true">${pips(r.lands, r.of)}</span><p class="asc-small asc-muted">${esc(arc[arc.length - 1]?.text || "")}</p>${r.guardianReady ? `<p class="asc-small"><span class="sig-state is-rare">${esc(r.guardian)} t’attend</span></p>` : ""}</div>`; }).join("") || `<p class="asc-muted">Chaque Voie pratiquée en séance live révèle sa région.</p>`}</div></div>
      <div class="live-block"><h2 class="asc-h3">Trouvailles · ${w.collection.length}</h2><div class="live-finds-row">${w.collection.map((k) => { const [vo, i] = k.split(":"); const f = W().FINDS[vo]?.[Number(i)]; return f ? `<span class="sig-state${Number(i) >= 4 ? " is-rare" : ""}">${esc(f[0])}${Number(i) >= 4 ? " · rare" : ""}</span>` : ""; }).join("") || `<p class="asc-muted">Les trouvailles apparaissent au fil des séances, un peu plus souvent quand tu explores.</p>`}</div></div>
    </section>`;
  }

  /* ---------------- interactions ---------------- */
  function onClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const act = b.dataset.act, v = b.dataset.v;
    switch (act) {
      case "tab": tab = v; if (tab === "camp") { void flushSettlements().then(loadWorld); } render(); break;
      case "view": viewMode = v; render(); break;
      case "pick": prep = freshPrep(v); render(); break;
      case "back": prep = null; render(); break;
      case "intent": prep.intent = v; if (v === "explorer") prep.goalKind = "none"; render(); break;
      case "goal": prep.goalKind = v; render(); break;
      case "immersion": prep.immersion = v; render(); break;
      case "plan": prep.planCount = Math.max(1, Math.min(60, prep.planCount + Number(v))); render(); break;
      case "mission": prep.picked = prep.picked.includes(v) ? prep.picked.filter((x) => x !== v) : prep.picked.length < 2 ? [...prep.picked, v] : prep.picked; render(); break;
      case "start": {
        state = prepState(crypto.randomUUID());
        state = L().step(state, { type: "start", missions: prep.picked }, Date.now()).state;
        persist(true); keepAwake(true); startTicking(); render(); break;
      }
      case "pause": send({ type: state.status === "active" ? "pause" : "resume" }); keepAwake(state.status === "active"); break;
      case "finish": send({ type: "end" }); keepAwake(false); window.speechSynthesis?.cancel?.(); break;
      case "set": send({ type: "beat", kind: "set", data: { exercise: (prep?.exercise || "Exercice").slice(0, 40), reps: Number(prep?.reps || 0) || 0, ...(prep?.load ? { load: Number(String(prep.load).replace(",", ".")) || 0 } : {}), ...(prep?.rir === "" ? {} : { rir: Number(prep?.rir ?? 2) || 0 }) } }); break;
      case "attempt": send({ type: "beat", kind: "attempt", data: v === "mark" ? {} : { result: v, grade: String(prep?.grade || "").slice(0, 8), project: !!state.project } }); break;
      case "point": send({ type: "beat", kind: "point", data: { won: v === "1" } }); break;
      case "game": send({ type: "beat", kind: "game", data: { won: v === "1", trailing: Number(state.fields.pointsLost || 0) > Number(state.fields.pointsWon || 0) } }); break;
      case "period": send({ type: "beat", kind: "period" }); break;
      case "leg": send({ type: "beat", kind: "leg" }); break;
      case "routine": send({ type: "beat", kind: "routine", data: { clean: v === "1" } }); break;
      case "end-unit": { const s = Number(String(root.querySelector('[data-k="score"]')?.value || "").replace(",", ".")); send({ type: "beat", kind: "end", data: Number.isFinite(s) && root.querySelector('[data-k="score"]')?.value ? { score: s } : {} }); break; }
      case "technique": { const t = root.querySelector('[data-k="technique"]')?.value?.trim(); if (t) send({ type: "field", id: "technique_note", value: t.slice(0, 40) }); break; }
      case "feel": send({ type: "feel", value: Number(v) }); break;
      case "accept": send({ type: "accept", id: offer.id }); offer = null; render(); break;
      case "decline": send({ type: "decline", id: offer.id }); offer = null; render(); break;
      case "declare": send({ type: "declare", id: v }); break;
      case "rpe": rpe = Number(v); render(); break;
      case "keep": handOff(); break;
      case "abandon": if (window.confirm("Abandonner la séance live ? Le chrono et le journal de cette séance seront effacés de cet appareil.")) { state = null; prep = null; write(liveKey(), null); keepAwake(false); render(); } break;
      case "trim": state = L().trimGap(state, interrupted.since, Date.now()); interrupted = null; persist(true); render(); break;
      case "keepgap": interrupted = null; render(); break;
      case "build": void buildOne(v); break;
      case "reload-world": world = null; worldError = null; render(); void loadWorld(); break;
      default: break;
    }
    // A choice redraws the screen: the focus goes back on the control that was pressed, when it is still there.
    if (!root.contains(document.activeElement)) root.querySelector(`[data-act="${CSS.escape(act)}"]${v != null ? `[data-v="${CSS.escape(v)}"]` : ""}`)?.focus({ preventScroll: true });
  }

  function onInput(e) {
    const k = e.target.dataset?.k;
    if (!k) return;
    if (k === "search") {
      const box = root.querySelector("#live-results");
      if (box) box.innerHTML = window.TitanSports.search(e.target.value, { limit: 8 }).map((r) => `<button type="button" class="asc-btn asc-btn-secondary" data-act="pick" data-v="${esc(r.id)}">${esc(r.label)}</button>`).join("");
      return;
    }
    if (k.startsWith("report:")) { report[k.slice(7)] = e.target.value; return; }
    if (!prep) prep = {};
    if (k === "recovery" || k === "project") { prep[k] = e.target.checked; if (!state) render(); return; }
    prep[k] = e.target.value;
    if (k === "exercise") { const ref = root.querySelector("#live-ref"); if (ref) ref.innerHTML = refText(); }
    // The stages follow the goal as it is typed, without rebuilding the page (the field keeps its caret).
    if (k === "goalValue" && !state) { const box = root.querySelector(".live-intent"); if (box) box.outerHTML = intentPreview(prepState("prepare"), V().resolve(prep.sport)); }
  }

  function boot() {
    root = document.getElementById("live");
    if (!root || !window.state?.user || !window.TitanLiveEngine) return;
    window.TitanSports.ensure();
    booted = true;
    state = restore();
    if (state && state.status !== "ended") { startTicking(); if (state.status === "active") keepAwake(true); }
    const sport = new URLSearchParams(location.search).get("sport");
    if (!state && sport && window.SPORTS_CONFIG?.[sport]) prep = freshPrep(sport);
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    // "change" only for checkboxes: on a text field it fires on blur, would rebuild the results and swallow the click.
    root.addEventListener("change", (e) => { if (e.target.type === "checkbox") onInput(e); });
    render();
    if (flagOn()) void flushSettlements().then(() => { if (!world && window.titanClient && owner() && !String(owner()).startsWith("guest_")) return loadWorld(); });
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state?.status === "active") { send({ type: "tick" }); keepAwake(true); } });
  window.addEventListener("titan:flags-updated", () => { if (booted) render(); });
  window.addEventListener("titan:account-changing", () => { clearInterval(tick); state = null; prep = null; world = null; consequences = null; booted = false; keepAwake(false); if (root) root.innerHTML = '<p class="asc-small asc-muted" role="status">Synchronisation du compte…</p>'; });
  window.addEventListener("titan:account-changed", () => { if (!booted) boot(); });
  window.addEventListener("titan:history-updated", () => { if (!booted) boot(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();
