/* TITAN 300 — Routes (GPS traces recorded with the Android app), seen on the web.
   Read-only apart from deletion: the web never records a trace. PRIVATE: the library is the account's own (titan_routes_v1 and friends read
   only the caller's rows), nothing here publishes anything, and the map is a plain drawing of the trace — no map server is contacted, so
   looking at a route reveals nothing about where it is. The GPX download is built in the browser from the trace the account already owns;
   the "share" download removes the first and last 300 m and carries no time or altitude. Behind the flag screens.routes. */
(function (root) {
  "use strict";
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const hav = (a, b) => {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const SHARE_TRIM_M = 300;

  /** {v:1, t0, segs:[[lat*1e5, lon*1e5, seconds since t0, altitude in dm|null]...]} -> segments of {lat, lon, t, alt}. Anything malformed is dropped. */
  function decode(doc) {
    if (!doc || doc.v !== 1 || !Array.isArray(doc.segs)) return [];
    return doc.segs.map((s) => (Array.isArray(s) ? s : []).filter((p) => Array.isArray(p) && p.length === 4 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]) && Math.abs(p[0]) <= 9000000 && Math.abs(p[1]) <= 18000000)
      .map((p) => ({ lat: p[0] / 1e5, lon: p[1] / 1e5, t: (Number(doc.t0) || 0) + p[2] * 1000, alt: Number.isFinite(p[3]) ? p[3] / 10 : null }))).filter((s) => s.length);
  }

  /** Equirectangular projection fitted in a box (north up). Returns SVG point lists and the start / end positions. */
  function project(segs, width, height, pad = 12) {
    const pts = segs.flat();
    if (pts.length < 2) return { lines: [], start: null, end: null };
    const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const k = Math.cos(rad((minLat + maxLat) / 2));
    const w = Math.max((maxLon - minLon) * k, 1e-6), h = Math.max(maxLat - minLat, 1e-6);
    const scale = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
    const ox = (width - w * scale) / 2, oy = (height - h * scale) / 2;
    const at = (p) => ({ x: ox + (p.lon - minLon) * k * scale, y: height - (oy + (p.lat - minLat) * scale) });
    const lines = segs.map((s) => s.map(at));
    return { lines, start: at(segs[0][0]), end: at(segs[segs.length - 1][segs[segs.length - 1].length - 1]) };
  }

  const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
  function gpx(segs, name, opts = {}) {
    const time = opts.time !== false, ele = opts.ele !== false;
    const body = segs.filter((s) => s.length).map((s) => `<trkseg>${s.map((f) => `<trkpt lat="${f.lat.toFixed(6)}" lon="${f.lon.toFixed(6)}">${ele && f.alt !== null ? `<ele>${f.alt.toFixed(1)}</ele>` : ""}${time ? `<time>${new Date(f.t).toISOString()}</time>` : ""}</trkpt>`).join("")}</trkseg>`).join("");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TITAN" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${xml(name)}</name>${body}</trk></gpx>\n`;
  }

  /** Removes the first and last `meters` along the path; null when the route is too short to hide both ends and still show something. */
  function trimEnds(segs, meters = SHARE_TRIM_M) {
    const flat = [], segOf = [];
    segs.forEach((s, si) => s.forEach((f) => { flat.push(f); segOf.push(si); }));
    if (flat.length < 4) return null;
    const cum = [0];
    for (let i = 1; i < flat.length; i++) cum[i] = cum[i - 1] + (segOf[i] === segOf[i - 1] ? hav(flat[i - 1], flat[i]) : 0);
    const total = cum[cum.length - 1];
    if (total < meters * 2 + 150) return null;
    let k = 0;
    const out = segs.map((s) => s.filter(() => { const keep = cum[k] >= meters && cum[k] <= total - meters; k++; return keep; })).filter((s) => s.length);
    return out.reduce((n, s) => n + s.length, 0) >= 2 ? out : null;
  }

  const api = { decode, project, gpx, trimEnds, SHARE_TRIM_M };
  root.TitanRoutes = Object.assign(root.TitanRoutes || {}, api);
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;

  /* ---------------- UI (browser only) ---------------- */
  const esc = (s) => window.titanEsc(s);
  const icon = (n, c) => window.titanIcon(n, c);
  const enabled = () => window.titanFlags?.enabled?.("screens.routes", false) === true;
  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active && a.owner && !String(a.owner).startsWith("guest_");
  const km = (m) => (window.TitanFormat?.distance ? window.TitanFormat.distance(m / 1000) : `${(m / 1000).toFixed(2).replace(".", ",")} km`);
  const clock = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
  const when = (iso) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  async function call(ctx, fn, args) {
    if (!same(ctx, context())) throw Error("STALE");
    const r = await ctx.client.rpc(fn, args);
    if (!same(ctx, context())) throw Error("STALE");
    if (r.error) throw Error(r.error.message || "UNAVAILABLE");
    return r.data;
  }
  function mapSvg(segs, label) {
    const W = 360, H = 220, p = project(segs, W, H);
    return `<svg class="rt-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet"><rect width="${W}" height="${H}" rx="14" class="rt-map-bg"/>
      ${p.lines.map((l) => `<polyline class="rt-line" fill="none" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${l.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")}"/>`).join("")}
      ${p.start ? `<circle class="rt-start" cx="${p.start.x.toFixed(1)}" cy="${p.start.y.toFixed(1)}" r="7"/>` : ""}${p.end ? `<circle class="rt-end" cx="${p.end.x.toFixed(1)}" cy="${p.end.y.toFixed(1)}" r="7"/>` : ""}</svg>
      <p class="asc-small asc-faint rt-legend"><span class="rt-dot rt-start"></span> départ · <span class="rt-dot rt-end"></span> arrivée · tracé seul, aucun serveur de cartes n’est contacté</p>`;
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const SP = () => window.TitanSports;
  const routeBody = (r, segs) => `<div class="rt-detail">${mapSvg(segs, `Trace de ${km(r.distanceM)}`)}
    <dl class="moment-metrics"><div><dt>Distance</dt><dd class="asc-num">${esc(km(r.distanceM))}</dd></div><div><dt>Temps actif</dt><dd class="asc-num">${esc(clock(r.durationS))}</dd></div>
      <div><dt>Dénivelé positif</dt><dd class="asc-num">${r.ascentM === null || r.ascentM === undefined ? "–" : esc(r.ascentM + " m")}</dd></div></dl>
    <div class="asc-actions"><button type="button" class="asc-btn asc-btn-secondary" data-rt-gpx>${icon("download")} Télécharger en GPX</button>
      <button type="button" class="asc-btn asc-btn-secondary" data-rt-share>${icon("share")} GPX à partager</button>
      <button type="button" class="asc-btn asc-btn-ghost" data-rt-del>Supprimer ce parcours</button></div>
    <p class="asc-small asc-faint">Le GPX à partager n’a ni heure ni altitude, et ses 300 premiers et derniers mètres sont retirés pour ne pas révéler ton point de départ. Rien n’est publié par TITAN. <span data-rt-status role="status"></span></p></div>`;

  function wire(host, r, segs, ctx, onDeleted) {
    const status = (t) => { const n = host.querySelector("[data-rt-status]"); if (n) n.textContent = t || ""; };
    const day = new Date(r.startedAt).toISOString().slice(0, 10);
    const label = `${SP()?.label?.(r.sport) || r.sport} ${day}`;
    host.querySelector("[data-rt-gpx]")?.addEventListener("click", () => download(`titan-${r.sport}-${day}.gpx`, gpx(segs, label)));
    host.querySelector("[data-rt-share]")?.addEventListener("click", () => {
      const t = trimEnds(segs);
      if (!t) return status("Parcours trop court : impossible de masquer le début et la fin sans révéler d’où tu pars. Il reste privé.");
      download(`titan-parcours-${day}.gpx`, gpx(t, SP()?.label?.(r.sport) || r.sport, { time: false, ele: false }));
    });
    host.querySelector("[data-rt-del]")?.addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await call(ctx, "titan_route_delete_v1", { p_id: r.id }); onDeleted?.(); } catch (err) { b.disabled = false; if (err.message !== "STALE") status("Suppression impossible pour le moment."); }
    });
  }

  /** Inside a session's detail: the map of the route linked to it (nothing at all when it has none or the feature is off). */
  async function mountForSession(slot, log) {
    if (!slot || !enabled() || !log?.client_event_id) return;
    const ctx = context();
    if (!same(ctx, context())) return;
    try {
      const meta = await call(ctx, "titan_route_for_event_v1", { p_event_id: log.client_event_id });
      if (!meta) return;
      const full = await call(ctx, "titan_route_get_v1", { p_id: meta.id });
      if (!slot.isConnected || !same(ctx, context())) return;
      const segs = decode(full.track);
      if (!segs.length) return;
      slot.innerHTML = `<section class="jr-detail-block"><p class="asc-eyebrow">Parcours</p>${routeBody(meta, segs)}</section>`;
      wire(slot, { ...meta }, segs, ctx, () => { slot.innerHTML = ""; });
    } catch { /* a server without the function, or a changed account: no map, no noise */ }
  }

  async function openLibrary() {
    if (!enabled()) return;
    const ctx = context();
    if (!same(ctx, context())) return;
    const body = document.createElement("div");
    body.className = "asc-stack";
    body.innerHTML = '<div class="asc-skeleton" style="height:120px"></div>';
    const d = window.titanShell.sheet({ title: "Mes parcours", eyebrow: "GPS", body });
    const guard = () => { if (!same(ctx, context())) d.close(); };
    ["titan:account-changing", "titan:account-changed"].forEach((ev) => window.addEventListener(ev, guard));
    d.addEventListener("close", () => ["titan:account-changing", "titan:account-changed"].forEach((ev) => window.removeEventListener(ev, guard)), { once: true });
    async function list() {
      try {
        const rows = await call(ctx, "titan_routes_v1", { p_limit: 100 });
        body.innerHTML = `<p class="asc-small asc-muted">Tes traces GPS enregistrées avec l’application Android. Privées : jamais partagées ni publiées.</p>
          ${rows.length ? `<ul class="rt-list">${rows.map((r) => `<li><button type="button" class="jr-row" data-rt-open="${esc(r.id)}"><strong>${esc(SP()?.label?.(r.sport) || r.sport)}</strong> <span class="asc-small asc-muted">${esc(when(r.startedAt))} · ${esc(km(r.distanceM))} · ${esc(clock(r.durationS))}</span></button></li>`).join("")}</ul>` : '<p class="asc-small asc-muted">Aucun parcours pour le moment. Enregistre une sortie avec le GPS de l’application Android.</p>'}`;
      } catch (e) { if (e.message !== "STALE") body.innerHTML = '<p class="asc-note err">Les parcours ne sont pas disponibles pour le moment.</p>'; }
    }
    body.addEventListener("click", async (e) => {
      const id = e.target.closest("[data-rt-open]")?.dataset.rtOpen;
      if (!id) { if (e.target.closest("[data-rt-back]")) list(); return; }
      try {
        const r = await call(ctx, "titan_route_get_v1", { p_id: id });
        const segs = decode(r.track);
        body.innerHTML = `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm" data-rt-back>← Mes parcours</button>${routeBody(r, segs)}`;
        wire(body, r, segs, ctx, list);
      } catch (err) { if (err.message !== "STALE") body.insertAdjacentHTML("beforeend", '<p class="asc-note err">Ce parcours n’a pas pu être ouvert.</p>'); }
    });
    list();
  }
  Object.assign(root.TitanRoutes, { mountForSession, openLibrary, enabled });
})(typeof window !== "undefined" ? window : globalThis);
