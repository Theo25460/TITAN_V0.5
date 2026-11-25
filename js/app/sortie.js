/* TITAN — V1.7.7 Séance · Sortie GPS: an outing recorded in the browser — prepare, record with a live map and a dashboard, follow a
   route, go back to the start, then read the summary and save the session through the existing path (window.logActivity).
   The rules are the shared modules (js/core/gps-engine.js, gps-nav.js, gps-session.js) and the model is js/app/sortie-model.js; this
   file is the screen, the browser's geolocation, the storage of the unfinished recording and the lock between tabs.
   WHAT A BROWSER CANNOT DO is said, not hidden: a page does not record reliably with the screen locked or the tab in the background.
   The screen is kept awake when the browser allows it, the return from the background is detected, and the time without a position is
   left to the engine (« sans position ») — movement is never invented.
   PRIVATE: positions stay in this browser (IndexedDB, per account). The saved session carries totals only; no analytics event carries
   a position, a distance or a place; no map server is contacted unless a tile provider is configured and the athlete turned it on.
   Behind the flag screens.gps (an unfinished recording stays reachable when the flag is switched off). */
(function () {
  "use strict";
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const E = () => window.TitanGpsEngine;
  const N = () => window.TitanGpsNav;
  const S = () => window.TitanGpsSession;
  const R = () => window.TitanSortieModel;
  const MAP = () => window.TitanSortieMap;
  const SP = () => window.TitanSports;
  const D = () => window.TitanData;
  const now = () => Date.now();
  const two = (n) => String(n).padStart(2, "0");
  const hms = (t) => { const d = new Date(t); return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`; };
  const kmText = (m) => `${S().km(m)} km`;
  const flagOn = () => window.titanFlags?.enabled?.("screens.gps", false) === true;
  const isGuest = () => !owner || String(owner).startsWith("guest_");
  const LIMITS = "Un navigateur ne peut pas enregistrer de façon fiable avec l’écran verrouillé ou l’onglet en arrière-plan : le téléphone met la page en veille.";
  const NO_WAKE = "Ton navigateur ne peut pas garder l’écran allumé : empêche la mise en veille dans ses réglages";
  const PLACE_KINDS = { water: "Point d’eau", toilets: "Toilettes", shelter: "Abri", bike_repair: "Réparation vélo", food: "Ravitaillement", viewpoint: "Point de vue", parking: "Parking", other: "Autre" };

  let root = null, announcer = null;
  let owner = null, booted = null, generation = 0;
  let screen = "loading"; // loading | gate | othertab | resume | prepare | live | bilan
  let rec = null, prefs = null, draft = null;
  let geo = "idle", perm = "unknown"; // perm: unknown | prompt | granted | denied | unsupported
  let watchId = null, tick = null, wake = null, wakeState = "idle";
  let hiddenAt = null, notice = null, startError = "";
  let map = null, courseOf = null, bannerKey = "", lastGuide = null, lastStep = null, goalReached = false, lastSignal = "";
  let savedAt = null, saveFailed = false, lastWrite = 0, writeChain = Promise.resolve();
  let savingSession = false, duplicateAccepted = null, bilanStatus = null, expedition = null, expeditionBefore = null;

  /* ---------- Storage: the unfinished recording, per account, on this device ---------- */
  const store = (() => {
    let opening = null;
    const open = () => opening || (opening = new Promise((resolve, reject) => {
      const request = indexedDB.open("titan_gps_web_v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("recordings", { keyPath: "owner" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("STORAGE_BLOCKED"));
    }).catch((error) => { opening = null; throw error; }));
    const run = async (mode, work) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("recordings", mode), request = work(tx.objectStore("recordings"));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("STORAGE_ABORT"));
      });
    };
    const local = (id) => R().recKey(id);
    return {
      async read(id) {
        try { const row = await run("readonly", (s) => s.get(id)); if (row?.rec) return row.rec; } catch { /* private mode or blocked storage: the small store below */ }
        try { return JSON.parse(localStorage.getItem(local(id)) || "null"); } catch { return null; }
      },
      /** IndexedDB first; when it is unavailable the recording goes to localStorage, which throws when it is full — the caller says so. */
      async write(id, value) {
        try { await run("readwrite", (s) => s.put({ owner: id, rec: value })); try { localStorage.removeItem(local(id)); } catch {} return; } catch { /* fall through */ }
        localStorage.setItem(local(id), JSON.stringify(value));
      },
      async remove(id) {
        try { await run("readwrite", (s) => s.delete(id)); } catch {}
        try { localStorage.removeItem(local(id)); } catch {}
      },
    };
  })();
  const usable = (r, id) => !!r && r.v === 2 && r.owner === id && E().isGpsSport(r.sport) && r.track && Array.isArray(r.track.segs) && Array.isArray(r.stretches) && r.stretches.length > 0 && Number.isFinite(r.startedAt);

  function persist(force) {
    if (!rec || !owner) return Promise.resolve();
    const t = now();
    if (!force && t - lastWrite < 5000) return writeChain;
    lastWrite = t;
    const snapshot = rec, id = owner;
    writeChain = writeChain.then(() => store.write(id, snapshot)).then(
      () => { if (owner === id) { savedAt = now(); saveFailed = false; paintKeep(); } },
      () => { if (owner === id) { saveFailed = true; paintKeep(); } },
    );
    return writeChain;
  }

  /* ---------- One recording tab per account ----------
     The tab that holds an unfinished recording keeps a Web Lock until the outing is saved or abandoned; the lock dies with the tab.
     Older browsers answer each other on a BroadcastChannel instead. A second tab says so and never touches the recording. */
  const lock = (() => {
    let release = null, held = false, channel = null;
    const name = (id) => `titan-gps-rec:${id}`;
    function listen(id) {
      if (channel || typeof BroadcastChannel !== "function") return;
      channel = new BroadcastChannel(name(id));
      channel.addEventListener("message", (e) => { if (held && e.data === "who") channel.postMessage("busy"); });
    }
    return {
      acquire(id) {
        if (held) return Promise.resolve(true);
        if (navigator.locks?.request) {
          return new Promise((resolve) => {
            navigator.locks.request(name(id), { ifAvailable: true }, (granted) => {
              if (!granted) return void resolve(false);
              held = true; resolve(true);
              return new Promise((free) => { release = free; });
            }).catch(() => resolve(true));
          });
        }
        if (typeof BroadcastChannel !== "function") { held = true; return Promise.resolve(true); }
        listen(id);
        return new Promise((resolve) => {
          let busy = false;
          const hear = (e) => { if (e.data === "busy") busy = true; };
          channel.addEventListener("message", hear);
          channel.postMessage("who");
          setTimeout(() => { channel.removeEventListener("message", hear); held = !busy; resolve(!busy); }, 300);
        });
      },
      free() { release?.(); release = null; held = false; channel?.close(); channel = null; },
    };
  })();

  /* ---------- Preferences and the route handed over ---------- */
  function loadPrefs() { try { return R().prefsOf(JSON.parse(localStorage.getItem(R().prefsKey(owner)) || "null")); } catch { return R().prefsOf(null); } }
  function savePrefs(patch) { prefs = R().prefsOf({ ...prefs, ...patch }); try { localStorage.setItem(R().prefsKey(owner), JSON.stringify(prefs)); } catch {} }
  /** The route the library, the planner or a GPX import handed over: { id, route, at }. Read strictly; anything else is no route. */
  function readFollow() {
    try {
      const raw = JSON.parse(localStorage.getItem(R().followKey(owner)) || "null");
      const route = raw?.route && Array.isArray(raw.route.segs) ? N().makeRoute(raw.route.segs, { name: raw.route.name, sport: raw.route.sport, origin: raw.route.origin }) : null;
      return route && route.distanceM >= 50 ? { id: typeof raw.id === "string" ? raw.id : null, route } : null;
    } catch { return null; }
  }
  function writeFollow(follow) {
    try {
      if (!follow) localStorage.removeItem(R().followKey(owner));
      else localStorage.setItem(R().followKey(owner), JSON.stringify({ id: follow.id || null, route: follow.route, at: now() }));
      return true;
    } catch { return false; }
  }

  /* ---------- Sports: GPS sports of the catalogue only ---------- */
  function sports() {
    const all = E().GPS_SPORTS.filter((id) => SP().conf(id) && window.SPORTS_CONFIG?.[id]);
    const favourites = (window.state?.user?.favoriteSports || []).filter((id) => all.includes(id));
    const recent = [...(window.state?.history || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((l) => l.sport).filter((id) => all.includes(id));
    const first = [...new Set([...favourites, ...recent, ...(prefs?.sport ? [prefs.sport] : []), "running", "cycling", "gravel", "hiking", "trail", "walking", "mountain_bike"])].filter((id) => all.includes(id)).slice(0, 6);
    return { all, first, rest: all.filter((id) => !first.includes(id)), favourites };
  }
  function plannedGoal(sport) {
    try { const view = D()?.weekPlan ? D().weekPlan() : null; return view ? S().plannedGoal(view, sport) : null; } catch { return null; }
  }
  const goalText = (g) => { const goal = S().goalOf(g); return !goal ? "Aucun" : goal.kind === "distance" ? `Distance : ${String(goal.km).replace(".", ",")} km` : goal.kind === "time" ? `Durée : ${S().span(goal.minutes * 60)}` : `Être rentré pour ${S().hhmm(goal.at)}`; };

  /* ---------- Small helpers of the screen ---------- */
  function announce(text) { if (announcer && text) { announcer.textContent = ""; announcer.textContent = text; } }
  function sheet(title, html, eyebrow) {
    const body = document.createElement("div");
    body.className = "asc-stack gps-sheet";
    body.innerHTML = html;
    const dialog = window.titanShell.sheet({ title, eyebrow: eyebrow || "Sortie GPS", body });
    return { body, dialog, close: () => { if (dialog.open) dialog.close(); } };
  }
  const analysis = () => R().analysis(rec, now());
  const course = () => {
    const g = R().guide(rec);
    if (!g) return (courseOf = null);
    if (!courseOf || courseOf.route !== g.route) courseOf = { route: g.route, course: N().course(g.route) };
    return courseOf.course;
  };
  function setBody() {
    const live = screen === "live";
    document.body.classList.toggle("gps-on", live);
    document.body.classList.toggle("gps-quiet", live || screen === "bilan" || screen === "resume");
  }

  /* ---------- Screen wake lock ---------- */
  async function keepAwake(on) {
    if (!on) { const held = wake; wake = null; wakeState = "idle"; try { await held?.release(); } catch {} return; }
    if (wake) return;
    if (!navigator.wakeLock?.request) { wakeState = "unsupported"; return paintKeep(); }
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      if (!rec || rec.status !== "recording") { sentinel.release().catch(() => {}); return; }
      wake = sentinel; wakeState = "on";
      sentinel.addEventListener("release", () => { if (wake === sentinel) { wake = null; wakeState = "released"; paintKeep(); } });
    } catch { wakeState = "refused"; }
    paintKeep();
  }

  /* ---------- Geolocation ---------- */
  async function readPermission() {
    if (!navigator.geolocation?.watchPosition) { perm = "unsupported"; return; }
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      perm = status.state;
      status.onchange = () => { perm = status.state; if (screen === "prepare") render(); };
    } catch { perm = "unknown"; }
  }
  function startWatch() {
    if (watchId !== null) return true;
    const g = navigator.geolocation;
    if (!g || typeof g.watchPosition !== "function") return false;
    watchId = g.watchPosition(onPosition, onGeoError, { enableHighAccuracy: true, maximumAge: 0 });
    return true;
  }
  function stopWatch() {
    if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId); } catch {} }
    watchId = null;
  }
  function onPosition(position) {
    if (!rec || rec.status !== "recording") return;
    const fix = R().fixOf(position, now());
    if (!fix) return;
    geo = "ok"; perm = "granted";
    const before = rec;
    rec = R().addFix(rec, fix, course());
    if (rec === before) return;
    watchGuide();
    persist(false);
    paintLive();
  }
  function onGeoError(error) {
    if (!rec || rec.status !== "recording") return;
    if (error?.code !== 1) { geo = "waiting"; return paintLive(); } // unavailable for now: the signal chip says it, the watch goes on
    perm = "denied"; geo = "denied";
    stopWatch(); keepAwake(false);
    if (!rec.live && !R().lastFix(rec)) {
      // Refused before a single position: there is no outing. Back to the preparation, with the way to allow it.
      const follow = rec.follow ? { id: rec.follow.id, route: rec.follow.route } : null;
      const id = owner;
      rec = null; stopTick(); lock.free();
      store.remove(id);
      if (follow) { draft.follow = follow; writeFollow(follow); }
      screen = "prepare";
      startError = "Position refusée : la sortie n’a pas démarré. Autorise la position pour ce site dans les réglages de ton navigateur, puis appuie de nouveau sur Démarrer.";
      render();
      root.querySelector("[data-start-error]")?.focus?.();
      return announce(startError);
    }
    // Withdrawn during the outing: the recording stops cleanly at the last position, nothing is lost.
    rec = R().reconcile(rec, now());
    notice = { tone: "warn", text: "L’accès à la position a été retiré : l’enregistrement s’est arrêté à la dernière position reçue, rien n’est perdu. Autorise de nouveau la position pour ce site dans les réglages du navigateur, puis appuie sur Reprendre — ou termine la sortie." };
    persist(true);
    render();
    announce("Enregistrement interrompu : accès à la position retiré.");
  }

  /* ---------- Recording actions ---------- */
  function startTick() { if (!tick) tick = setInterval(onTick, 1000); }
  function stopTick() { clearInterval(tick); tick = null; }
  function onTick() {
    if (screen !== "live" || !rec) return;
    paintLive();
    if (rec.status === "recording") persist(false);
  }

  async function start() {
    startError = "";
    const fail = (text) => { startError = text; render(); root.querySelector("[data-start-error]")?.focus?.(); };
    const sport = draft.sport;
    if (!E().isGpsSport(sport)) return fail("Choisis un sport.");
    if (!navigator.geolocation?.watchPosition) return fail("Ce navigateur ne donne pas accès à la position : la sortie GPS ne peut pas démarrer ici. Enregistre ta séance à la main depuis Enregistrer.");
    if (window.isSecureContext === false) return fail("La position n’est disponible que sur une connexion sécurisée (https).");
    const id = owner, run = generation;
    if (!(await lock.acquire(id))) return fail("Une sortie s’enregistre déjà dans un autre onglet de ce navigateur. Reviens sur cet onglet pour la continuer.");
    const existing = await store.read(id);
    if (run !== generation || id !== owner) return;
    if (usable(existing, id)) { booted = null; return boot(); }
    rec = R().create({ owner: id, sport, now: now(), autoPause: prefs.autoPause, goal: draft.goal, steps: draft.steps, alerts: prefs.vibrate, follow: draft.follow });
    savePrefs({ sport });
    writeFollow(null); // handed over for this outing; the recording carries its own copy
    resetLive();
    screen = "live"; geo = "asking"; notice = null;
    render();
    persist(true);
    startWatch(); keepAwake(true); startTick();
    announce("Sortie démarrée. Garde cette page ouverte et l’écran allumé.");
  }
  function resetLive() { bannerKey = ""; lastGuide = null; lastStep = null; goalReached = false; lastSignal = ""; courseOf = null; savedAt = null; saveFailed = false; hiddenAt = null; bilanStatus = null; expedition = null; expeditionBefore = null; duplicateAccepted = null; }

  function pause() {
    if (!rec || rec.status !== "recording") return;
    rec = R().pause(rec, now());
    stopWatch(); keepAwake(false);
    persist(true); render();
    announce("Sortie en pause.");
  }
  function resume() {
    if (!rec || rec.status !== "paused") return;
    if (!navigator.geolocation?.watchPosition) { notice = { tone: "warn", text: "Ce navigateur ne donne pas accès à la position : la sortie ne peut pas reprendre ici. Tu peux la terminer." }; return render(); }
    rec = R().resume(rec, now());
    geo = "asking"; notice = null;
    if (screen !== "live") { resetLive(); screen = "live"; }
    render();
    persist(true);
    startWatch(); keepAwake(true); startTick();
    announce("Sortie reprise.");
  }
  async function finish() {
    if (!rec || rec.status === "ended") return;
    // The recording goes on while the question is open: nothing stops before the athlete confirms.
    const ok = await window.titanShell.confirm({ title: "Terminer la sortie ?", message: "L’enregistrement s’arrête et tu lis le bilan. Tu choisis ensuite d’enregistrer la séance, d’exporter la trace ou d’abandonner.", detail: rec.status === "recording" ? "Tant que tu n’as pas confirmé, la sortie continue d’être enregistrée." : "", confirmLabel: "Terminer" });
    if (!ok || !rec || rec.status === "ended") return;
    rec = R().finish(rec, now());
    stopWatch(); keepAwake(false); stopTick();
    screen = "bilan"; notice = null;
    await persist(true);
    render();
    root.querySelector("[data-bilan-title]")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    announce("Sortie terminée. Bilan affiché.");
  }
  async function discard() {
    const ok = await window.titanShell.confirm({ title: "Abandonner cette sortie ?", message: "La trace et les chiffres de cette sortie sont effacés de cet appareil. Aucune séance n’est enregistrée.", detail: "Cette action ne peut pas être annulée. Exporte d’abord la trace en GPX si tu veux la garder.", confirmLabel: "Abandonner la sortie", danger: true });
    if (!ok) return;
    await clear();
    announce("Sortie abandonnée.");
  }
  async function clear() {
    const id = owner;
    stopWatch(); keepAwake(false); stopTick();
    await writeChain.catch(() => {});
    rec = null; map?.destroy(); map = null;
    await store.remove(id);
    lock.free();
    if (id !== owner) return;
    draft.follow = readFollow();
    screen = flagOn() ? "prepare" : "gate";
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- What changes are worth saying (kept rare and polite) ---------- */
  function watchGuide() {
    const g = R().guide(rec);
    const key = g ? `${g.kind}:${g.state?.joined ? 1 : 0}:${g.state?.off ? 1 : 0}:${g.state?.done ? 1 : 0}` : "";
    if (key === lastGuide) return;
    const was = lastGuide; lastGuide = key;
    if (!g || was === null) return;
    const s = g.state;
    if (s.done) announce(g.kind === "back" ? "Tu es revenu au départ." : "Parcours terminé.");
    else if (s.off) announce(`Hors parcours, à ${s.offM} mètres du tracé.`);
    else if (s.joined && /:1:1:0$/.test(was)) announce("De retour sur le parcours.");
    else if (s.joined && /:0:0:0$/.test(was)) announce("Parcours rejoint.");
  }

  /* ---------- Rendering ---------- */
  function render() {
    if (!root) return;
    setBody();
    root.setAttribute("aria-busy", screen === "loading" ? "true" : "false");
    if (screen !== "live" && screen !== "bilan") { map?.destroy(); map = null; }
    if (screen === "loading") root.innerHTML = '<div class="asc-skeleton gps-skeleton"></div>';
    else if (screen === "gate") root.innerHTML = gateHtml();
    else if (screen === "othertab") root.innerHTML = otherTabHtml();
    else if (screen === "resume") root.innerHTML = resumeHtml();
    else if (screen === "prepare") root.innerHTML = prepareHtml();
    else if (screen === "live") renderLive();
    else if (screen === "bilan") renderBilan();
  }

  const gateHtml = () => `<section class="gps-gate" data-gps-state="gate">
      <p class="asc-lead">Sortie GPS : bientôt disponible sur le Web. L’application Android enregistre déjà tes sorties.</p>
      <p class="asc-small asc-muted">En attendant, enregistre ta séance à la main ou importe la trace GPX de ta montre.</p>
      <div class="asc-row-flex"><a class="asc-btn asc-btn-primary" href="/training">${icon("plus")} Enregistrer une séance</a></div>
    </section>`;
  const otherTabHtml = () => `<section class="gps-gate" data-gps-state="othertab">
      <h2 class="asc-h2">Une sortie s’enregistre dans un autre onglet</h2>
      <p>Deux onglets ne peuvent pas enregistrer la même sortie : reviens sur l’onglet qui l’a démarrée pour la suivre, la mettre en pause ou la terminer.</p>
      <p class="asc-small asc-muted">Si cet onglet a été fermé, l’enregistrement s’est arrêté à sa dernière position : appuie sur « Vérifier à nouveau » pour le retrouver ici.</p>
      <div class="asc-row-flex"><button type="button" class="asc-btn asc-btn-secondary" data-act="recheck">Vérifier à nouveau</button></div>
    </section>`;

  function resumeHtml() {
    const a = analysis(), prev = rec.stretches[rec.stretches.length - 1];
    const day = new Date(rec.startedAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    return `<section class="gps-resume" data-gps-state="resume">
      <h2 class="asc-h2" tabindex="-1" data-resume-title>Une sortie est en cours sur cet appareil</h2>
      <p>${esc(SP().label(rec.sport))}, commencée ${esc(day)} à ${esc(S().hhmm(rec.startedAt))}. ${rec.interrupted
        ? `L’enregistrement s’est interrompu à ${esc(hms(prev.e))}, à la dernière position reçue : la page a été fermée, rechargée ou mise en veille. Le temps écoulé depuis n’est pas compté comme effort.`
        : `Elle est en pause depuis ${esc(S().hhmm(prev.e))}.`}</p>
      <dl class="gps-figs"><div><dt>Distance</dt><dd class="asc-num" data-fig="distance">${esc(S().km(a.distanceM))} <small>km</small></dd></div>
        <div><dt>En mouvement</dt><dd class="asc-num" data-fig="moving">${esc(S().chrono(a.movingS))}</dd></div>
        <div><dt>À l’arrêt</dt><dd class="asc-num">${esc(S().chrono(a.stoppedS))}</dd></div></dl>
      <div class="asc-actions gps-resume-actions"><button type="button" class="asc-btn asc-btn-primary" data-act="resume">${icon("play")} Reprendre</button>
        <button type="button" class="asc-btn asc-btn-secondary" data-act="finish">Terminer</button>
        <button type="button" class="asc-btn asc-btn-ghost" data-act="discard">Abandonner</button></div>
      <p class="asc-small asc-muted">${esc(LIMITS)} Reprendre ouvre une nouvelle portion de trace : rien n’est tracé entre l’interruption et la reprise.</p>
    </section>`;
  }

  function permissionHtml() {
    if (perm === "unsupported") return `<p class="asc-note warn">${icon("alert")}<span>Ce navigateur ne donne pas accès à la position : la sortie GPS ne peut pas démarrer ici. Enregistre ta séance à la main depuis <a href="/training">Enregistrer</a>.</span></p>`;
    if (perm === "denied") return `<p class="asc-note warn" data-perm="denied">${icon("alert")}<span>La position est bloquée pour ce site. Autorise-la dans les réglages du site (l’icône à gauche de l’adresse, ou Réglages du navigateur › Sites › Position), puis recharge la page. Sans elle, enregistre ta séance à la main depuis <a href="/training">Enregistrer</a>.</span></p>`;
    return `<p class="asc-small asc-muted" data-perm="${esc(perm)}">${perm === "granted" ? "Position autorisée pour ce site. " : "Quand tu appuies sur Démarrer, ton navigateur te demande l’accès à ta position. "}Elle sert à tracer ta sortie et à mesurer distance et vitesse. Elle reste dans ce navigateur : rien n’est envoyé pendant la sortie, et la séance que tu enregistres ensuite ne porte que des totaux.</p>`;
  }
  function prepareHtml() {
    const list = sports();
    if (!E().isGpsSport(draft.sport) || !list.all.includes(draft.sport)) draft.sport = list.first[0] || list.all[0] || null;
    const follow = draft.follow, planned = draft.sport ? plannedGoal(draft.sport) : null;
    const lay = S().layout(draft.sport, prefs.fields[E().familyOf(draft.sport)]);
    const row = (key, ic, title, sub) => `<button type="button" class="asc-row gps-row" data-open="${key}"><span class="asc-row-icon">${icon(ic)}</span><span class="asc-row-main"><span class="asc-row-title">${esc(title)}</span><span class="asc-row-sub" data-row-sub="${key}">${esc(sub)}</span></span>${icon("chevron")}</button>`;
    return `<div class="gps-prep" data-gps-state="prepare">
      <div class="gps-prep-main">
        <p class="asc-note warn gps-limits" data-limits>${icon("alert")}<span><strong>Garde cette page ouverte et l’écran allumé.</strong> ${esc(LIMITS)} Ce temps-là est compté « sans position », jamais inventé. Pour une longue sortie, l’application Android enregistre écran éteint.</span></p>
        <div class="gps-sports" role="group" aria-label="Sport de la sortie">
          <div class="gps-sport-chips">${list.first.map((id) => `<button type="button" class="gps-sport" data-sport="${esc(id)}" aria-pressed="${id === draft.sport}">${icon(SP().iconOf(id))}<span>${esc(SP().label(id))}</span></button>`).join("")}</div>
          ${list.rest.length ? `<label class="asc-field gps-sport-more"><span>Autre sport d’extérieur</span><select data-sport-more><option value="">Choisir…</option>${list.rest.map((id) => `<option value="${esc(id)}"${id === draft.sport ? " selected" : ""}>${esc(SP().label(id))}</option>`).join("")}</select></label>` : ""}
        </div>
        <p class="asc-small asc-muted">Seuls les sports d’extérieur mesurés à la distance sont proposés ici. Pour un autre sport, passe par <a href="/training">Enregistrer</a>.</p>
        <div class="asc-list gps-rows">
          ${row("route", "route", "Parcours à suivre", follow ? `${follow.route.name || "Parcours sans nom"} · ${kmText(follow.route.distanceM)}` : "Aucun : sortie libre")}
          ${row("goal", "target", "Objectif", draft.goal ? goalText(draft.goal) : planned ? `Aucun · ${planned.label}` : "Aucun")}
          ${row("plan", "layers", "Séance structurée", draft.steps.length ? `${draft.steps.length} étape${draft.steps.length > 1 ? "s" : ""}` : "Aucune")}
          ${row("settings", "settings", "Réglages", `Pause automatique ${prefs.autoPause ? "activée" : "désactivée"} · ${lay.more.map((k) => S().FIELDS[k].short).join(", ")}`)}
        </div>
      </div>
      <div class="gps-prep-side">
        <h2 class="asc-h3">Position</h2>
        ${permissionHtml()}
        <button type="button" class="asc-btn asc-btn-primary asc-btn-block gps-start" data-act="start"${perm === "unsupported" || !draft.sport ? " disabled" : ""}>${icon("play")} Démarrer la sortie</button>
        <p class="asc-small gps-start-error" role="alert" tabindex="-1" data-start-error>${esc(startError)}</p>
        <p class="asc-small asc-muted">${isGuest() ? "En découverte, la sortie et sa séance restent sur cet appareil." : "La séance part dans ton journal quand tu l’enregistres, à la fin."} Aucune annonce vocale, aucune mesure cardiaque.</p>
      </div>
    </div>`;
  }

  /* ---- Live ---- */
  function bannersOf() {
    const g = R().guide(rec), list = [];
    if (g) list.push(g.kind);
    if (S().goalOf(rec.goal)) list.push("goal");
    if (rec.plan && rec.plan.steps.length) list.push("step");
    return list;
  }
  function bannersHtml(list) {
    const bar = '<div class="asc-ascent thin gps-progress" data-b="bar" hidden><span></span></div>';
    return list.map((kind) => kind === "step"
      ? `<div class="gps-banner gps-banner-step" data-banner="step"><div class="gps-banner-text"><p class="gps-banner-title"><strong data-b="title"></strong> <span class="asc-num" data-b="value"></span></p><p class="gps-banner-line" data-b="line"></p>${bar}</div><button type="button" class="asc-btn asc-btn-secondary gps-banner-act" data-act="next-step">Étape suivante</button></div>`
      : `<div class="gps-banner" data-banner="${kind}"><div class="gps-banner-text"><p class="gps-banner-title"><strong data-b="title"></strong> <span data-b="value"></span></p><p class="gps-banner-line" data-b="line"></p>${bar}</div></div>`).join("");
  }
  function renderLive() {
    const lay = S().layout(rec.sport, prefs.fields[E().familyOf(rec.sport)]);
    const cell = (slot, key) => `<div class="gps-cell" data-cell="${slot}" data-key="${esc(key)}"><dt></dt><dd><span class="asc-num gps-v"></span> <small class="gps-u"></small></dd><p class="gps-cell-note"></p></div>`;
    const list = bannersOf();
    bannerKey = list.join("+");
    map?.destroy();
    root.innerHTML = `<section class="gps-live" data-gps-state="live" data-view="${esc(prefs.view)}" data-status="${esc(rec.status)}">
      <div class="gps-bar">
        <p class="gps-state" data-f="state"><i aria-hidden="true"></i><span></span></p>
        <p class="gps-signal" data-f="signal"><i aria-hidden="true"></i><span></span></p>
        <div class="asc-seg gps-views" role="group" aria-label="Affichage">${[["map", "Carte"], ["dash", "Compteur"], ["mixed", "Mixte"]].map(([v, l]) => `<button type="button" data-view-set="${v}" aria-pressed="${prefs.view === v}">${l}</button>`).join("")}</div>
      </div>
      <div class="gps-notice" data-notice></div>
      <div class="gps-banners" data-banners>${bannersHtml(list)}</div>
      <div class="gps-stage">
        ${MAP().html({ interactive: true, label: "Carte de la sortie : trace parcourue et position" })}
        <div class="gps-dash">
          <dl class="gps-mains">${lay.main.map((k, i) => cell(`main${i}`, k)).join("")}</dl>
          <dl class="gps-cells">${lay.more.map((k, i) => cell(`more${i}`, k)).join("")}</dl>
        </div>
      </div>
      <p class="gps-keep asc-small" data-f="keep"></p>
      <div class="gps-foot">
        <button type="button" class="asc-btn asc-btn-secondary gps-foot-pause" data-act="${rec.status === "recording" ? "pause" : "resume"}">${rec.status === "recording" ? `${icon("pause")} Pause` : `${icon("play")} Reprendre`}</button>
        <button type="button" class="asc-btn asc-btn-primary" data-act="finish">${icon("stop")} Terminer</button>
        <button type="button" class="asc-btn asc-btn-secondary gps-foot-more" data-act="more" aria-haspopup="dialog">${icon("more")}<span>Plus</span></button>
      </div>
    </section>`;
    map = MAP().create(root.querySelector("[data-map]"), { interactive: true, tiles: prefs.tiles });
    paintNotice();
    paintLive();
  }
  function paintNotice() {
    const host = root?.querySelector("[data-notice]");
    if (!host) return;
    host.innerHTML = notice ? `<p class="asc-note ${notice.tone === "warn" ? "warn" : ""}" role="note">${icon(notice.tone === "warn" ? "alert" : "info")}<span>${esc(notice.text)}</span><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-act="notice-close">Compris</button></p>` : "";
  }
  function paintKeep() {
    const el = screen === "live" && root?.querySelector('[data-f="keep"]');
    if (!el || !rec) return;
    const awake = rec.status !== "recording" ? "" : wakeState === "on" ? "Écran maintenu allumé." : wakeState === "idle" ? "" : `${NO_WAKE}.`;
    const saved = saveFailed ? "Enregistrement sur cet appareil impossible (stockage plein ou bloqué) : garde cette page ouverte jusqu’au bilan." : savedAt ? `Enregistré sur cet appareil à ${hms(savedAt)}.` : "";
    const text = `${rec.status === "recording" ? "Garde cette page au premier plan : écran verrouillé ou onglet en arrière-plan, le navigateur n’enregistre plus. " : ""}${awake} ${saved}`.trim();
    if (el.textContent !== text) el.textContent = text;
    el.dataset.wake = wakeState; el.dataset.saved = saveFailed ? "failed" : savedAt ? "yes" : "no";
  }
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

  function paintLive() {
    if (screen !== "live" || !rec || !root) return;
    const live = root.querySelector(".gps-live");
    if (!live) return;
    const t = now(), a = R().analysis(rec, t);
    // A structured session moves on by itself; a step that just ended is a change worth a vibration and one polite sentence.
    let run = null;
    if (rec.plan && rec.plan.steps.length) {
      run = S().runPlan(rec.plan.steps, rec.plan.cursor, a);
      if (run.changed && rec.status === "recording") { rec = { ...rec, plan: { ...rec.plan, cursor: run.cursor } }; persist(true); }
      const key = run.finished ? "done" : String(run.cursor.index);
      if (lastStep !== null && key !== lastStep && rec.status === "recording") {
        if (rec.plan.alerts && typeof navigator.vibrate === "function") { try { navigator.vibrate([200, 100, 200]); } catch {} }
        live.querySelector('[data-banner="step"]')?.setAttribute("data-flash", String(t));
        announce(run.finished ? "Séance structurée terminée." : `Étape : ${run.step.label}.`);
      }
      lastStep = key;
    }
    const list = bannersOf();
    if (list.join("+") !== bannerKey) { bannerKey = list.join("+"); live.querySelector("[data-banners]").innerHTML = bannersHtml(list); }
    live.dataset.status = rec.status;

    const line = R().stateLine(rec, a, t), stateEl = live.querySelector('[data-f="state"]');
    stateEl.dataset.kind = line.kind; setText(stateEl.querySelector("span"), line.text);
    const sig = rec.status === "recording" ? E().signal(rec.live, t) : { state: "paused", label: "GPS en pause", accuracyM: null };
    const sigEl = live.querySelector('[data-f="signal"]');
    const short = { searching: "Recherche GPS…", lost: "Signal perdu", weak: `Signal faible ± ${sig.accuracyM} m`, fair: `Signal moyen ± ${sig.accuracyM} m`, good: sig.accuracyM === null ? "GPS" : `GPS ± ${sig.accuracyM} m`, paused: "GPS en pause" }[sig.state];
    sigEl.dataset.state = sig.state; sigEl.title = sig.label; setText(sigEl.querySelector("span"), short);
    if (lastSignal && lastSignal !== sig.state && (sig.state === "lost" || lastSignal === "lost") && rec.status === "recording") announce(sig.state === "lost" ? "Signal GPS perdu." : "Signal GPS retrouvé.");
    lastSignal = sig.state;

    const g = R().guide(rec), lay = S().layout(rec.sport, prefs.fields[E().familyOf(rec.sport)]);
    const liveCtx = { speedMs: rec.status === "recording" ? E().currentSpeed(rec.track.segs, t, rec.live) : null, altitudeM: rec.live && t - rec.live.t < 20000 ? rec.live.alt : null, remainingM: g && g.state && g.state.joined ? g.state.remainingM : null, now: t };
    for (const el of live.querySelectorAll("[data-cell]")) {
      const c = S().cell(el.dataset.key, a, liveCtx, lay.pace);
      setText(el.querySelector("dt"), c.label); setText(el.querySelector(".gps-v"), c.value); setText(el.querySelector(".gps-u"), c.unit || ""); setText(el.querySelector(".gps-cell-note"), c.note || "");
    }

    const eta = (m) => N().eta(m, a);
    for (const el of live.querySelectorAll("[data-banner]")) {
      const kind = el.dataset.banner, put = (k, v) => setText(el.querySelector(`[data-b="${k}"]`), v || "");
      const bar = el.querySelector('[data-b="bar"]');
      const progress = (ratio) => { bar.hidden = ratio === null || ratio === undefined; if (!bar.hidden) bar.firstElementChild.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`; };
      if (kind === "follow" || kind === "back") {
        const s = g.state || {}, e = s.joined ? eta(s.remainingM || 0) : null;
        el.dataset.tone = s.off ? "off" : s.joined ? "on" : "far";
        if (s.done) { put("title", kind === "back" ? "Tu es revenu au départ" : "Parcours terminé"); put("value", ""); put("line", g.name || ""); progress(1); }
        else if (s.off) { put("title", `Hors parcours · ${s.offM} m`); put("value", ""); put("line", `Écart supérieur à la marge de ${s.marginM} m, précision du GPS comprise. Reste ${kmText(s.remainingM)} depuis le dernier point sur le tracé.`); progress(s.progress); }
        else if (s.joined) { put("title", `Reste ${kmText(s.remainingM)}`); put("value", kind === "back" ? "jusqu’au départ" : g.name || ""); put("line", e ? `Environ ${S().span(e.lowS)} à ${S().span(e.highS)} à ton rythme en mouvement, hors arrêts, relief non pris en compte.` : "Estimation du temps restant après 5 min et 500 m de mouvement."); progress(s.progress); }
        else { put("title", Number.isFinite(s.offM) ? `À ${s.offM >= 1000 ? kmText(s.offM) : `${s.offM} m`} du parcours` : kind === "back" ? "Retour par le même chemin" : "Parcours à suivre"); put("value", g.name || ""); put("line", Number.isFinite(s.offM) ? "Rejoins le tracé en pointillés : le suivi commence quand tu y es." : "En attente d’une position pour te situer par rapport au tracé."); progress(null); }
      } else if (kind === "goal") {
        const back = S().goalOf(rec.goal).kind === "return" ? backDistance(a) : null;
        const p = S().goalProgress(rec.goal, a, { now: t, eta, backM: back });
        el.dataset.tone = p.reached ? "done" : p.status === "late" || p.status === "tight" ? "off" : "on";
        put("title", p.title); put("value", ""); put("line", [p.line, p.estimate].filter(Boolean).join(" ")); progress(p.ratio);
        if (p.reached && !goalReached && rec.status === "recording") announce(p.line);
        goalReached = !!p.reached;
      } else if (kind === "step" && run) {
        const btn = el.querySelector('[data-act="next-step"]');
        el.dataset.tone = run.finished ? "done" : "on";
        if (run.finished) { put("title", "Séance structurée terminée"); put("value", ""); put("line", "La sortie continue librement jusqu’à ce que tu la termines."); progress(1); btn.hidden = true; }
        else { put("title", `${run.step.label} · ${run.position}`); put("value", run.remaining.manual ? `${run.remaining.value} (au signal)` : `${run.remaining.value}${run.remaining.unit ? ` ${run.remaining.unit}` : ""}`); put("line", run.next ? `Ensuite : ${S().describeStep(run.next)}` : "Dernière étape"); progress(run.ratio); btn.hidden = rec.status !== "recording"; }
      }
    }

    if (map && prefs.view !== "dash") {
      const pos = rec.live && Number.isFinite(rec.live.lat) ? { lat: rec.live.lat, lon: rec.live.lon, acc: rec.live.acc, hdg: rec.live.spd === null || rec.live.spd >= 0.5 ? rec.live.hdg : null } : null;
      map.set({ segs: rec.track.segs, route: g ? g.route : null, pos, places: places(), state: sig.state });
      const canvas = root.querySelector("[data-map] canvas");
      const label = `Carte de la sortie : ${kmText(a.distanceM)} parcourus${g ? `, parcours ${g.name ? `« ${g.name} » ` : ""}en pointillés` : ""}${pos ? "" : ", en attente d’une position"}.`;
      if (canvas.getAttribute("aria-label") !== label) canvas.setAttribute("aria-label", label);
    }
    paintKeep();
  }
  /** Length of the way back by the same path, recomputed at most every 20 s (it reads the whole trace). */
  let backCache = { at: 0, points: -1, m: null };
  function backDistance(a) {
    if (a.points === backCache.points || now() - backCache.at < 20000) return backCache.m;
    const same = N().backtrack(rec.track.segs, { sport: rec.sport });
    backCache = { at: now(), points: a.points, m: same ? same.route.distanceM : null };
    return backCache.m;
  }
  function places() {
    try { const list = !isGuest() && window.TitanPlaces?.list ? window.TitanPlaces.list() : []; return Array.isArray(list) ? list.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)).slice(0, 200) : []; } catch { return []; }
  }

  /* ---- Summary ---- */
  function renderBilan() {
    const a = R().analysis(rec, rec.endedAt), lay = S().layout(rec.sport), pace = lay.pace;
    const d = R().sessionDetails(rec, a), bar = R().timeBar(a), q = R().quality(a), goal = R().goalResult(rec, a);
    const plan = rec.plan && rec.plan.steps.length ? S().planSummary(rec.plan.steps, rec.plan.cursor) : null;
    const fig = (key, label, value, unit, seconds) => `<div data-fig="${key}"${seconds === undefined ? "" : ` data-seconds="${seconds}"`}><dt>${esc(label)}</dt><dd class="asc-num">${esc(value)}${unit ? ` <small>${esc(unit)}</small>` : ""}</dd></div>`;
    const avgM = S().cell("avgMoving", a, {}, pace), avgO = S().cell("avgOverall", a, {}, pace);
    const day = new Date(rec.startedAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const longest = a.stops.reduce((m, s) => Math.max(m, s.seconds), 0);
    const saved = rec.saved;
    const splitRow = (s) => { const v = S().speedText(s.movingS > 0 ? s.distanceM / s.movingS : null, pace); return `<tr><th scope="row">${s.distanceM >= 1000 ? s.index : `${s.index} (${S().km(s.distanceM)} km)`}</th><td class="asc-num">${esc(S().chrono(s.movingS))}</td><td class="asc-num">${esc(v.value)} ${esc(v.unit)}</td></tr>`; };
    map?.destroy();
    root.innerHTML = `<section class="gps-bilan" data-gps-state="bilan">
      <header class="gps-bilan-head"><h2 class="asc-h2" tabindex="-1" data-bilan-title>Bilan de la sortie</h2>
        <p class="asc-muted">${esc(SP().label(rec.sport))} · ${esc(day)}, ${esc(S().hhmm(rec.startedAt))} – ${esc(S().hhmm(rec.endedAt))}</p></header>
      <div class="gps-bilan-top">
        <div class="gps-bilan-map">${a.points >= 2 ? MAP().html({ interactive: false, label: `Trace de la sortie : ${kmText(a.distanceM)}`, caption: "Fond neutre : trace seulement, aucun serveur de cartes contacté" }) : '<p class="asc-note">Aucune trace : pas assez de positions fiables pendant cette sortie.</p>'}</div>
        <div class="gps-bilan-figs">
          <dl class="gps-figs gps-figs-lead">${fig("distance", "Distance", S().km(a.distanceM), "km")}${fig("moving", "En mouvement", E().clock(a.movingS), "", a.movingS)}</dl>
          <dl class="gps-figs">${fig("elapsed", "Temps total", E().clock(a.elapsedS), "", a.elapsedS)}${fig("stopped", "À l’arrêt", E().clock(a.stoppedS), "", a.stoppedS)}${fig("paused", "En pause", E().clock(a.pausedS + a.interruptedS), "", a.pausedS + a.interruptedS)}${a.missingS > 0 ? fig("missing", "Sans position", E().clock(a.missingS), "", a.missingS) : ""}
            ${fig("avgMoving", avgM.label, avgM.value, avgM.unit)}${fig("avgOverall", avgO.label, avgO.value, avgO.unit)}</dl>
          <p class="asc-small gps-climb" data-climb="${a.altitude.reliable ? "gnss" : "unreliable"}">${a.altitude.reliable ? `<strong>Dénivelé positif ${a.ascentM} m</strong> · négatif ${a.descentM} m. Source : altitude du GPS de l’appareil, lissée, non corrigée par une carte.` : "Dénivelé : l’altitude donnée par ce navigateur n’était pas assez fiable sur cette sortie, aucun chiffre n’est affiché."}</p>
        </div>
      </div>
      <div class="gps-block"><h3 class="asc-h3">Répartition du temps</h3>
        <div class="gps-timebar" role="img" aria-label="${esc(`Répartition du temps : ${bar.text}`)}">${bar.parts.map((p) => `<i data-kind="${p.kind}" style="flex-grow:${Math.max(0.0001, p.share).toFixed(4)}"></i>`).join("")}</div>
        <ul class="gps-legend">${bar.legend.map((l) => `<li><i data-kind="${l.kind}" aria-hidden="true"></i>${esc(l.label)} <span class="asc-num">${esc(E().clock(l.seconds))}</span></li>`).join("")}</ul>
        ${rec.interrupted || a.interruptedS > 0 ? `<p class="asc-small asc-muted">« En pause » compte tes pauses et ${esc(E().clock(a.interruptedS))} d’enregistrement interrompu (page fermée, rechargée ou en veille).</p>` : ""}</div>
      ${a.splits.length >= 2 ? `<div class="gps-block"><h3 class="asc-h3">Kilomètre par kilomètre</h3><div class="gps-table"><table><caption class="sr-only">Temps en mouvement et ${pace ? "allure" : "vitesse"} de chaque kilomètre</caption><thead><tr><th scope="col">Km</th><th scope="col">Temps</th><th scope="col">${pace ? "Allure" : "Vitesse"}</th></tr></thead><tbody>${a.splits.map(splitRow).join("")}</tbody></table></div><p class="asc-small asc-muted">Mesuré sur le mouvement seulement : un arrêt ou un trou n’entre dans aucun kilomètre.</p></div>` : ""}
      <div class="gps-block"><h3 class="asc-h3">Arrêts et qualité des données</h3>
        <p data-stops>${a.stops.length ? `${a.stops.length} arrêt${a.stops.length > 1 ? "s" : ""} détecté${a.stops.length > 1 ? "s" : ""}, le plus long de ${esc(E().clock(longest))}.` : "Aucun arrêt détecté."}</p>
        <p class="asc-small asc-muted" data-quality>${esc(`${q.points} positions gardées. ${q.refusedText} ${q.holesText} ${q.accuracyText} ${q.thinnedText}`.trim())}</p></div>
      ${plan ? `<div class="gps-block" data-plan-summary><h3 class="asc-h3">Séance structurée</h3><p>${plan.complete ? "Toutes les étapes ont été faites." : `${plan.done} étape${plan.done > 1 ? "s" : ""} sur ${plan.total}. Une séance interrompue garde ce qui a été fait.`}</p>${plan.laps.length ? `<ol class="gps-laps">${plan.laps.map((l) => `<li>${esc(l.text)}</li>`).join("")}</ol>` : ""}${plan.missed.length ? `<p class="asc-small asc-muted">Non atteintes : ${esc(plan.missed.join(", "))}.</p>` : ""}</div>` : ""}
      ${goal ? `<div class="gps-block" data-goal-result="${goal.reached}"><h3 class="asc-h3">${esc(goal.title)}</h3><p>${esc(goal.line)}</p></div>` : ""}
      <details class="gps-how"><summary>Comment c’est calculé</summary>${E().explain(a).map((line) => `<p class="asc-small">${esc(line)}</p>`).join("")}</details>
      <div class="gps-expedition" data-expedition></div>
      <div class="gps-bilan-actions">
        <p class="asc-small gps-bilan-status" role="status" data-bilan-status></p>
        ${saved ? `<div class="asc-actions"><a class="asc-btn asc-btn-primary" href="/journal">${icon("journal")} Voir le journal</a><button type="button" class="asc-btn asc-btn-secondary" data-act="export">${icon("download")} Exporter la trace GPX</button><button type="button" class="asc-btn asc-btn-ghost" data-act="new">Nouvelle sortie</button></div>`
          : `<div class="asc-actions"><button type="button" class="asc-btn asc-btn-primary" data-act="save"${d.ok ? "" : " disabled"}>${icon("check")} Enregistrer la séance</button><button type="button" class="asc-btn asc-btn-secondary" data-act="export"${a.points >= 2 ? "" : " disabled"}>${icon("download")} Exporter la trace GPX</button><button type="button" class="asc-btn asc-btn-ghost" data-act="discard">Abandonner</button></div>`}
        <p class="asc-small asc-muted">${saved ? "" : d.ok ? `La séance enregistrée porte les totaux (${d.unit === "km" ? `${esc(S().km(a.distanceM))} km, ` : ""}${esc(E().clock(a.effortS))} d’effort${a.autoPause ? ", le temps en mouvement" : ", arrêts détectés compris"}) et jamais ta trace. L’XP est décidée par le serveur. ` : `${esc(d.error)} `}Le GPX exporté est complet, avec heures et altitudes : c’est ta trace privée, à ne partager que si tu le veux.</p>
      </div>
    </section>`;
    if (a.points >= 2) { map = MAP().create(root.querySelector("[data-map]"), { interactive: false, tiles: false }); map.set({ segs: rec.track.segs, route: rec.follow ? rec.follow.route : null, pos: null, places: [] }); }
    paintBilanStatus();
    paintExpedition();
  }
  function paintBilanStatus() {
    const el = root?.querySelector("[data-bilan-status]");
    if (!el || !rec) return;
    const saved = rec.saved;
    const base = saved ? (isGuest() ? "Séance enregistrée sur cet appareil, comme toute séance en découverte. Retrouve-la dans ton journal." : "Séance enregistrée dans ton journal. La confirmation du serveur y apparaît dès qu’elle arrive.") : "";
    const trace = saved ? (saved.route === "saved" ? " La trace est gardée dans Mes parcours, en privé." : saved.route === "failed" ? " La trace n’a pas pu être gardée dans Mes parcours : elle reste sur cet appareil, exporte-la en GPX pour la garder." : " La trace reste sur cet appareil : exporte-la en GPX pour la garder.") : "";
    el.textContent = bilanStatus?.text || `${base}${trace}`;
    el.dataset.tone = bilanStatus?.tone || (saved ? "ok" : "");
  }

  /* ---------- Saving the session: the existing path, idempotent ---------- */
  const idOf = (l) => String(l?.client_event_id || l?.details?.client_event_id || l?.id || "");
  /** The same effort already in the journal (a watch import, a GPX of this outing): the V1.6 question, asked once, never a merge. */
  function duplicateOf(d) {
    const M = window.TitanSessionMatch;
    if (!M?.classify) return null;
    const mine = { sport: d.sport, unit: d.unit, val: d.val, date: d.data.performedAt, client_event_id: rec.eventId, details: { client_event_id: rec.eventId, duration: d.data.duration, hasGpx: true, gpxStats: d.data.gpxStats, extras: d.data.extras } };
    const m = M.classify(mine, window.state?.history || []);
    return m?.b?.raw ? { log: m.b.raw, match: m } : null;
  }
  async function saveSession() {
    if (savingSession || !rec || rec.status !== "ended" || rec.saved) return;
    savingSession = true;
    const id = owner, client = window.titanClient, epoch = window.titanAccountTransition?.epoch;
    const current = () => id === owner && client === window.titanClient && epoch === window.titanAccountTransition?.epoch && !window.titanAccountTransition?.active && !!rec;
    const buttons = [...root.querySelectorAll(".gps-bilan-actions button")];
    buttons.forEach((b) => { b.disabled = true; });
    const status = (text, tone) => { bilanStatus = text ? { text, tone } : null; paintBilanStatus(); };
    status("Enregistrement…");
    try {
      // The key is made once and stored with the recording BEFORE the session is written: a second press or a reload sends the same session.
      rec = R().withEventId(rec, () => crypto.randomUUID());
      await persist(true);
      const a = R().analysis(rec, rec.endedAt), d = R().sessionDetails(rec, a);
      if (!d.ok) throw new Error(d.error);
      const found = duplicateOf(d), twin = found?.log || null;
      if (twin && duplicateAccepted !== idOf(twin)) {
        const M = window.TitanSessionMatch, m = found.match;
        const when = new Date(twin.date).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
        const diffs = (m.divergences || []).map((x) => `${x.label} : ${x.b} dans le journal, ${x.a} ici`).join(" · ");
        const distinct = await window.titanShell.confirm({
          title: m.verdict === "ambiguous" ? "Même séance ? À vérifier" : "Cette sortie semble déjà dans ton journal",
          message: `Dans ton journal : ${SP().label(twin.sport)}, ${when} (${M.SOURCES?.[m.b.source] || "Saisie manuelle"}). ${m.rule || ""}${(m.reasons || []).length ? ` ${m.reasons.map((r) => M.REASONS?.[r]).filter(Boolean).join(" ")}` : ""}`,
          detail: `${diffs ? `${diffs}. ` : ""}Si c’est le même effort, garde l’existante : rien n’est ajouté. Si ce sont deux efforts, enregistre : ton choix est gardé avec la séance.`,
          confirmLabel: "Ce sont deux séances",
        });
        if (!distinct) { status("Séance non enregistrée : celle du journal est gardée. La sortie reste ici.", ""); return; }
        duplicateAccepted = idOf(twin);
      }
      if (twin) d.data.match = { distinct_from: [...new Set([idOf(twin), twin.id].filter(Boolean).map(String))], decided_at: new Date().toISOString() };
      expeditionBefore = await adventure();
      if (!current()) return;
      const log = await window.logActivity(d.sport, d.data, { quiet: true });
      if (!log) throw new Error("Séance non enregistrée.");
      if (!current()) return;
      rec = { ...rec, saved: { at: now(), id: log.client_event_id, route: "local", before: expeditionBefore ? { effort: expeditionBefore.effort, days: expeditionBefore.days, milestones: (expeditionBefore.milestones || []).map((m) => ({ ordinal: m.ordinal, ready: !!m.ready, earned: !!m.earned })) } : null } };
      await persist(true);
      window.dispatchEvent(new CustomEvent("titan:session-stored", { detail: { ownerId: id, logId: log.client_event_id } }));
      const count = window.TitanProgress?.activeLogs ? window.TitanProgress.activeLogs(window.state?.history || []).length : 0;
      if (count === 1 || count === 2) window.TitanAnalytics?.track(count === 1 ? "first_session" : "second_session", { family: SP().familyOf(d.sport) });
      // The trace joins the private library when the library can take it; otherwise it stays here and the screen says so.
      if (!isGuest() && typeof window.TitanRoutes?.saveRecorded === "function") {
        try { await window.TitanRoutes.saveRecorded(rec); if (current()) rec = { ...rec, saved: { ...rec.saved, route: "saved" } }; }
        catch { if (current()) rec = { ...rec, saved: { ...rec.saved, route: "failed" } }; }
        if (current()) await persist(true);
      }
      if (!current()) return;
      bilanStatus = null;
      renderBilan();
      root.querySelector("[data-bilan-status]")?.scrollIntoView({ block: "nearest" });
      announce("Séance enregistrée.");
      watchConfirmation();
    } catch (error) {
      if (current()) { status(error?.message || "Séance non enregistrée. Réessaie : la sortie reste sur cet appareil.", "err"); window.titanShell.toast({ type: "err", title: "Séance non enregistrée", message: "La sortie reste sur cet appareil : réessaie, ou exporte la trace." }); }
    } finally {
      savingSession = false;
      buttons.forEach((b) => { if (b.isConnected) b.disabled = false; });
    }
  }
  function exportGpx() {
    if (!rec) return;
    const text = N().toGpx(rec.track.segs, `${SP().label(rec.sport)} ${new Date(rec.startedAt).toLocaleDateString("fr-FR")}`);
    const url = URL.createObjectURL(new Blob([text], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url; a.download = R().gpxName(rec); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------- Expedition card: after a confirmed save only, from the server's own adventure snapshots ---------- */
  const world = () => { const s = window.TitanAdventure?.snapshot; return s && s.owner === owner && !s.local && typeof s.selected_world === "string" ? s.selected_world : null; };
  async function adventure() {
    const w = world();
    if (isGuest() || !w || !window.titanClient?.rpc) return null;
    try {
      const result = await Promise.race([window.titanClient.rpc("titan_adventure_rpg_snapshot_v1", { p_world: w }), new Promise((resolve) => setTimeout(() => resolve({ error: new Error("TIMEOUT") }), 6000))]);
      const data = result?.data;
      return !result?.error && data && data.owner === owner && data.world === w && data.active ? data : null;
    } catch { return null; }
  }
  let confirmationRun = 0;
  async function watchConfirmation() {
    if (!rec?.saved || isGuest() || screen !== "bilan") return;
    const log = (window.state?.history || []).find((l) => idOf(l) === rec.saved.id || l.client_event_id === rec.saved.id);
    if (!log || log.syncStatus !== "confirmed" || expedition) return;
    const run = ++confirmationRun, id = owner, w = world();
    const after = await adventure();
    if (run !== confirmationRun || id !== owner || !rec?.saved || !after) return;
    expedition = S().expedition(w, expeditionBefore || rec.saved.before || null, after);
    paintExpedition();
  }
  function paintExpedition() {
    const host = root?.querySelector("[data-expedition]");
    if (!host) return;
    host.innerHTML = expedition ? `<aside class="gps-expedition-card" aria-label="Expédition"><p class="asc-eyebrow">${esc(expedition.title)}</p><p>${esc(expedition.line)}</p>${expedition.opened.map((o) => `<p>${esc(o.text)}</p>`).join("")}<p class="asc-small">${esc(expedition.next)}</p><p class="asc-small asc-muted">${esc(expedition.note)}</p><a class="asc-btn asc-btn-secondary asc-btn-sm" href="/adventure">Ouvrir l’Aventure</a></aside>` : "";
  }

  /* ---------- Sheets ---------- */
  function openRoute() {
    const guest = isGuest();
    const library = guest ? '<p class="asc-small asc-muted" data-need-account="library">Mes parcours demande un compte : tes traces y sont gardées en privé.</p>'
      : typeof window.TitanRoutes?.openLibrary === "function" && window.TitanRoutes.enabled?.() !== false ? '<button type="button" class="asc-btn asc-btn-secondary asc-btn-block" data-route="library">Choisir dans Mes parcours</button>'
      : '<p class="asc-small asc-muted">Mes parcours n’est pas disponible pour le moment.</p>';
    const planner = guest ? '<p class="asc-small asc-muted" data-need-account="planner">Créer un itinéraire demande un compte.</p>'
      : typeof window.TitanPlanner?.open === "function" ? '<button type="button" class="asc-btn asc-btn-secondary asc-btn-block" data-route="planner">Créer un itinéraire</button>'
      : '<p class="asc-small asc-muted">Le calcul d’itinéraire n’est pas disponible sur ce site pour le moment.</p>';
    const s = sheet("Parcours à suivre", "");
    const home = () => {
      const f = draft.follow;
      s.body.innerHTML = `${f ? `<div class="gps-route-current" data-route-current><p><strong>${esc(f.route.name || "Parcours sans nom")}</strong></p><p class="asc-small asc-muted">${esc(kmText(f.route.distanceM))}${f.route.ascentM !== null && f.route.ascentM !== undefined ? ` · D+ ${f.route.ascentM} m` : ""} · ${f.route.points} points</p><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-route="remove">Retirer</button></div>` : '<p class="asc-muted">Aucun parcours : la sortie est libre. Un parcours suivi est une trace que tu as importée, enregistrée ou fait calculer — TITAN n’invente aucun chemin.</p>'}
        ${library}${planner}
        <button type="button" class="asc-btn asc-btn-secondary asc-btn-block" data-route="import">${icon("upload")} Importer un GPX</button>
        <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden data-gpx-file aria-label="Fichier GPX à importer" />
        <p class="asc-small" role="alert" data-route-error></p>
        <p class="asc-small asc-muted">Le fichier est lu dans ce navigateur et n’est envoyé nulle part. Indication seulement : TITAN ne garantit ni l’état ni la sécurité d’un chemin.</p>`;
    };
    let previewMap = null;
    const preview = (r) => {
      const { route, facts } = r;
      s.body.innerHTML = `<div data-gpx-preview><p><strong>${esc(route.name || "Parcours sans nom")}</strong></p>
        ${MAP().html({ interactive: false, label: `Aperçu du parcours : ${kmText(route.distanceM)}`, caption: "Aperçu : tracé seul, aucun serveur de cartes contacté" })}
        <dl class="gps-figs"><div data-fact="distance"><dt>Distance</dt><dd class="asc-num">${esc(S().km(route.distanceM))} <small>km</small></dd></div>
          ${facts.hasAltitude ? `<div data-fact="ascent"><dt>Dénivelé positif</dt><dd class="asc-num">${route.ascentM} <small>m</small></dd></div>` : ""}
          <div data-fact="points"><dt>Points</dt><dd class="asc-num">${facts.points}</dd></div>
          <div data-fact="segments"><dt>${route.segs.length > 1 ? "Tronçons" : "Tronçon"}</dt><dd class="asc-num">${route.segs.length}</dd></div></dl>
        <p class="asc-small asc-muted">${facts.ignoredPoints ? `${facts.ignoredPoints} point${facts.ignoredPoints > 1 ? "s" : ""} illisible${facts.ignoredPoints > 1 ? "s" : ""} ignoré${facts.ignoredPoints > 1 ? "s" : ""}. ` : "Aucun point ignoré. "}${facts.hasAltitude ? "" : "Pas de dénivelé : le fichier ne donne pas l’altitude de chaque point. "}${facts.cut > 0 ? `${facts.cut} saut${facts.cut > 1 ? "s" : ""} de plus de 5 km coupé${facts.cut > 1 ? "s" : ""} : les tronçons ne sont pas reliés. ` : route.segs.length > 1 ? "Les tronçons ne sont pas reliés entre eux. " : ""}${route.points < facts.points ? `Tracé allégé à ${route.points} points pour le suivi, sans déplacer ses extrémités.` : ""}</p>
        <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-route="cancel">Annuler</button><button type="button" class="asc-btn asc-btn-primary" data-route="follow">Suivre</button></div></div>`;
      previewMap = MAP().create(s.body.querySelector("[data-map]"), { interactive: false });
      previewMap.set({ segs: [], route, pos: null });
      s.body.querySelector('[data-route="follow"]').focus();
    };
    let pending = null;
    s.body.addEventListener("click", (e) => {
      const act = e.target.closest("[data-route]")?.dataset.route;
      if (!act) return;
      if (act === "remove") { draft.follow = null; writeFollow(null); home(); render(); }
      else if (act === "import") s.body.querySelector("[data-gpx-file]").click();
      else if (act === "library") { s.close(); window.TitanRoutes.openLibrary(); }
      else if (act === "planner") { s.close(); window.TitanPlanner.open({ sport: draft.sport }); }
      else if (act === "cancel") { pending = null; previewMap?.destroy(); home(); s.body.querySelector('[data-route="import"]').focus(); }
      else if (act === "follow" && pending) {
        draft.follow = { id: null, route: pending.route };
        const kept = writeFollow(draft.follow);
        previewMap?.destroy(); s.close(); render();
        if (!kept) window.titanShell.toast({ type: "warn", title: "Parcours gardé pour cette sortie", message: "Le stockage de cet appareil est plein : le parcours ne survivra pas à un rechargement de la page." });
        root.querySelector('[data-open="route"]')?.focus();
      }
    });
    s.body.addEventListener("change", async (e) => {
      const input = e.target.closest("[data-gpx-file]"), file = input?.files?.[0];
      if (!file) return;
      const fail = (text) => { const el = s.body.querySelector("[data-route-error]"); if (el) el.textContent = text; };
      if (file.size > 15 * 1024 * 1024) return fail("Le GPX doit faire moins de 15 Mo.");
      let text = "";
      try { text = await file.text(); } catch { return fail("Ce fichier n’a pas pu être lu."); }
      if (!s.dialog.open) return;
      let result;
      try { result = N().importGpx(text, window.TitanGpx, { sport: draft.sport }); } catch { result = { ok: false, error: "Ce fichier GPX est incomplet ou non pris en charge." }; }
      if (!result.ok) return fail(result.error);
      pending = { route: N().fit(result.route), facts: result.facts };
      preview({ route: pending.route, facts: result.facts });
    });
    s.dialog.addEventListener("close", () => previewMap?.destroy(), { once: true });
    home();
  }

  function openGoal() {
    const live = screen === "live";
    const current = S().goalOf(live ? rec.goal : draft.goal), kind = current?.kind || "none";
    const planned = !live && draft.sport ? plannedGoal(draft.sport) : null;
    const s = sheet("Objectif", `<p class="asc-muted">Facultatif. Un objectif est un repère que tu choisis : rien n’est prescrit, et la sortie compte de la même façon s’il n’est pas atteint.</p>
      ${planned ? `<p class="asc-note" data-planned>${icon("calendar")}<span>${esc(planned.label)}</span><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-goal="planned">Utiliser</button></p>` : ""}
      <fieldset class="gps-choices"><legend class="sr-only">Type d’objectif</legend>
        <label class="gps-choice"><input type="radio" name="gps-goal" value="none"${kind === "none" ? " checked" : ""} /><span>Aucun</span></label>
        <label class="gps-choice"><input type="radio" name="gps-goal" value="distance"${kind === "distance" ? " checked" : ""} /><span>Distance</span></label>
        <label class="asc-field gps-choice-field"><span>Distance visée (km)</span><input class="asc-input" type="number" inputmode="decimal" min="0.1" max="1000" step="0.1" data-goal-km value="${current?.kind === "distance" ? current.km : ""}" /></label>
        <label class="gps-choice"><input type="radio" name="gps-goal" value="time"${kind === "time" ? " checked" : ""} /><span>Durée</span></label>
        <label class="asc-field gps-choice-field"><span>Durée visée (minutes)</span><input class="asc-input" type="number" inputmode="numeric" min="1" max="1440" step="1" data-goal-min value="${current?.kind === "time" ? current.minutes : ""}" /></label>
        <label class="gps-choice"><input type="radio" name="gps-goal" value="return"${kind === "return" ? " checked" : ""} /><span>Être rentré pour</span></label>
        <label class="asc-field gps-choice-field"><span>Heure de retour</span><input class="asc-input" type="time" data-goal-at value="${current?.kind === "return" ? S().hhmm(current.at) : ""}" /></label>
      </fieldset>
      <p class="asc-small asc-muted">La durée est comptée sur ${(live ? rec.opts.autoPause : prefs.autoPause) ? "le temps en mouvement" : "le temps d’enregistrement, arrêts détectés compris"}. Pour l’heure de retour, TITAN estime le chemin du retour par la même trace, à ton rythme, sans connaître le relief ni ta fatigue : garde une marge.</p>
      <p class="asc-small" role="alert" data-goal-error></p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-goal="cancel">Annuler</button><button type="button" class="asc-btn asc-btn-primary" data-goal="ok">Valider</button></div>`);
    const apply = (goal) => {
      if (live) { rec = { ...rec, goal }; goalReached = false; persist(true); paintLive(); }
      else { draft.goal = goal; render(); }
      s.close();
      (live ? root.querySelector('[data-act="more"]') : root.querySelector('[data-open="goal"]'))?.focus();
    };
    for (const [sel, value] of [["[data-goal-km]", "distance"], ["[data-goal-min]", "time"], ["[data-goal-at]", "return"]])
      s.body.querySelector(sel).addEventListener("input", () => { s.body.querySelector(`input[name="gps-goal"][value="${value}"]`).checked = true; });
    s.body.addEventListener("click", (e) => {
      const act = e.target.closest("[data-goal]")?.dataset.goal;
      if (!act) return;
      if (act === "cancel") return s.close();
      if (act === "planned") return apply(planned.goal);
      const chosen = s.body.querySelector('input[name="gps-goal"]:checked')?.value || "none";
      const error = (text, sel) => { s.body.querySelector("[data-goal-error]").textContent = text; s.body.querySelector(sel)?.focus(); };
      if (chosen === "none") return apply(null);
      if (chosen === "distance") { const g = S().goalOf({ kind: "distance", km: Number(String(s.body.querySelector("[data-goal-km]").value).replace(",", ".")) }); return g ? apply(g) : error("Indique une distance entre 0,1 et 1000 km.", "[data-goal-km]"); }
      if (chosen === "time") { const g = S().goalOf({ kind: "time", minutes: Number(s.body.querySelector("[data-goal-min]").value) }); return g ? apply(g) : error("Indique une durée entre 1 minute et 24 h.", "[data-goal-min]"); }
      const at = R().returnAt(s.body.querySelector("[data-goal-at]").value, now());
      return at ? apply({ kind: "return", at }) : error("Indique l’heure à laquelle tu veux être rentré.", "[data-goal-at]");
    });
  }

  const DEFAULT_FORM = { warmup: { mode: "min", value: 10 }, reps: 4, work: { mode: "min", value: 3 }, recover: { mode: "min", value: 2 }, cooldown: { mode: "min", value: 10 } };
  function openPlan() {
    const live = screen === "live";
    const form = JSON.parse(JSON.stringify(draft.planForm || DEFAULT_FORM));
    const canVibrate = typeof navigator.vibrate === "function";
    const part = (key, label) => `<div class="gps-part" data-part="${key}"><label class="asc-field"><span>${label}</span><select data-part-mode aria-label="${label} : mesure"><option value="none">Sans</option>${Object.entries(R().PART_MODES).map(([m, l]) => `<option value="${m}"${form[key]?.mode === m ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="asc-field gps-part-value"><span class="sr-only">${label} : valeur</span><input class="asc-input" type="number" inputmode="decimal" min="0" step="any" data-part-value aria-label="${label} : valeur" value="${form[key]?.mode && form[key].mode !== "manual" && form[key].mode !== "none" ? esc(form[key].value) : ""}" /></label></div>`;
    const existing = live ? rec.plan?.steps || [] : draft.steps;
    const s = sheet("Séance structurée", `<p class="asc-muted">Facultatif. Tu donnes les durées ou les distances ; TITAN annonce seulement le changement d’étape, sans jamais prescrire une intensité.</p>
      ${part("warmup", "Échauffement")}
      <label class="asc-field gps-reps"><span>Répétitions</span><input class="asc-input" type="number" inputmode="numeric" min="1" max="30" step="1" data-plan-reps value="${esc(form.reps)}" /></label>
      ${part("work", "Effort")}${part("recover", "Récupération")}${part("cooldown", "Retour au calme")}
      <div class="gps-steps"><h3 class="asc-h3">Étapes</h3><ol data-plan-steps></ol><p class="asc-small" role="alert" data-plan-error></p></div>
      ${canVibrate ? `<label class="gps-toggle"><input type="checkbox" data-plan-vibrate${prefs.vibrate ? " checked" : ""} /><span>Vibration à chaque étape</span></label>` : '<p class="asc-small asc-muted" data-no-vibrate>Vibration non disponible dans ce navigateur : le changement d’étape s’affiche à l’écran.</p>'}
      <p class="asc-small asc-muted">Les étapes à durée comptent le temps d’enregistrement (un arrêt pendant une récupération reste une récupération) ; les étapes à distance, la distance mesurée. « Au signal » attend « Étape suivante ». Une séance interrompue garde ce qui a été fait.</p>
      <div class="asc-confirm-actions">${existing.length ? '<button type="button" class="asc-btn asc-btn-ghost" data-plan="remove">Retirer la séance</button>' : '<button type="button" class="asc-btn asc-btn-secondary" data-plan="cancel">Annuler</button>'}<button type="button" class="asc-btn asc-btn-primary" data-plan="ok">Utiliser cette séance</button></div>`);
    const read = () => {
      const f = { reps: Number(s.body.querySelector("[data-plan-reps]").value) || 1 };
      for (const el of s.body.querySelectorAll("[data-part]")) f[el.dataset.part] = { mode: el.querySelector("[data-part-mode]").value, value: el.querySelector("[data-part-value]").value };
      return f;
    };
    const show = () => {
      const f = read(), p = R().planFromForm(f);
      for (const el of s.body.querySelectorAll("[data-part]")) { const mode = el.querySelector("[data-part-mode]").value; el.querySelector(".gps-part-value").hidden = mode === "none" || mode === "manual"; }
      s.body.querySelector("[data-plan-steps]").innerHTML = p.steps.length ? p.steps.map((x) => `<li>${esc(S().describeStep(x))}</li>`).join("") : '<li class="asc-muted">Aucune étape pour l’instant.</li>';
      s.body.querySelector("[data-plan-error]").textContent = p.errors[0] || "";
      return { f, p };
    };
    s.body.addEventListener("input", show);
    s.body.addEventListener("change", show);
    s.body.addEventListener("click", (e) => {
      const act = e.target.closest("[data-plan]")?.dataset.plan;
      if (!act) return;
      const done = () => { s.close(); (live ? root.querySelector('[data-act="more"]') : root.querySelector('[data-open="plan"]'))?.focus(); };
      if (act === "cancel") return s.close();
      const vib = s.body.querySelector("[data-plan-vibrate]");
      if (vib) savePrefs({ vibrate: vib.checked });
      if (act === "remove") {
        if (live) { rec = { ...rec, plan: null }; lastStep = null; persist(true); paintLive(); } else { draft.steps = []; render(); }
        return done();
      }
      const { f, p } = show();
      if (p.errors.length || !p.steps.length) { s.body.querySelector("[data-plan-error]").textContent = p.errors[0] || "Ajoute au moins une étape : un échauffement, un effort ou un retour au calme."; return; }
      draft.planForm = f;
      if (live) {
        // A session set during the outing starts now: its first step counts from the present time and distance.
        const a = analysis();
        rec = { ...rec, plan: { steps: p.steps, cursor: { index: 0, fromS: a.recordingS, fromM: a.distanceM, laps: [] }, alerts: prefs.vibrate } };
        lastStep = null; persist(true); paintLive();
      } else { draft.steps = p.steps; render(); }
      done();
    });
    show();
  }

  function openSettings() {
    const live = screen === "live";
    const sport = live ? rec.sport : draft.sport, fam = E().familyOf(sport);
    const lay = S().layout(sport, prefs.fields[fam]);
    const auto = live ? rec.opts.autoPause : prefs.autoPause;
    const tiles = window.TitanGpsMap.tilesConfigured(window.TITAN_MAP);
    const s = sheet("Réglages", `<label class="gps-toggle"><input type="checkbox" data-set-auto${auto ? " checked" : ""} /><span>Pause automatique</span></label>
      <p class="asc-small asc-muted" data-auto-note></p>
      <fieldset class="gps-fields"><legend>Les quatre chiffres secondaires · ${esc(E().FAMILIES[fam].label)}</legend>
        ${lay.more.map((k, i) => `<label class="asc-field"><span>Chiffre ${i + 1}</span><select data-set-field="${i}">${lay.options.map((o) => `<option value="${o}"${o === k ? " selected" : ""}>${esc(S().FIELDS[o].label)}</option>`).join("")}</select></label>`).join("")}
        <p class="asc-small asc-muted">Les deux grands chiffres (${esc(lay.main.map((k) => S().FIELDS[k].label.toLowerCase()).join(" et "))}) sont ceux du sport. Ni fréquence cardiaque ni puissance : TITAN n’a pas de capteur autorisé pour les mesurer.</p>
        <p class="asc-small" role="alert" data-set-error></p></fieldset>
      <h3 class="asc-h3">Fond de carte</h3>
      ${tiles ? `<label class="gps-toggle"><input type="checkbox" data-set-tiles${prefs.tiles ? " checked" : ""} /><span>Afficher le fond de carte</span></label><p class="asc-small asc-muted">Désactivé par défaut : afficher un fond de carte indique à son fournisseur (${esc(window.TITAN_MAP.attribution)}) la zone que tu regardes.</p>` : '<p class="asc-small asc-muted" data-no-tiles>Fond de carte non configuré : la carte montre ta trace sur fond neutre</p>'}
      <h3 class="asc-h3">Écran</h3>
      <p class="asc-small asc-muted" data-wake-note>${"wakeLock" in navigator ? "Pendant l’enregistrement, TITAN demande à ton navigateur de garder l’écran allumé. Le navigateur peut refuser (économie d’énergie) : la sortie te le dit." : `${NO_WAKE}.`}</p>
      <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-primary" data-set="ok">Fermer</button></div>`);
    const note = () => { s.body.querySelector("[data-auto-note]").textContent = s.body.querySelector("[data-set-auto]").checked ? "Activée : la durée de la séance est le temps en mouvement. Un arrêt détecté (feu, pause photo) n’est pas compté comme effort." : "Désactivée : la durée de la séance garde les arrêts détectés. Tes pauses et les trous de signal ne sont jamais comptés."; };
    note();
    s.body.addEventListener("change", (e) => {
      if (e.target.matches("[data-set-auto]")) {
        note(); savePrefs({ autoPause: e.target.checked });
        if (live) { rec = { ...rec, opts: { ...rec.opts, autoPause: e.target.checked } }; persist(true); }
      } else if (e.target.matches("[data-set-tiles]")) { savePrefs({ tiles: e.target.checked }); map?.option({ tiles: prefs.tiles }); }
      else if (e.target.matches("[data-set-field]")) {
        const chosen = [...s.body.querySelectorAll("[data-set-field]")].map((x) => x.value), error = s.body.querySelector("[data-set-error]");
        if (new Set(chosen).size < 4) { error.textContent = "Choisis quatre chiffres différents : un doublon n’est pas enregistré."; return; }
        error.textContent = ""; savePrefs({ fields: { ...prefs.fields, [fam]: chosen } });
      }
    });
    s.body.querySelector('[data-set="ok"]').addEventListener("click", () => s.close());
    s.dialog.addEventListener("close", () => { if (screen === "live" || screen === "prepare") render(); }, { once: true });
  }

  function openMore() {
    const g = R().guide(rec);
    const row = (act, ic, title, sub) => `<button type="button" class="asc-row gps-row" data-more="${act}"><span class="asc-row-icon">${icon(ic)}</span><span class="asc-row-main"><span class="asc-row-title">${esc(title)}</span><span class="asc-row-sub">${esc(sub)}</span></span>${icon("chevron")}</button>`;
    const s = sheet("Plus", `<div class="asc-list">
      ${row("back", "home", "Retour au départ", rec.back ? "Guidage par le même chemin en cours" : "Par le même chemin, ou la direction à vol d’oiseau")}
      ${row("place", "pin", "Ajouter un point ici", "Un lieu personnel, privé")}
      ${row("goal", "target", "Objectif", goalText(rec.goal))}
      ${row("plan", "layers", "Séance structurée", rec.plan?.steps.length ? `${rec.plan.steps.length} étape${rec.plan.steps.length > 1 ? "s" : ""}` : "Aucune")}
      ${row("settings", "settings", "Réglages", `Pause automatique ${rec.opts.autoPause ? "activée" : "désactivée"}`)}
      ${g && g.kind === "follow" ? row("unfollow", "close", "Arrêter le suivi du parcours", g.name || "Parcours suivi") : ""}
      ${row("leave", "logout", "Mettre en pause et quitter la page", "La sortie reste sur cet appareil, tu la reprends en revenant")}
    </div>`);
    s.body.addEventListener("click", (e) => {
      const act = e.target.closest("[data-more]")?.dataset.more;
      if (!act) return;
      s.close();
      if (act === "back") openBack();
      else if (act === "place") openPlace();
      else if (act === "goal") openGoal();
      else if (act === "plan") openPlan();
      else if (act === "settings") openSettings();
      else if (act === "unfollow") { rec = R().stopFollow(rec); lastGuide = null; persist(true); paintLive(); announce("Suivi du parcours arrêté."); }
      else if (act === "leave") { if (rec.status === "recording") rec = R().pause(rec, now()); stopWatch(); keepAwake(false); persist(true).then(() => { location.href = "/training"; }); }
    });
  }

  function openBack() {
    const a = analysis(), way = R().wayBack(rec, a);
    let html;
    if (!way) html = '<p data-back-empty>Il faut au moins une position et un début de trace pour proposer un retour.</p>';
    else {
      const same = way.same, eta = way.eta;
      html = `${rec.back ? `<p class="asc-note" data-back-active>${icon("info")}<span>Guidage de retour par le même chemin en cours.</span><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm" data-back="stop">Arrêter</button></p>` : ""}
        ${way.near ? '<p class="asc-note">Tu es à moins de 30 m de ton point de départ.</p>' : ""}
        <section class="gps-back-option" data-back-option="same"><h3 class="asc-h3">Par le même chemin</h3>
          ${same ? `<p><strong class="asc-num">${esc(kmText(same.route.distanceM))}</strong> en repassant par ta trace, dans l’autre sens. ${eta ? `Environ ${esc(S().span(eta.lowS))} à ${esc(S().span(eta.highS))} à ton rythme en mouvement, hors arrêts ; le relief n’est pas pris en compte.` : "Estimation du temps après 5 min et 500 m de mouvement."}</p>
            ${same.holes ? `<p class="asc-small asc-muted" data-back-holes>Ta trace a ${same.holes} trou${same.holes > 1 ? "s" : ""} (pause ou signal perdu) : le chemin entre ses morceaux n’est pas connu, il n’est ni tracé ni compté (au moins ${esc(kmText(same.holesStraightM))} à vol d’oiseau en plus).</p>` : ""}
            <button type="button" class="asc-btn asc-btn-primary asc-btn-block" data-back="same"${rec.status !== "recording" ? " disabled" : ""}>Suivre le même chemin</button>${rec.status !== "recording" ? '<p class="asc-small asc-muted">Reprends l’enregistrement pour être guidé.</p>' : ""}` : '<p class="asc-muted">Ta trace est encore trop courte pour être suivie à l’envers.</p>'}</section>
        <section class="gps-back-option" data-back-option="computed"><h3 class="asc-h3">Itinéraire calculé</h3>
          ${isGuest() ? '<p class="asc-muted" data-need-account="planner">Le calcul d’itinéraire demande un compte.</p>' : typeof window.TitanPlanner?.open === "function" ? '<p>Un autre chemin, calculé depuis ta position jusqu’à ton départ.</p><button type="button" class="asc-btn asc-btn-secondary asc-btn-block" data-back="computed">Calculer un itinéraire</button>' : '<p class="asc-muted" data-no-planner>Calcul d’itinéraire indisponible : aucun service de calcul n’est configuré sur ce site. Le retour par le même chemin reste possible.</p>'}</section>
        <section class="gps-back-option" data-back-option="straight"><h3 class="asc-h3">À vol d’oiseau</h3>
          <p>Ton départ est à <strong class="asc-num">${esc(way.straight.distanceM >= 1000 ? kmText(way.straight.distanceM) : `${way.straight.distanceM} m`)}</strong> vers le ${esc(way.straight.cardinal)} (${way.straight.bearing}°). C’est une direction et une distance minimale, pas un chemin : elle n’est pas tracée sur la carte.</p></section>
        <p class="asc-small asc-muted" data-back-warning>Indication seulement : TITAN ne garantit ni l’état ni la sécurité du chemin.</p>`;
    }
    const s = sheet("Retour au départ", html);
    s.body.addEventListener("click", (e) => {
      const act = e.target.closest("[data-back]")?.dataset.back;
      if (!act) return;
      if (act === "same") { rec = R().startBack(rec, now()); lastGuide = null; courseOf = null; persist(true); s.close(); renderLive(); map?.fit(); announce("Retour par le même chemin : suis le tracé en pointillés."); }
      else if (act === "stop") { rec = R().stopBack(rec); lastGuide = null; courseOf = null; persist(true); s.close(); renderLive(); announce("Guidage de retour arrêté."); }
      else if (act === "computed") { s.close(); window.TitanPlanner.open({ from: way.from, to: way.start, sport: rec.sport }); }
    });
  }

  function openPlace() {
    const pos = rec.live && Number.isFinite(rec.live.lat) && now() - rec.live.t < 60000 ? rec.live : R().lastFix(rec);
    const html = isGuest() ? '<p class="asc-muted" data-need-account="places">Les lieux personnels demandent un compte : ils y sont gardés en privé.</p>'
      : typeof window.TitanPlaces?.add !== "function" ? '<p class="asc-muted">Les lieux personnels ne sont pas disponibles pour le moment.</p>'
      : !pos ? '<p class="asc-muted">Il faut une position pour ajouter un point ici.</p>'
      : `<p class="asc-muted">Le point est posé à ta dernière position${Number.isFinite(pos.acc) ? ` (± ${Math.round(pos.acc)} m)` : ""}. Privé : il reste dans tes lieux, jamais partagé ni publié.</p>
        <label class="asc-field"><span>Nom</span><input class="asc-input" type="text" maxlength="60" data-place-name autocomplete="off" /></label>
        <label class="asc-field"><span>Type</span><select data-place-kind>${Object.entries(PLACE_KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        <label class="asc-field"><span>Note (facultative)</span><input class="asc-input" type="text" maxlength="120" data-place-note autocomplete="off" /></label>
        <p class="asc-small" role="alert" data-place-error></p>
        <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-place="cancel">Annuler</button><button type="button" class="asc-btn asc-btn-primary" data-place="ok">Ajouter le point</button></div>`;
    const s = sheet("Ajouter un point ici", html);
    s.body.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-place]")?.dataset.place;
      if (!act) return;
      if (act === "cancel") return s.close();
      const name = s.body.querySelector("[data-place-name]").value.trim(), kind = s.body.querySelector("[data-place-kind]").value;
      const error = s.body.querySelector("[data-place-error]");
      if (!name) { error.textContent = "Donne un nom à ce point."; return s.body.querySelector("[data-place-name]").focus(); }
      try {
        await window.TitanPlaces.add({ name, kind, lat: pos.lat, lon: pos.lon, note: s.body.querySelector("[data-place-note]").value.trim() });
        s.close(); paintLive();
        window.titanShell.toast({ type: "ok", title: "Point ajouté", message: `${name} · ${PLACE_KINDS[kind]}. Privé.` });
      } catch { error.textContent = "Ce point n’a pas pu être ajouté. Réessaie."; }
    });
  }

  /* ---------- Events ---------- */
  function onClick(e) {
    const sportBtn = e.target.closest("[data-sport]");
    if (sportBtn && screen === "prepare") { draft.sport = sportBtn.dataset.sport; savePrefs({ sport: draft.sport }); render(); return root.querySelector(`[data-sport="${CSS.escape(draft.sport)}"]`)?.focus(); }
    const open = e.target.closest("[data-open]")?.dataset.open;
    if (open) return { route: openRoute, goal: openGoal, plan: openPlan, settings: openSettings }[open]?.();
    const view = e.target.closest("[data-view-set]")?.dataset.viewSet;
    if (view && R().VIEWS.includes(view)) {
      savePrefs({ view });
      const live = root.querySelector(".gps-live");
      live.dataset.view = view;
      for (const b of live.querySelectorAll("[data-view-set]")) b.setAttribute("aria-pressed", String(b.dataset.viewSet === view));
      map?.refresh(); paintLive();
      return;
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "start") start();
    else if (act === "pause") { pause(); root.querySelector(".gps-foot-pause")?.focus(); }
    else if (act === "resume") { resume(); root.querySelector(".gps-foot-pause")?.focus(); }
    else if (act === "finish") finish();
    else if (act === "more") openMore();
    else if (act === "discard") discard();
    else if (act === "save") saveSession();
    else if (act === "export") exportGpx();
    else if (act === "notice-close") { notice = null; paintNotice(); root.querySelector(".gps-foot-pause")?.focus(); }
    else if (act === "recheck") { booted = null; boot(); }
    else if (act === "next-step" && rec?.plan && rec.status === "recording") { rec = { ...rec, plan: { ...rec.plan, cursor: S().skipStep(rec.plan.steps, rec.plan.cursor, analysis()) } }; persist(true); paintLive(); }
    else if (act === "new") window.titanShell.confirm({ title: "Nouvelle sortie ?", message: "La séance est dans ton journal. La trace de cette sortie est effacée de cet appareil.", detail: rec?.saved?.route === "saved" ? "Elle reste dans Mes parcours." : "Exporte-la d’abord en GPX si tu veux la garder.", confirmLabel: "Effacer la trace et continuer" }).then((ok) => { if (ok) clear(); });
  }

  function onVisibility() {
    if (!rec || rec.status !== "recording" || screen !== "live") return;
    if (document.visibilityState === "hidden") { hiddenAt = now(); persist(true); return; }
    keepAwake(true);
    const away = hiddenAt ? now() - hiddenAt : 0;
    hiddenAt = null;
    if (away >= 5000) {
      // Some browsers stop the watch for good once the page slept: start it again, and say what the absence means.
      stopWatch(); startWatch();
      const fix = R().lastFix(rec), lost = !fix || now() - Math.max(fix.t, rec.live?.t || 0) > E().GAP_S * 1000;
      notice = lost
        ? { tone: "warn", text: `Page en arrière-plan ou écran verrouillé pendant ${S().chrono(away / 1000)} : aucune position n’est arrivée. Ce temps est compté « sans position », la distance n’est pas inventée et la trace n’est pas reliée.` }
        : { tone: "info", text: `Page en arrière-plan pendant ${S().chrono(away / 1000)} : ce navigateur a continué de donner des positions, la trace est complète.` };
      paintNotice();
      announce(lost ? "De retour sur la page : le temps passé en arrière-plan est compté sans position." : "De retour sur la page.");
    }
    paintLive();
  }

  /* ---------- Boot, account changes ---------- */
  async function boot() {
    root = document.getElementById("sortie");
    announcer = document.getElementById("sortie-annonce");
    if (!root || !SP() || !E() || !R() || !MAP()) return;
    const id = D()?.owner();
    if (!id || window.titanAccountTransition?.active || booted === id) return;
    booted = id; owner = id;
    const run = ++generation;
    SP().ensure();
    prefs = loadPrefs();
    const asked = new URLSearchParams(location.search).get("sport");
    draft = { sport: E().isGpsSport(asked) ? asked : prefs.sport, goal: null, steps: [], planForm: null, follow: readFollow() };
    readPermission().then(() => { if (run === generation && screen === "prepare") render(); });
    let stored = await store.read(id);
    if (run !== generation) return;
    if (!usable(stored, id)) stored = null;
    if (stored) {
      const mine = await lock.acquire(id);
      if (run !== generation) return;
      if (!mine) { screen = "othertab"; return render(); }
      rec = stored;
      // No page was recording it (this tab now holds the lock): a recording still marked as running was interrupted at its last position.
      if (rec.status === "recording") { rec = R().reconcile(rec, now()); persist(true); }
      resetLive();
      screen = rec.status === "ended" ? "bilan" : "resume";
      render();
      if (screen === "bilan") watchConfirmation();
      return;
    }
    rec = null;
    screen = flagOn() ? "prepare" : "gate";
    render();
  }
  function teardown() {
    generation++; booted = null;
    stopWatch(); keepAwake(false); stopTick();
    // The recording of the account that leaves stays its own: written once more under its owner, then forgotten by this page.
    if (rec && owner) { const snapshot = rec, id = owner; writeChain = writeChain.then(() => store.write(id, snapshot)).catch(() => {}); }
    rec = null; owner = null; map?.destroy(); map = null; notice = null; startError = "";
    lock.free();
    screen = "loading";
    if (root) { render(); root.innerHTML = '<p class="asc-small asc-muted" role="status">Synchronisation du compte…</p>'; }
  }

  function init() {
    root = document.getElementById("sortie");
    if (!root) return;
    root.addEventListener("click", onClick);
    root.addEventListener("change", (e) => {
      const more = e.target.closest("[data-sport-more]");
      if (more && more.value && screen === "prepare") { draft.sport = more.value; savePrefs({ sport: draft.sport }); render(); root.querySelector("[data-sport-more]")?.focus(); }
    });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", () => { if (rec && rec.status !== "ended") persist(true); });
    window.addEventListener("titan:flags-updated", () => { if (screen === "gate" || screen === "prepare") { screen = flagOn() ? "prepare" : "gate"; render(); } });
    window.addEventListener("titan:account-changing", teardown);
    window.addEventListener("titan:account-changed", () => boot());
    window.addEventListener("titan:history-updated", () => { if (!booted) boot(); else if (screen === "bilan") watchConfirmation(); else if (screen === "prepare" && !document.querySelector("dialog[open]")) render(); });
    window.addEventListener("storage", (e) => { if (owner && e.key === R().followKey(owner) && screen === "prepare") { draft.follow = readFollow(); if (!document.querySelector("dialog[open]")) render(); } });
    boot();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
  else setTimeout(init, 0);
})();
