/* TITAN — V1.7.7 route planner (« Créer un parcours »): from a point to another, or a loop of a wished length.
   TITAN computes no road itself: the request goes to the same-origin function /.netlify/functions/route-plan, which asks the routing
   provider configured on the server. When no provider is configured — the state of every deployment today — the sheet says so, says
   what planning needs and what works meanwhile; it never draws a made-up line.
   What comes back is the provider's proposal: its distance, ITS time estimate (labelled as such), its climb, its surfaces when it
   gives them. A loop's length, « rather flat » and « quiet ways » are preferences passed on, not guarantees, and the screen shows what
   was asked beside what was obtained. A route is never called safe: the line is an indication to check before leaving.
   No address search exists: a point is the athlete's position (asked once, after saying why), one of their own points, the start or
   the end of a library route, or typed coordinates. Private: a planned route is saved in the athlete's own library only when they ask.
   No position, distance or place enters an analytics event: this file sends none.
   Loaded after parcours.js (sheet, account guard, saving and following go through TitanRoutes). */
(function (root) {
  "use strict";
  const dep = (name, file) => root[name] || (typeof module !== "undefined" && typeof require === "function" ? require(file) : null);
  const NAV = () => dep("TitanGpsNav", "../core/gps-nav.js");
  const PROFILES = { road: "Vélo de route", bike: "Vélo polyvalent", gravel: "Gravel", mtb: "VTT", run: "Course à pied", walk: "Marche", hike: "Randonnée" };
  const SPORT_PROFILE = {
    cycling_road: "road", cycling: "bike", velotaf: "bike", handbike: "bike", para_cycling: "bike", gravel: "gravel", cyclocross: "gravel", mountain_bike: "mtb",
    running: "run", trail: "run", fell_running: "run", orienteering: "run", race_walking: "walk", walking: "walk", nordic_walk: "walk",
    hiking: "hike", trekking: "hike", rucking: "hike", snowshoeing: "hike",
  };
  const MAX_POINTS = 25, LOOP_MIN_KM = 1, LOOP_MAX_KM = 300, MAX_PLAN_POINTS = 20000;
  /** The routing profile of a sport, or null when no profile fits it (roller, ski, paddle: nothing is planned for them). */
  const profileOf = (sport) => SPORT_PROFILE[String(sport)] || null;

  /** « 48.5839, 7.7455 » (or with decimal commas, a semicolon, a space) -> { lat, lon }, else null. */
  function parseCoords(text) {
    const m = /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*°?\s*[;,\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*°?\s*$/.exec(String(text === null || text === undefined ? "" : text));
    if (!m) return null;
    const lat = Number(m[1].replace(",", ".")), lon = Number(m[2].replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
    return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
  }
  const pair = (p) => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5];
  const valid = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  /** Another proposal of the same loop: the function accepts a whole number from 0 to 99, and never the one just shown. */
  const newSeed = (previous) => { let n = Math.floor(Math.random() * 100); if (n === previous) n = (n + 1) % 100; return n; };

  /** The body of one request, or why it cannot be sent. `f`: { profile, mode: "points" | "loop", points: [{lat, lon} | null],
      loop: { start, km, seed }, prefer: { flat, quiet, unpaved } }. Only preferences that are set travel. */
  function buildRequest(f) {
    const form = f || {};
    if (!Object.prototype.hasOwnProperty.call(PROFILES, form.profile)) return { ok: false, error: "Choisis un profil d’itinéraire." };
    const prefer = {};
    for (const k of ["flat", "quiet", "unpaved"]) if (form.prefer && form.prefer[k] === true) prefer[k] = true;
    const extra = Object.keys(prefer).length ? { prefer } : {};
    if (form.mode === "loop") {
      const l = form.loop || {};
      if (!valid(l.start)) return { ok: false, error: "Indique le départ de la boucle : ta position, un de tes points ou des coordonnées comme « 48.5839, 7.7455 »." };
      const km = Number(String(l.km === undefined || l.km === null ? "" : l.km).replace(",", "."));
      if (!Number.isFinite(km) || km < LOOP_MIN_KM || km > LOOP_MAX_KM) return { ok: false, error: `Indique une distance de boucle entre ${LOOP_MIN_KM} et ${LOOP_MAX_KM} km.` };
      const loop = { start: pair(l.start), distanceM: Math.round(km * 1000) };
      if (Number.isFinite(l.seed)) loop.seed = Math.max(0, Math.min(99, Math.round(l.seed)));
      return { ok: true, body: { profile: form.profile, loop, ...extra } };
    }
    const points = form.points || [];
    const hole = points.findIndex((p) => !valid(p));
    if (points.length < 2) return { ok: false, error: "Il faut au moins un départ et une arrivée." };
    if (points.length > MAX_POINTS) return { ok: false, error: `${MAX_POINTS} points au plus, départ et arrivée compris.` };
    if (hole >= 0) return { ok: false, error: `${hole === 0 ? "Le départ" : hole === points.length - 1 ? "L’arrivée" : `L’étape ${hole}`} n’a pas de position valide : ta position, un de tes points ou des coordonnées comme « 48.5839, 7.7455 ».`, at: hole };
    for (let i = 1; i < points.length; i++) if (pair(points[i])[0] === pair(points[i - 1])[0] && pair(points[i])[1] === pair(points[i - 1])[1]) return { ok: false, error: "Deux points qui se suivent sont au même endroit : retire l’un des deux.", at: i };
    return { ok: true, body: { profile: form.profile, points: points.map(pair), ...extra } };
  }

  const line = (v, max) => (typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : null);
  const amount = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Math.round(Number(v)));
  /** Shares of a surface or a kind of way as fractions of the route (the provider may send 0–1 or 0–100), largest first, 6 at most + « Autres ». */
  function shares(list) {
    if (!Array.isArray(list)) return null;
    let rows = list.filter((x) => x && Number.isFinite(Number(x.share)) && Number(x.share) > 0).map((x) => ({ key: String(x.key === undefined ? x.label : x.key).slice(0, 40), label: line(String(x.label === undefined || x.label === null ? x.key : x.label), 40) || "Non précisé", share: Number(x.share) }));
    if (!rows.length) return null;
    const total = rows.reduce((n, r) => n + r.share, 0);
    rows = rows.map((r) => ({ ...r, share: r.share / total })).sort((a, b) => b.share - a.share);
    if (rows.length > 6) rows = [...rows.slice(0, 5), { key: "others", label: "Autres", share: rows.slice(5).reduce((n, r) => n + r.share, 0) }];
    return rows.map((r) => ({ ...r, pct: Math.max(1, Math.round(r.share * 100)) }));
  }
  /** Reads the function's answer into one state the screen can draw. Anything that is not a usable line is a failure said in words:
      { state: "ok", plan } or { state: "not_configured" | "auth" | "bad" | "rate" | "quota" | "no_route" | "unavailable" }. */
  function readResponse(status, json) {
    if (json && json.ok === true) {
      const segs = (Array.isArray(json.segs) ? json.segs : []).map((s) => (Array.isArray(s) ? s : []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)
        .map((p) => ({ lat: p[0], lon: p[1], ele: Number.isFinite(p[2]) ? p[2] : null }))).filter((s) => s.length >= 2);
      const count = segs.reduce((n, s) => n + s.length, 0), distanceM = amount(json.distanceM);
      if (!segs.length || count > MAX_PLAN_POINTS || !distanceM) return { state: "unavailable" };
      return { state: "ok", plan: { provider: line(json.provider, 60) || "le fournisseur d’itinéraires", attribution: line(json.attribution, 200), profile: Object.prototype.hasOwnProperty.call(PROFILES, json.profile) ? json.profile : null,
        profileNote: line(json.profileNote, 240), distanceM, durationS: amount(json.durationS), ascentM: amount(json.ascentM), descentM: amount(json.descentM), segs,
        surface: shares(json.surface), waytype: shares(json.waytype), warnings: (Array.isArray(json.warnings) ? json.warnings : []).map((w) => line(w, 240)).filter(Boolean).slice(0, 8),
        requested: json.requested && typeof json.requested === "object" ? json.requested : null } };
    }
    const code = json && typeof json.code === "string" ? json.code : "";
    if (code === "ROUTING_NOT_CONFIGURED" || status === 404) return { state: "not_configured" };
    if (code === "AUTH_REQUIRED" || status === 401 || status === 403) return { state: "auth" };
    if (code === "NO_ROUTE" || status === 422) return { state: "no_route" };
    if (code === "RATE_LIMITED" || status === 429) return { state: "rate" };
    if (code === "QUOTA_EXCEEDED") return { state: "quota" };
    if (code === "BAD_REQUEST" || status === 400) return { state: "bad" };
    return { state: "unavailable" };
  }
  const MESSAGES = {
    not_configured: "La planification n’est pas encore activée sur le serveur.",
    offline: "Le calcul d’itinéraire demande une connexion. Tes parcours enregistrés restent utilisables.",
    guest: "La planification demande un compte : le calcul passe par le serveur de TITAN, qui vérifie qui le demande. En mode découverte, tu peux importer un GPX et le suivre.",
    auth: "Ta session a expiré : reconnecte-toi pour calculer un itinéraire.",
    no_route: "Aucun itinéraire trouvé avec ce profil. Rapproche les points d’une voie, change de profil, ou réduis la distance de la boucle.",
    rate: "Trop de calculs en peu de temps. Réessaie dans quelques minutes.",
    quota: "Le quota de calculs d’itinéraire du jour est atteint. L’import GPX et tes parcours enregistrés restent utilisables.",
    bad: "Cette demande n’a pas été acceptée (points trop éloignés ou distance hors limites). Modifie-la, puis réessaie.",
    unavailable: "Le fournisseur d’itinéraires n’a pas répondu correctement. Rien n’est affiché plutôt qu’un tracé incertain.",
  };
  /** The proposal as a route to keep or to follow (origin « planned »). Null when it draws nothing. */
  function toRoute(plan, meta) {
    const N = NAV();
    return N && plan ? N.makeRoute(plan.segs, { origin: "planned", ...(meta || {}) }) : null;
  }
  const kmText = (m) => `${(m / 1000).toFixed(m >= 100000 ? 0 : 1).replace(".", ",")} km`;
  /** A loop as it was wished beside what the provider proposed. `wish`: { distanceM, ceilingM (wished maximum climb, optional), prefer }.
      Every line ends on what it is: a preference, not a guarantee. */
  function loopFacts(plan, wish) {
    const w = wish || {}, out = [];
    if (w.distanceM > 0) {
      const gap = Math.round(((plan.distanceM - w.distanceM) / w.distanceM) * 100);
      out.push({ key: "distance", text: `Distance demandée : ${kmText(w.distanceM)} · obtenue : ${kmText(plan.distanceM)}${gap ? ` (${gap > 0 ? "+" : "−"}${Math.abs(gap)} %)` : ""}. La longueur d’une boucle est une préférence, pas une garantie.` });
    }
    if (w.ceilingM > 0) {
      out.push({ key: "climb", over: plan.ascentM !== null && plan.ascentM > w.ceilingM,
        text: plan.ascentM === null ? `D+ souhaité : ${w.ceilingM} m au plus · le fournisseur ne donne pas le dénivelé de ce tracé, impossible de comparer.`
          : `D+ souhaité : ${w.ceilingM} m au plus · obtenu : ${plan.ascentM} m${plan.ascentM > w.ceilingM ? " — au-dessus de ton souhait" : ""}. Préférence, pas garantie : le plafond n’est pas imposé au fournisseur.` });
    }
    const asked = [w.prefer && w.prefer.flat ? "plutôt plat" : "", w.prefer && w.prefer.quiet ? "voies calmes" : "", w.prefer && w.prefer.unpaved ? "chemins plutôt que bitume" : ""].filter(Boolean);
    if (asked.length) out.push({ key: "prefer", text: `Préférences transmises : ${asked.join(", ")}. Le fournisseur en tient compte s’il le peut : préférence, pas garantie.` });
    return out;
  }
  const hoursMinutes = (s) => { const m = Math.max(1, Math.round(s / 60)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`; };

  const api = { PROFILES, SPORT_PROFILE, MAX_POINTS, LOOP_MIN_KM, LOOP_MAX_KM, profileOf, parseCoords, buildRequest, readResponse, shares, toRoute, loopFacts, MESSAGES, newSeed, hoursMinutes };
  root.TitanPlanner = Object.assign(root.TitanPlanner || {}, api);
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;

  /* ---------------- Interface (browser only) ---------------- */
  const U = () => window.TitanRoutes?.ui || null;
  const coordsText = (p) => `${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}`;
  const KNOWN = "titan.plan.notconfigured.v1";
  const knownOff = () => { try { return Date.now() - Number(window.sessionStorage.getItem(KNOWN) || 0) < 15 * 60 * 1000; } catch { return false; } };
  const rememberOff = (off) => { try { if (off) window.sessionStorage.setItem(KNOWN, String(Date.now())); else window.sessionStorage.removeItem(KNOWN); } catch { /* nothing to remember */ } };

  async function post(ctx, body) {
    const token = (await ctx.client.auth.getSession())?.data?.session?.access_token;
    if (typeof token !== "string" || !token) return { status: 401, json: { ok: false, code: "AUTH_REQUIRED" } };
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 40000);
    try {
      const res = await fetch("/.netlify/functions/route-plan", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: stop.signal });
      let json = null;
      try { json = await res.json(); } catch { /* not JSON: read as unavailable */ }
      return { status: res.status, json };
    } finally { clearTimeout(timer); }
  }

  /** Opens the planner. `options`: { from: [lat, lon], to: [lat, lon], sport, onSaved({ id, message }), onFollow(payload), fromLibrary }. */
  function open(options) {
    const ui = U(), o = options || {};
    if (!ui) return null;
    const ctx = ui.context();
    if (!ui.alive(ctx)) return null;
    const { esc, icon } = ui, guest = ui.isGuest(ctx.owner);
    const body = document.createElement("div");
    body.className = "asc-stack pl-sheet";
    const d = ui.sheet({ title: "Créer un parcours", eyebrow: "Planification", body });
    ui.guardSheet(d, ctx);
    const ok = () => ui.alive(ctx) && d.open;
    const at = (v) => (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? coordsText({ lat: v[0], lon: v[1] }) : "");
    const sports = ui.gpsSports().filter(([id]) => profileOf(id));
    const firstSport = profileOf(o.sport) ? o.sport : profileOf(ui.lastGpsSport()) ? ui.lastGpsSport() : "hiking";
    const P = { sport: firstSport, profile: profileOf(firstSport), mode: o.from && !o.to ? "loop" : "points", points: [{ text: at(o.from), note: "" }, { text: at(o.to), note: "" }], loop: { text: at(o.from), note: "", km: "20", seed: 0 },
      prefer: { flat: false, quiet: false, unpaved: false }, ceiling: "", phase: "form", state: knownOff() ? "not_configured" : "", message: "", plan: null, route: null, wish: null, name: "", savedId: null, places: [], routes: [], run: 0 };
    const say = (t) => { P.message = t || ""; const n = body.querySelector("[data-pl-status]"); if (n) n.textContent = P.message; };

    const blocked = (state) => {
      if (state === "not_configured") return `<section class="pl-panel" data-pl-state="not_configured"><h3 class="asc-h3">${esc(MESSAGES.not_configured)}</h3>
        <p class="asc-small"><strong>Ce qu’il faut :</strong> un compte chez un fournisseur d’itinéraires, configuré sur le serveur de TITAN (voir docs/V177_CARTES_ET_ROUTAGE.md). Tant que ce n’est pas fait, aucun itinéraire ne peut être calculé ici — et TITAN n’en invente pas.</p>
        <p class="asc-small"><strong>Ce qui marche en attendant :</strong></p>
        <ul class="asc-small pl-meanwhile"><li>importer un GPX préparé dans n’importe quel planificateur (Mes parcours, « Importer un GPX ») ;</li><li>suivre un parcours que tu as déjà enregistré ;</li><li>revenir par le même chemin pendant une sortie.</li></ul>
        ${o.fromLibrary || !window.TitanRoutes?.openLibrary ? "" : `<button type="button" class="asc-btn asc-btn-secondary rt-tap" data-pl-library>${icon("route")} Ouvrir Mes parcours</button>`}</section>`;
      return `<p class="asc-note ${state === "offline" || state === "guest" ? "warn" : "err"}" data-pl-state="${esc(state)}">${icon(state === "offline" ? "offline" : "alert")}<span>${esc(MESSAGES[state] || MESSAGES.unavailable)}</span>${state === "unavailable" || state === "rate" ? '<button type="button" class="asc-btn asc-btn-secondary asc-btn-sm rt-tap" data-pl-go>Réessayer</button>' : ""}</p>`;
    };
    const fill = (target, text) => `<select class="pl-fill" data-pl-fill="${esc(target)}" aria-label="Remplir ${esc(text)} avec…"><option value="">Remplir avec…</option><option value="here">Ma position</option>
      ${P.places.length ? `<optgroup label="Mes points">${P.places.map((p) => `<option value="place:${esc(p.id)}">${esc(p.name)}</option>`).join("")}</optgroup>` : ""}
      ${P.routes.length ? `<optgroup label="Départ d’un parcours">${P.routes.map((r) => `<option value="start:${esc(r.id)}">${esc(ui.titleOf(r))}</option>`).join("")}</optgroup><optgroup label="Arrivée d’un parcours">${P.routes.map((r) => `<option value="end:${esc(r.id)}">${esc(ui.titleOf(r))}</option>`).join("")}</optgroup>` : ""}</select>`;
    const pointName = (i, n) => (i === 0 ? "Départ" : i === n - 1 ? "Arrivée" : `Étape ${i}`);
    const pointRow = (p, i, n) => `<li class="pl-point" data-pl-point="${i}"><label class="asc-field"><span>${pointName(i, n)}</span><input type="text" class="asc-input" inputmode="text" data-pl-coords="${i}" value="${esc(p.text)}" placeholder="48.5839, 7.7455" autocomplete="off" /></label>
      <div class="pl-point-tools">${fill(String(i), pointName(i, n).toLowerCase())}
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-pl-up="${i}" aria-label="Monter ${pointName(i, n).toLowerCase()}" ${i === 0 ? "disabled" : ""}>${icon("up") || "↑"}</button>
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-pl-down="${i}" aria-label="Descendre ${pointName(i, n).toLowerCase()}" ${i === n - 1 ? "disabled" : ""}>${icon("down") || "↓"}</button>
        <button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-pl-drop="${i}" aria-label="Retirer ${pointName(i, n).toLowerCase()}" ${n <= 2 ? "disabled" : ""}>${icon("close") || "×"}</button></div>
      <p class="asc-small asc-muted" data-pl-note="${i}">${esc(p.note)}</p></li>`;
    function formHtml() {
      const n = P.points.length;
      return `${P.state ? blocked(P.state) : !ui.online() ? blocked("offline") : ""}
        <div class="asc-form-grid"><label class="asc-field"><span>Sport</span><select data-pl-sport>${sports.map(([id, label]) => `<option value="${esc(id)}"${id === P.sport ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
          <label class="asc-field"><span>Profil d’itinéraire</span><select data-pl-profile>${Object.entries(PROFILES).map(([k, v]) => `<option value="${k}"${k === P.profile ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label></div>
        <div class="asc-seg pl-tabs" role="group" aria-label="Type de parcours"><button type="button" class="rt-tap" data-pl-mode="points" aria-pressed="${P.mode === "points"}">D’un point à un autre</button><button type="button" class="rt-tap" data-pl-mode="loop" aria-pressed="${P.mode === "loop"}">Boucle</button></div>
        ${P.mode === "points" ? `<ol class="pl-points">${P.points.map((p, i) => pointRow(p, i, n)).join("")}</ol>
            <button type="button" class="asc-btn asc-btn-ghost rt-tap" data-pl-via ${n >= MAX_POINTS ? "disabled" : ""}>${icon("plus")} Ajouter une étape</button>`
          : `<div class="pl-point" data-pl-point="loop"><label class="asc-field"><span>Départ et retour</span><input type="text" class="asc-input" inputmode="text" data-pl-coords="loop" value="${esc(P.loop.text)}" placeholder="48.5839, 7.7455" autocomplete="off" /></label>
              <div class="pl-point-tools">${fill("loop", "le départ de la boucle")}</div><p class="asc-small asc-muted" data-pl-note="loop">${esc(P.loop.note)}</p></div>
            <label class="asc-field"><span>Distance visée (km)</span><input type="text" class="asc-input" inputmode="decimal" data-pl-km value="${esc(P.loop.km)}" autocomplete="off" /></label>
            <label class="asc-field"><span>D+ maximum souhaité, en mètres (facultatif)</span><input type="text" class="asc-input" inputmode="numeric" data-pl-ceiling value="${esc(P.ceiling)}" autocomplete="off" /><small>Le fournisseur ne reçoit que « plutôt plat » : ce plafond sert à comparer le résultat à ton souhait.</small></label>`}
        <div data-pl-ask hidden></div>
        <p class="asc-small asc-muted">Pas de recherche d’adresse dans TITAN : un point est ta position, un de tes points, le départ ou l’arrivée d’un de tes parcours, ou des coordonnées saisies (latitude, longitude).</p>
        <fieldset class="pl-fieldset"><legend>Préférences (pas des garanties)</legend>
          <label class="pl-check"><input type="checkbox" data-pl-prefer="flat"${P.prefer.flat ? " checked" : ""} /><span>Plutôt plat</span></label>
          <label class="pl-check"><input type="checkbox" data-pl-prefer="quiet"${P.prefer.quiet ? " checked" : ""} /><span>Voies calmes</span></label>
          <label class="pl-check"><input type="checkbox" data-pl-prefer="unpaved"${P.prefer.unpaved ? " checked" : ""} /><span>Chemins plutôt que bitume</span></label></fieldset>
        <p class="asc-small asc-faint">Le calcul envoie ces points au fournisseur d’itinéraires configuré sur le serveur. Rien n’est partagé avec d’autres personnes, et rien n’est enregistré tant que tu ne le demandes pas.</p>
        <button type="button" class="asc-btn asc-btn-primary rt-tap" data-pl-go ${P.phase === "busy" ? "disabled" : ""}>${icon("route")} ${P.phase === "busy" ? "Calcul en cours…" : "Calculer l’itinéraire"}</button>
        <p class="asc-small" role="status" data-pl-status>${esc(P.message)}</p>`;
    }
    const bars = (title, rows, missingText) => (rows ? `<section class="pl-shares" data-pl-shares="${esc(title)}"><p class="asc-eyebrow">${esc(title)}</p>
        <div class="pl-bar" role="img" aria-label="${esc(`${title} : ${rows.map((r) => `${r.label} ${r.pct} %`).join(", ")}`)}">${rows.map((r, i) => `<span class="pl-bar-part pl-tone-${i % 6}" style="flex-grow:${Math.max(1, Math.round(r.share * 1000))}"></span>`).join("")}</div>
        <ul class="pl-legend">${rows.map((r, i) => `<li><span class="pl-swatch pl-tone-${i % 6}" aria-hidden="true"></span>${esc(r.label)} · <span class="asc-num">${r.pct} %</span></li>`).join("")}</ul></section>`
      : `<p class="asc-small asc-muted" data-pl-shares-missing>${esc(missingText)}</p>`);
    function resultHtml() {
      const plan = P.plan, facts = P.wish ? loopFacts(plan, P.wish) : [];
      const figures = [["Distance", ui.km(plan.distanceM)], ...(plan.durationS ? [[`Durée estimée par ${plan.provider}`, hoursMinutes(plan.durationS)]] : []),
        ...(plan.ascentM !== null ? [["Dénivelé positif", `${plan.ascentM} m`]] : []), ...(plan.descentM !== null ? [["Dénivelé négatif", `${plan.descentM} m`]] : [])];
      return `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm rt-tap rt-back" data-pl-edit>← Modifier</button>
        <h3 class="asc-h3" tabindex="-1" data-pl-focus>Itinéraire proposé${P.mode === "loop" ? " · boucle" : ""}</h3>
        ${ui.routeMap(P.route, `Itinéraire proposé de ${ui.km(plan.distanceM)}`)}
        <dl class="moment-metrics">${figures.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="asc-num">${esc(v)}</dd></div>`).join("")}</dl>
        <p class="asc-small asc-faint">${plan.durationS ? `La durée est l’estimation de ${esc(plan.provider)}, pas une prévision de TITAN : elle ignore ta forme, tes arrêts et la météo. ` : "Le fournisseur ne donne pas de durée pour ce tracé. "}${plan.ascentM === null ? "Dénivelé : donnée non fournie par le fournisseur." : "Dénivelé d’après les données du fournisseur."}</p>
        ${facts.length ? `<ul class="asc-small pl-facts" data-pl-facts>${facts.map((f) => `<li data-pl-fact="${f.key}">${esc(f.text)}</li>`).join("")}</ul>` : ""}
        ${bars("Revêtement", plan.surface, "Revêtement : donnée non fournie par le fournisseur")}
        ${bars("Type de voie", plan.waytype, "Type de voie : donnée non fournie par le fournisseur")}
        ${plan.warnings.length ? `<div class="asc-note warn" data-pl-warnings>${icon("alert")}<ul class="pl-warnings">${plan.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
        ${plan.profileNote ? `<p class="asc-small asc-muted" data-pl-profile-note>${esc(plan.profileNote)}</p>` : ""}
        <p class="asc-small asc-faint">Tracé indicatif : TITAN ne connaît ni l’état des chemins ni la circulation. Vérifie-le avant de partir.${plan.attribution ? ` <span data-pl-attribution>${esc(plan.attribution)}</span>` : ""}</p>
        <label class="asc-field"><span>Nom du parcours</span><input type="text" class="asc-input" maxlength="80" data-pl-name value="${esc(P.name)}" autocomplete="off" /></label>
        <div class="asc-actions rt-actions">${P.savedId ? "" : `<button type="button" class="asc-btn asc-btn-primary rt-tap" data-pl-save>${guest ? "Garder sur cet appareil" : "Enregistrer dans Mes parcours"}</button>`}
          <button type="button" class="asc-btn asc-btn-secondary rt-tap" data-pl-follow>${icon("play")} Suivre maintenant</button>
          ${P.mode === "loop" ? `<button type="button" class="asc-btn asc-btn-secondary rt-tap" data-pl-again>${icon("swap")} Autre proposition</button>` : ""}
          <button type="button" class="asc-btn asc-btn-ghost rt-tap" data-pl-edit>Modifier</button></div>
        <p class="asc-small" role="status" data-pl-status>${esc(P.message)}</p>`;
    }
    function draw(focus) {
      body.innerHTML = guest ? blocked("guest") + (window.TitanRoutes?.openLibrary && !o.fromLibrary ? `<button type="button" class="asc-btn asc-btn-secondary rt-tap" data-pl-library>${icon("route")} Ouvrir Mes parcours</button>` : "")
        : `<div class="asc-stack" data-pl-view="${P.phase === "result" ? "result" : "form"}">${P.phase === "result" ? resultHtml() : formHtml()}</div>`;
      if (focus) (typeof focus === "string" ? body.querySelector(focus) : body.querySelector("[data-pl-focus]"))?.focus();
    }
    /** Brings what is typed back into P before anything is drawn again. */
    function collect() {
      body.querySelectorAll("[data-pl-coords]").forEach((n) => { const k = n.dataset.plCoords; if (k === "loop") P.loop.text = n.value; else if (P.points[Number(k)]) P.points[Number(k)].text = n.value; });
      const km = body.querySelector("[data-pl-km]"), ceiling = body.querySelector("[data-pl-ceiling]"), name = body.querySelector("[data-pl-name]");
      if (km) P.loop.km = km.value;
      if (ceiling) P.ceiling = ceiling.value;
      if (name) P.name = name.value;
    }
    const slotOf = (target) => (target === "loop" ? P.loop : P.points[Number(target)]);
    async function fillWith(target, choice) {
      const slot = slotOf(target);
      if (!slot || !choice) return;
      const set = (p, note) => { slot.text = coordsText(p); slot.note = note; collectExcept(target); draw(`[data-pl-coords="${target}"]`); };
      const collectExcept = (t) => { const keep = slot.text; collect(); slotOf(t).text = keep; };
      if (choice === "here") {
        const here = await ui.askPosition(body.querySelector("[data-pl-ask]"), "Pour remplir ce point,");
        if (ok() && here) set(here, here.acc ? `Ma position, lue à ± ${here.acc} m.` : "Ma position.");
        return;
      }
      const [kind, id] = [choice.slice(0, choice.indexOf(":")), choice.slice(choice.indexOf(":") + 1)];
      if (kind === "place") { const p = P.places.find((x) => x.id === id); if (p) set(p, `Mon point « ${p.name} ».`); return; }
      const noteNode = body.querySelector(`[data-pl-note="${target}"]`);
      if (noteNode) noteNode.textContent = "Lecture du parcours…";
      const route = await window.TitanRoutes.load(id);
      if (!ok()) return;
      if (!route) { if (noteNode) noteNode.textContent = ui.online() ? "Ce parcours n’a pas pu être lu." : "Hors ligne : ce parcours n’a pas de copie sur cet appareil."; return; }
      const seg = kind === "end" ? route.segs[route.segs.length - 1] : route.segs[0], p = kind === "end" ? seg[seg.length - 1] : seg[0];
      set(p, `${kind === "end" ? "Arrivée" : "Départ"} de « ${ui.titleOf(P.routes.find((r) => r.id === id) || { name: route.name, sport: route.sport })} ».`);
    }
    async function compute(again) {
      if (P.phase === "busy") return;
      collect();
      if (again) P.loop.seed = newSeed(P.loop.seed);
      const ceiling = Number(String(P.ceiling).replace(",", "."));
      const req = buildRequest({ profile: P.profile, mode: P.mode, points: P.points.map((p) => parseCoords(p.text)), loop: { start: parseCoords(P.loop.text), km: P.loop.km, seed: P.loop.seed }, prefer: P.prefer });
      if (!req.ok) { P.phase = "form"; P.message = req.error; return draw(req.at !== undefined ? `[data-pl-coords="${req.at}"]` : "[data-pl-go]"); }
      if (!ui.online()) { P.phase = "form"; P.state = "offline"; P.message = ""; return draw("[data-pl-go]"); }
      const run = ++P.run;
      P.phase = "busy"; P.state = ""; P.message = "Calcul en cours chez le fournisseur d’itinéraires…";
      draw();
      let read;
      try { const res = await post(ctx, req.body); read = readResponse(res.status, res.json); }
      catch { read = { state: ui.online() ? "unavailable" : "offline" }; }
      if (!ok() || run !== P.run) return;
      rememberOff(read.state === "not_configured");
      const route = read.state === "ok" ? toRoute(read.plan, { sport: P.sport }) : null;
      if (!route) { P.phase = "form"; P.state = read.state === "ok" ? "unavailable" : read.state; P.message = ""; return draw("[data-pl-state]"); }
      P.plan = read.plan; P.route = route; P.savedId = null;
      P.wish = P.mode === "loop" ? { distanceM: req.body.loop.distanceM, ceilingM: Number.isFinite(ceiling) && ceiling > 0 ? Math.round(ceiling) : 0, prefer: P.prefer } : Object.values(P.prefer).some(Boolean) ? { prefer: P.prefer } : null;
      if (!P.name || P.autoName) { P.name = `${P.mode === "loop" ? "Boucle" : "Itinéraire"} ${PROFILES[P.profile].toLowerCase()} · ${kmText(read.plan.distanceM)}`; P.autoName = true; }
      P.phase = "result"; P.message = "";
      draw(true);
    }

    body.addEventListener("input", (e) => { if (e.target.matches("[data-pl-name]")) P.autoName = false; });
    body.addEventListener("change", (e) => {
      if (!ok()) return;
      const t = e.target;
      if (t.matches("[data-pl-sport]")) { collect(); P.sport = t.value; P.profile = profileOf(P.sport) || P.profile; draw("[data-pl-sport]"); }
      else if (t.matches("[data-pl-profile]")) P.profile = t.value;
      else if (t.matches("[data-pl-prefer]")) P.prefer = { ...P.prefer, [t.dataset.plPrefer]: t.checked };
      else if (t.matches("[data-pl-fill]")) { const target = t.dataset.plFill, choice = t.value; t.value = ""; fillWith(target, choice); }
    });
    body.addEventListener("click", async (e) => {
      if (!ok()) return;
      const t = e.target, pick = (name) => t.closest(`[data-pl-${name}]`);
      if (pick("library")) { d.close(); return window.TitanRoutes.openLibrary({ onFollow: o.onFollow }); }
      if (pick("mode")) { collect(); P.mode = pick("mode").dataset.plMode; P.message = ""; return draw(`[data-pl-mode="${P.mode}"]`); }
      if (pick("via")) { collect(); P.points.splice(P.points.length - 1, 0, { text: "", note: "" }); return draw(`[data-pl-coords="${P.points.length - 2}"]`); }
      for (const [name, move] of [["up", -1], ["down", 1]]) {
        const b = pick(name);
        if (b) { collect(); const i = Number(b.dataset[`pl${name[0].toUpperCase()}${name.slice(1)}`]), j = i + move; if (P.points[j]) { [P.points[i], P.points[j]] = [P.points[j], P.points[i]]; } return draw(`[data-pl-coords="${P.points[j] ? j : i}"]`); }
      }
      if (pick("drop")) { collect(); if (P.points.length > 2) P.points.splice(Number(pick("drop").dataset.plDrop), 1); return draw("[data-pl-via]"); }
      if (pick("go")) return compute(false);
      if (pick("again")) return compute(true);
      if (pick("edit")) { collect(); P.phase = "form"; P.message = ""; return draw("[data-pl-go]"); }
      if (pick("follow")) { collect(); return window.TitanRoutes.follow({ ...P.route, name: P.name.trim().slice(0, 80), sport: P.sport }, P.savedId, say, o.onFollow); }
      const save = pick("save");
      if (save && !save.disabled) {
        collect();
        save.disabled = true;
        say("Enregistrement…");
        const r = await window.TitanRoutes.save({ ...P.route, name: P.name, sport: P.sport }, { origin: "planned", sport: P.sport, name: P.name, distanceM: P.plan.distanceM, ascentM: P.plan.ascentM === null ? P.route.ascentM : P.plan.ascentM });
        if (!ok()) return;
        if (!r.ok) { save.disabled = false; return say(r.error); }
        P.savedId = r.id;
        const message = r.queued ? "Hors ligne : parcours gardé sur cet appareil. Il partira vers ta bibliothèque au retour du réseau." : r.local ? "Parcours gardé sur cet appareil seulement (mode découverte)."
          : r.created === false ? "Ce parcours est déjà dans ta bibliothèque : rien n’a été ajouté." : r.nameLocal ? "Parcours enregistré. Nom gardé sur cet appareil en attendant la mise à jour du serveur." : "Parcours enregistré dans Mes parcours.";
        P.message = message;
        draw("[data-pl-follow]");
        o.onSaved?.({ id: r.id, message });
      }
    });

    if (guest) { draw(); return d; }
    body.innerHTML = '<div class="asc-skeleton" style="height:160px"></div>';
    Promise.all([Promise.resolve().then(() => window.TitanPlaces?.list?.() || []).catch(() => []), Promise.resolve().then(() => window.TitanRoutes?.catalog?.() || []).catch(() => [])]).then(([places, routes]) => {
      if (!ok()) return;
      P.places = places; P.routes = routes.slice(0, 60);
      draw();
    });
    return d;
  }

  Object.assign(root.TitanPlanner, { open });
})(typeof window !== "undefined" ? window : globalThis);
