/* TITAN 300 — Routes (GPS traces), seen on the web: the athlete's library, a GPX import, the copy kept in this browser to follow a route
   without a network, and the comparison of outings on one route (V1.7.7).
   PRIVATE: the library is the account's own (titan_routes_v1 / v2 and friends read only the caller's rows), nothing here publishes anything,
   and the map is a plain drawing of the trace — no map server is contacted, so looking at a route reveals nothing about where it is.
   The GPX download is built in the browser from the trace the account already owns; the "share" download removes the first and last
   300 m and carries no time or altitude. This file never opens a network connection of its own: it only calls the account's route functions.
   Flags: screens.routes opens the library as it was (read and delete); screens.gps adds import, names, following, the planner, the
   personal points and the comparison. A server that does not know the v2 functions yet is read and written through v1: the name then
   stays in this browser and the screen says so. Following is an indication: a route is never called safe. */
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

  /* ---------------- V1.7.7: the rules of the library (pure, tested under Node) ---------------- */
  const dep = (name, file) => root[name] || (typeof module !== "undefined" && typeof require === "function" ? require(file) : null);
  const NAV = () => dep("TitanGpsNav", "../core/gps-nav.js");
  const ENG = () => dep("TitanGpsEngine", "../core/gps-engine.js");
  const ORIGINS = { recorded: "Enregistré", imported: "Importé", planned: "Planifié" };
  const MAX_OFFLINE = 40; // copies kept in this browser: the least recently opened one leaves when the 41st arrives
  const CANDIDATES_MAX = 25;

  /** The server does not know this function yet (migration not applied): PostgREST PGRST202 or HTTP 404, Postgres 42883. */
  function missing(error) {
    if (!error) return false;
    const code = String(error.code || ""), status = Number(error.status) || 0;
    return code === "PGRST202" || code === "42883" || status === 404 || /could not find the function|function [\w.]+\([^)]*\) does not exist/i.test(String(error.message || ""));
  }
  /** The request never reached the server (no network): the caller then works from what this browser holds. */
  const unreachable = (error) => !!error && !error.code && (error.status === 0 || /failed to fetch|networkerror|load failed|network request failed|err_internet/i.test(String(error.message || "")));

  const cleanName = (name) => String(name === null || name === undefined ? "" : name).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const summaryOf = (s) => (s && typeof s === "object" && Number(s.movingS) > 0 && Number(s.elapsedS) > 0 ? s : null);
  /** One library row, whichever version answered. A v1 row has no name, origin or summary: what this browser kept for it (`local`) fills them. */
  function normalize(row, local) {
    if (!row || typeof row !== "object" || !row.id) return null;
    const mine = (local && local[row.id]) || {};
    const serverName = cleanName(row.name);
    const out = {
      id: String(row.id), sport: row.sport || null, startedAt: row.startedAt || null, distanceM: Number(row.distanceM) || 0, durationS: Number(row.durationS) || 0,
      ascentM: row.ascentM === null || row.ascentM === undefined ? null : Number(row.ascentM), points: Number(row.points) || 0, eventId: row.eventId || null,
      name: serverName || cleanName(mine.name), nameLocal: !serverName && !!cleanName(mine.name),
      origin: ORIGINS[row.origin] ? row.origin : ORIGINS[mine.origin] ? mine.origin : "recorded", summary: summaryOf(row.summary) || summaryOf(mine.summary),
    };
    if (row.track) out.track = row.track;
    return out;
  }

  const fnv = (text, seed) => { let h = seed >>> 0; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, "0"); };
  const digestOf = (value) => { const t = typeof value === "string" ? value : JSON.stringify(value); return fnv(t, 2166136261) + fnv(t, 0x9747b28c); };
  /** The id a save is known by on the server (idempotent there). A recording is named after its start, so sending it again — a lost
      answer, a retry after a night offline — never makes a second route; a file or a planned line is named after its own shape. */
  function clientRouteId(origin, key, sport) {
    if (origin === "recorded") {
      const t = Number(key);
      if (!Number.isFinite(t) || t <= 0) return null;
      return `rec-${Math.round(t).toString(36)}-${String(sport || "gps").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "gps"}`;
    }
    return `${origin === "planned" ? "pln" : "imp"}-${digestOf(key)}`;
  }

  /** Everything one save needs, built once: the v2 arguments, the same for a server that only knows v1, and what the list shows meanwhile.
      `o`: { origin, sport, name, startedAt (ms), distanceM, durationS, ascentM, summary, eventId, now }. */
  function saveArgs(route, o) {
    const N = NAV(), opt = o || {};
    if (!N || !route || !Array.isArray(route.segs) || !route.segs.length) return { ok: false, error: "Ce parcours n’a pas de trace à enregistrer." };
    if (!opt.sport) return { ok: false, error: "Choisis le sport de ce parcours." };
    const origin = ORIGINS[opt.origin] ? opt.origin : "imported";
    const first = route.segs[0][0], timed = route.segs.some((s) => s.some((p) => Number.isFinite(p.t) && p.t > 0));
    const now = Number.isFinite(opt.now) ? opt.now : Date.now();
    const t0 = timed ? (origin === "recorded" && Number.isFinite(opt.startedAt) ? opt.startedAt : first.t) : undefined;
    const track = N.encode(route, t0);
    const points = track.segs.reduce((n, s) => n + s.length, 0);
    if (points < 2 || points > N.MAX_ROUTE_POINTS) return { ok: false, error: "Cette trace est trop détaillée pour être enregistrée (3 000 points au plus, même allégée)." };
    if (track.segs.length > 200) return { ok: false, error: "Cette trace a trop de tronçons séparés (200 au plus) pour être enregistrée." };
    // The server accepts a start within 400 days: an older file is dated at the day it enters the library.
    let started = Number.isFinite(opt.startedAt) ? opt.startedAt : timed && Number.isFinite(first.t) ? first.t : now;
    if (started > now + 86400000 || started < now - 399 * 86400000) started = now;
    const id = opt.clientRouteId || clientRouteId(origin, origin === "recorded" ? started : track.segs, opt.sport);
    if (!id || !/^[A-Za-z0-9_.:-]{8,64}$/.test(id)) return { ok: false, error: "Ce parcours n’a pas pu être préparé pour l’enregistrement." };
    const name = cleanName(opt.name), ascent = opt.ascentM === undefined ? route.ascentM : opt.ascentM;
    const v1 = { p_client_route_id: id, p_sport: String(opt.sport), p_started_at: new Date(started).toISOString(), p_distance_m: Math.max(0, Math.round(Number.isFinite(opt.distanceM) ? opt.distanceM : route.distanceM)),
      p_duration_s: Math.max(0, Math.round(Number(opt.durationS) || 0)), p_ascent_m: ascent === null || ascent === undefined || !Number.isFinite(ascent) ? null : Math.max(0, Math.round(ascent)), p_track: track };
    const summary = summaryOf(opt.summary);
    return { ok: true, clientRouteId: id, v1, v2: { ...v1, p_name: name || null, p_origin: origin, p_summary: summary }, eventId: opt.eventId || null,
      meta: { name, sport: v1.p_sport, origin, startedAt: v1.p_started_at, distanceM: v1.p_distance_m, durationS: v1.p_duration_s, ascentM: v1.p_ascent_m, points, summary } };
  }
  /** The arguments a v1 server accepts: the same save without the name, the origin and the summary. */
  const v1Args = (v2) => { const { p_name, p_origin, p_summary, ...rest } = v2; return rest; };

  /** The routes kept in this browser (one key per route, an index beside them), per owner. `storage` is localStorage or anything like it.
      A full storage never throws out of here: the oldest copies that are not waiting to be sent leave first (three at most), then the
      answer is { ok: false, reason: "quota" } and the screen says so. */
  function offlineStore(storage, owner, max) {
    const limit = max || MAX_OFFLINE;
    const INDEX = `titan.routes.offline.v1:${owner}`, ITEM = (id) => `titan.routes.offline.v1:${owner}:${id}`;
    const read = () => {
      try { const v = JSON.parse(storage.getItem(INDEX) || "null"); if (v && Array.isArray(v.items)) return { items: v.items.filter((m) => m && m.id), declined: Array.isArray(v.declined) ? v.declined : [] }; } catch { /* unreadable index: start again */ }
      return { items: [], declined: [] };
    };
    const write = (idx) => storage.setItem(INDEX, JSON.stringify({ v: 1, items: idx.items, declined: idx.declined.slice(-200) }));
    const drop = (id) => { try { storage.removeItem(ITEM(id)); } catch { /* nothing to remove */ } };
    return {
      list: () => read().items,
      bytes: () => read().items.reduce((n, m) => n + (m.bytes || 0), 0),
      declined: (id) => read().declined.includes(id),
      get(id) {
        const meta = read().items.find((m) => m.id === id);
        if (!meta) return null;
        try { const doc = JSON.parse(storage.getItem(ITEM(id)) || "null"); return doc && Array.isArray(doc.segs) ? { meta, doc } : null; } catch { return null; }
      },
      put(id, meta, doc, now) {
        let raw;
        try { raw = JSON.stringify(doc); } catch { return { ok: false, reason: "unavailable" }; }
        const idx = read(), evicted = [];
        let items = idx.items.filter((m) => m.id !== id);
        const oldest = () => [...items].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0)).find((m) => !m.queued);
        for (let tries = 0; ; tries++) {
          try { storage.setItem(ITEM(id), raw); break; }
          catch {
            const victim = tries < 3 ? oldest() : null;
            if (!victim) return { ok: false, reason: "quota" };
            drop(victim.id); evicted.push(victim.id); items = items.filter((m) => m.id !== victim.id);
          }
        }
        const entry = { ...meta, id, savedAt: Number.isFinite(now) ? now : Date.now(), bytes: raw.length };
        items = [entry, ...items];
        while (items.length > limit) { const victim = oldest(); if (!victim) break; drop(victim.id); evicted.push(victim.id); items = items.filter((m) => m.id !== victim.id); }
        try { write({ items, declined: idx.declined.filter((x) => x !== id) }); }
        catch { drop(id); try { write({ items: items.filter((m) => m.id !== id), declined: idx.declined }); } catch { /* the index stays as it was */ } return { ok: false, reason: "quota" }; }
        return { ok: true, meta: entry, evicted };
      },
      /** `decline`: the athlete removed this copy on purpose, so opening the route again does not silently bring it back. */
      remove(id, decline) {
        const idx = read();
        drop(id);
        try { write({ items: idx.items.filter((m) => m.id !== id), declined: decline ? [...idx.declined.filter((x) => x !== id), id] : idx.declined.filter((x) => x !== id) }); return true; } catch { return false; }
      },
      patch(id, change) {
        const idx = read();
        if (!idx.items.some((m) => m.id === id)) return false;
        try { write({ items: idx.items.map((m) => (m.id === id ? { ...m, ...change } : m)), declined: idx.declined }); return true; } catch { return false; }
      },
    };
  }

  /** The other outings worth reading to compare with `target`: recorded, same family of sport, within 10 % of its distance; newest first, 25 at most. */
  function candidates(target, rows, max) {
    const E = ENG();
    if (!target || !E || !(target.distanceM > 0)) return [];
    const fam = E.familyOf(target.sport);
    return (rows || []).filter((r) => r && r.id !== target.id && r.origin === "recorded" && E.familyOf(r.sport) === fam && r.distanceM > 0
      && Math.abs(r.distanceM - target.distanceM) / Math.max(r.distanceM, target.distanceM) <= 0.1)
      .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || ""))).slice(0, max || CANDIDATES_MAX);
  }
  /** What one outing brings to a comparison. With the engine's summary: the time in movement. Without it (a route saved before V1.7.7):
      only the active time, stops included — shown, never ranked. */
  function effortOf(row, direction) {
    const s = summaryOf(row.summary), base = { id: row.id, startedAt: row.startedAt, name: row.name || "", sport: row.sport, direction: direction || "same" };
    return s ? { ...base, exact: true, movingS: Number(s.movingS), elapsedS: Number(s.elapsedS), missingS: Number(s.missingS) || 0, distanceM: Number(s.distanceM) || row.distanceM }
      : { ...base, exact: false, activeS: row.durationS, distanceM: row.distanceM };
  }
  /** `outings`: [{ row, direction }] already known to follow the route (the route itself first when it is a recorded outing). */
  function comparison(target, outings) {
    const N = NAV(), all = (outings || []).map((o) => effortOf(o.row, o.direction));
    const c = N.compareEfforts(target.distanceM, all.filter((e) => e.exact));
    return { comparable: c.comparable, excluded: c.excluded, approx: all.filter((e) => !e.exact), best: c.best, note: c.note, criteria: c.criteria, total: all.length };
  }

  const followKey = (owner) => `titan.gps.follow.v1:${owner}`;
  /** What the outing page reads to follow a route: the route itself (3,000 points at most), so it needs no network. */
  function handoff(route, id, at) {
    const N = NAV();
    return { id: id === null || id === undefined ? null : String(id), route: N.fit(route), at: Number.isFinite(at) ? at : Date.now() };
  }

  /** Why the server refused a save, in words. */
  function saveError(message) {
    const m = String(message || "");
    if (/ROUTE_LIMIT/.test(m)) return "Ta bibliothèque est pleine (200 parcours). Supprime-en un pour enregistrer celui-ci.";
    if (/SPORT_UNKNOWN/.test(m)) return "Ce sport n’est pas reconnu par le serveur. Choisis-en un autre.";
    if (/TRACK_TOO_LARGE|BAD_TRACK/.test(m)) return "Cette trace n’a pas été acceptée par le serveur (trop lourde ou illisible).";
    if (/RATE|TOO_MANY/i.test(m)) return "Trop d’enregistrements en peu de temps. Réessaie dans quelques minutes.";
    if (/BAD_NAME/.test(m)) return "Ce nom est trop long.";
    return "L’enregistrement n’a pas abouti. Réessaie dans un instant.";
  }

  const api = { decode, project, gpx, trimEnds, SHARE_TRIM_M, ORIGINS, MAX_OFFLINE, CANDIDATES_MAX, missing, unreachable, cleanName, normalize, clientRouteId, digestOf, saveArgs, v1Args, offlineStore, candidates, effortOf, comparison, followKey, handoff, saveError };
  root.TitanRoutes = Object.assign(root.TitanRoutes || {}, api);
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;

  /* ---------------- UI (browser only) ---------------- */
  const esc = (s) => (window.titanEsc ? window.titanEsc(s) : String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]));
  const icon = (n, c) => (window.titanIcon ? window.titanIcon(n, c) : "");
  const flag = (k) => window.titanFlags?.enabled?.(k, false) === true;
  const enabled = () => flag("screens.routes");
  const gpsEnabled = () => flag("screens.gps");
  const context = () => ({ owner: window.state?.user?.id || null, client: window.titanClient || null, epoch: window.titanAccountTransition?.epoch });
  const isGuest = (owner) => String(owner || "").startsWith("guest_");
  const same = (a, b) => a && b && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active && a.owner && !isGuest(a.owner);
  /** The same account is still in front of the screen (a discovery account counts: what it keeps lives in this browser). */
  const alive = (a) => { const b = context(); return !!a && !!a.owner && a.owner === b.owner && a.client === b.client && a.epoch === b.epoch && !window.titanAccountTransition?.active; };
  const online = () => navigator.onLine !== false;
  const km = (m) => (window.TitanFormat?.distance ? window.TitanFormat.distance(m / 1000) : `${(m / 1000).toFixed(2).replace(".", ",")} km`);
  const clock = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
  const when = (iso) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const stamp = (t) => { const d = new Date(t), two = (n) => String(n).padStart(2, "0"); return `${two(d.getDate())}/${two(d.getMonth() + 1)} à ${two(d.getHours())}:${two(d.getMinutes())}`; };
  const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`);
  const store = () => { try { const s = window.localStorage; s.getItem("titan.probe"); return s; } catch { return null; } };

  async function call(ctx, fn, args) {
    if (!same(ctx, context())) throw Error("STALE");
    let r;
    try { r = await ctx.client.rpc(fn, args); } catch (e) { if (!same(ctx, context())) throw Error("STALE"); throw Object.assign(Error("UNREACHABLE"), { unreachable: true }); }
    if (!same(ctx, context())) throw Error("STALE");
    if (r.error) {
      const info = { code: r.error.code || "", status: r.status, message: r.error.message || "" };
      throw Object.assign(Error(r.error.message || "UNAVAILABLE"), { code: info.code, missing: missing(info), unreachable: unreachable(info) });
    }
    return r.data;
  }
  /* A server that answered « unknown function » once is read through v1 for the rest of the page: one refused call, not one per screen. */
  const legacy = new WeakSet();
  async function versioned(ctx, fn2, args2, fn1, args1) {
    if (!legacy.has(ctx.client)) {
      try { return { v: 2, data: await call(ctx, fn2, args2) }; } catch (e) { if (!e.missing) throw e; legacy.add(ctx.client); }
    }
    return { v: 1, data: await call(ctx, fn1, args1) };
  }

  /* What this browser keeps beside the server: names and origins for a v1 server, the copies to follow offline. */
  const metaKey = (owner) => `titan.routes.meta.v1:${owner}`;
  const localMeta = (owner) => { try { const v = JSON.parse(store()?.getItem(metaKey(owner)) || "null"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
  function setLocalMeta(owner, id, change) {
    const all = localMeta(owner);
    if (change === null) delete all[id]; else all[id] = { ...(all[id] || {}), ...change };
    try { store()?.setItem(metaKey(owner), JSON.stringify(all)); return true; } catch { return false; }
  }
  const NONE = { list: () => [], bytes: () => 0, declined: () => false, get: () => null, put: () => ({ ok: false, reason: "unavailable" }), remove: () => false, patch: () => false };
  const copies = (owner) => { const s = store(); return s && owner ? offlineStore(s, owner) : NONE; };
  const routeOf = (entry) => (entry ? NAV()?.decode(entry.doc, { name: entry.meta.name, sport: entry.meta.sport, origin: entry.meta.origin }) || null : null);
  const rowOf = (meta) => ({ id: meta.id, sport: meta.sport || null, startedAt: meta.startedAt || new Date(meta.savedAt || Date.now()).toISOString(), distanceM: meta.distanceM || 0, durationS: meta.durationS || 0,
    ascentM: meta.ascentM === undefined ? null : meta.ascentM, points: meta.points || 0, eventId: null, name: meta.name || "", nameLocal: false, origin: ORIGINS[meta.origin] ? meta.origin : "recorded", summary: summaryOf(meta.summary), queued: !!meta.queued, localOnly: String(meta.id).startsWith("local:") && !meta.queued });
  /** Keeps a copy of a library route in this browser (unless the athlete removed that copy on purpose). */
  function keepCopy(owner, r, doc, force) {
    const c = copies(owner);
    if (!doc || (!force && c.declined(r.id))) return { ok: false, reason: "declined" };
    return c.put(r.id, { name: r.name || "", sport: r.sport, origin: r.origin, startedAt: r.startedAt, distanceM: r.distanceM, durationS: r.durationS, ascentM: r.ascentM, points: r.points, summary: r.summary || null }, doc);
  }

  /* ---- Shared pieces of interface (also used by lieux.js and planifier.js, on the journal and on the outing page) ---- */
  function sheet(options) {
    if (window.titanShell?.sheet) return window.titanShell.sheet(options);
    // A page without the shell still gets a real modal dialog.
    const d = document.createElement("dialog");
    d.className = "asc-sheet";
    d.setAttribute("aria-label", options.title || "");
    d.innerHTML = `<div class="asc-sheet-body"><div class="asc-sheet-head"><div class="asc-stack-sm">${options.eyebrow ? `<p class="asc-eyebrow">${esc(options.eyebrow)}</p>` : ""}<h2 class="asc-h2">${esc(options.title || "")}</h2></div><button type="button" class="asc-btn asc-btn-ghost asc-btn-icon" data-close aria-label="Fermer">${icon("close") || "×"}</button></div><div data-sheet-content></div></div>`;
    const content = d.querySelector("[data-sheet-content]");
    if (options.body instanceof Node) content.append(options.body); else content.innerHTML = options.body || "";
    d.querySelector("[data-close]").addEventListener("click", () => d.close());
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    d.addEventListener("close", () => { d.remove(); options.onClose?.(); });
    document.body.append(d);
    d.showModal();
    return d;
  }
  function confirm(options) {
    if (window.titanShell?.confirm) return window.titanShell.confirm(options);
    return new Promise((resolve) => {
      let done = false;
      const body = document.createElement("div");
      body.className = "asc-stack";
      body.innerHTML = `<p>${esc(options.message || "")}</p>${options.detail ? `<p class="asc-small asc-muted">${esc(options.detail)}</p>` : ""}<p class="asc-small" role="alert" data-error></p>
        <div class="asc-confirm-actions"><button type="button" class="asc-btn asc-btn-secondary" data-cancel>Annuler</button><button type="button" class="asc-btn ${options.danger ? "asc-btn-danger" : "asc-btn-primary"}" data-ok>${esc(options.confirmLabel || "Confirmer")}</button></div>`;
      const d = sheet({ title: options.title || "", body, onClose: () => !done && resolve(false) });
      body.querySelector("[data-cancel]").addEventListener("click", () => d.close());
      body.querySelector("[data-ok]").addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        try { if (options.action) await options.action(); done = true; resolve(true); d.close(); }
        catch (error) { body.querySelector("[data-error]").textContent = error?.message || "Action impossible pour le moment."; e.currentTarget.disabled = false; }
      });
    });
  }
  /** Closes a sheet as soon as another account is in front of the screen. */
  function guardSheet(d, ctx) {
    const guard = () => { if (!alive(ctx)) d.close(); };
    const events = ["titan:account-changing", "titan:account-changed"];
    events.forEach((ev) => window.addEventListener(ev, guard));
    d.addEventListener("close", () => events.forEach((ev) => window.removeEventListener(ev, guard)), { once: true });
  }
  /** Asks the browser for the position ONCE, after saying why. Draws the explanation into `host`; resolves { lat, lon, acc } or null
      (cancelled). A refusal or a failure stays on screen in words, with the way out: typing coordinates. */
  function askPosition(host, purpose) {
    return new Promise((resolve) => {
      host.hidden = false;
      host.innerHTML = `<div class="rt-ask" role="group" aria-label="Utiliser ma position"><p class="asc-small">${esc(purpose || "Pour remplir ce point,")} ton navigateur va te demander l’autorisation de lire ta position, une seule fois. TITAN ne te suit pas : la position sert à ce que tu fais ici, puis n’est plus lue.</p>
        <div class="asc-actions"><button type="button" class="asc-btn asc-btn-secondary rt-tap" data-ask-ok>${icon("pin")} Demander ma position</button><button type="button" class="asc-btn asc-btn-ghost rt-tap" data-ask-no>Annuler</button></div>
        <p class="asc-small" role="status" data-ask-status></p></div>`;
      const say = (t) => { const n = host.querySelector("[data-ask-status]"); if (n) n.textContent = t; };
      const end = (value) => { host.innerHTML = ""; host.hidden = true; resolve(value); };
      host.querySelector("[data-ask-no]").addEventListener("click", () => end(null));
      host.querySelector("[data-ask-ok]").addEventListener("click", (e) => {
        if (!navigator.geolocation?.getCurrentPosition) return say("Ce navigateur ne donne pas accès à la position. Saisis des coordonnées à la place.");
        const b = e.currentTarget;
        b.disabled = true;
        say("Recherche de ta position… (20 s au plus)");
        navigator.geolocation.getCurrentPosition(
          (p) => end({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null }),
          (err) => {
            b.disabled = false;
            say(err?.code === 1 ? "Position refusée par le navigateur. Tu peux l’autoriser dans les réglages du site, ou saisir des coordonnées."
              : err?.code === 3 ? "Pas de position après 20 s. Réessaie à ciel ouvert, ou saisis des coordonnées." : "Position indisponible pour le moment. Réessaie, ou saisis des coordonnées.");
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
      });
      host.querySelector("[data-ask-ok]").focus();
    });
  }

  function mapSvg(segs, label) {
    const W = 360, H = 220, p = project(segs, W, H);
    return `<svg class="rt-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet"><rect width="${W}" height="${H}" rx="14" class="rt-map-bg"/>
      ${p.lines.map((l) => `<polyline class="rt-line" fill="none" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${l.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")}"/>`).join("")}
      ${p.start ? `<circle class="rt-start" cx="${p.start.x.toFixed(1)}" cy="${p.start.y.toFixed(1)}" r="7"/>` : ""}${p.end ? `<circle class="rt-end" cx="${p.end.x.toFixed(1)}" cy="${p.end.y.toFixed(1)}" r="7"/>` : ""}</svg>
      <p class="asc-small asc-faint rt-legend"><span class="rt-dot rt-start"></span> départ · <span class="rt-dot rt-end"></span> arrivée · tracé seul, aucun serveur de cartes n’est contacté</p>`;
  }
  /** The drawing of a route to follow: thinned to what a small picture can show. */
  const routeMap = (route, label) => mapSvg(NAV().fit(route, 700).segs, label);
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const SP = () => window.TitanSports;
  const sportLabel = (s) => SP()?.label?.(s) || s || "Sport";
  const titleOf = (r) => r.name || `${sportLabel(r.sport)} · ${r.startedAt ? when(r.startedAt) : "sans date"}`;
  const routeBody = (r, segs) => `<div class="rt-detail">${mapSvg(segs, `Trace de ${km(r.distanceM)}`)}
    <dl class="moment-metrics"><div><dt>Distance</dt><dd class="asc-num">${esc(km(r.distanceM))}</dd></div><div><dt>Temps actif</dt><dd class="asc-num">${esc(clock(r.durationS))}</dd></div>
      <div><dt>Dénivelé positif</dt><dd class="asc-num">${r.ascentM === null || r.ascentM === undefined ? "–" : esc(r.ascentM + " m")}</dd></div></dl>
    <div class="asc-actions"><button type="button" class="asc-btn asc-btn-secondary" data-rt-gpx>${icon("download")} Télécharger en GPX</button>
      <button type="button" class="asc-btn asc-btn-secondary" data-rt-share>${icon("share")} GPX à partager</button>
      <button type="button" class="asc-btn asc-btn-ghost" data-rt-del>Supprimer ce parcours</button></div>
    <p class="asc-small asc-faint">Le GPX à partager n’a ni heure ni altitude, et ses 300 premiers et derniers mètres sont retirés pour ne pas révéler ton point de départ. Rien n’est publié par TITAN. <span data-rt-status role="status"></span></p></div>`;

  function wireDownloads(host, r, segs, status) {
    const day = new Date(r.startedAt || Date.now()).toISOString().slice(0, 10);
    const label = r.name || `${sportLabel(r.sport)} ${day}`;
    const timed = segs.some((s) => s.some((f) => f.t > 86400000));
    host.querySelector("[data-rt-gpx]")?.addEventListener("click", () => download(`titan-${r.sport}-${day}.gpx`, gpx(segs, label, { time: timed })));
    host.querySelector("[data-rt-share]")?.addEventListener("click", () => {
      const t = trimEnds(segs);
      if (!t) return status("Parcours trop court : impossible de masquer le début et la fin sans révéler d’où tu pars. Il reste privé.");
      download(`titan-parcours-${day}.gpx`, gpx(t, sportLabel(r.sport), { time: false, ele: false }));
    });
  }
  function wire(host, r, segs, ctx, onDeleted) {
    const status = (t) => { const n = host.querySelector("[data-rt-status]"); if (n) n.textContent = t || ""; };
    wireDownloads(host, r, segs, status);
    host.querySelector("[data-rt-del]")?.addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await call(ctx, "titan_route_delete_v1", { p_id: r.id }); onDeleted?.(); } catch (err) { b.disabled = false; if (err.message !== "STALE") status("Suppression impossible pour le moment."); }
    });
  }

  /** Inside a session's detail: the map of the route linked to it (nothing at all when it has none or the feature is off).
      Resolves { meta, segs, timed } when a route was drawn, else null: the journal uses it to offer the detail of the GPS bilan. */
  async function mountForSession(slot, log) {
    if (!slot || !(enabled() || gpsEnabled()) || !log?.client_event_id) return null;
    const ctx = context();
    if (!same(ctx, context())) return null;
    try {
      const meta = await call(ctx, "titan_route_for_event_v1", { p_event_id: log.client_event_id });
      if (!meta) return null;
      const full = gpsEnabled() ? (await versioned(ctx, "titan_route_get_v2", { p_id: meta.id }, "titan_route_get_v1", { p_id: meta.id })).data : await call(ctx, "titan_route_get_v1", { p_id: meta.id });
      if (!slot.isConnected || !same(ctx, context())) return null;
      const segs = decode(full.track);
      if (!segs.length) return null;
      const r = gpsEnabled() ? normalize({ ...meta, ...full }, localMeta(ctx.owner)) : { ...meta };
      slot.innerHTML = `<section class="jr-detail-block"><p class="asc-eyebrow">Parcours</p>${routeBody(r, segs)}</section>`;
      if (gpsEnabled()) {
        slot.querySelector("[data-rt-del]")?.remove(); // a route is removed from the library, where the question is asked first
        slot.querySelector(".asc-actions")?.insertAdjacentHTML("afterbegin", `<button type="button" class="asc-btn asc-btn-secondary" data-rt-library>${icon("route")} Ouvrir dans Mes parcours</button>`);
        slot.querySelector("[data-rt-library]")?.addEventListener("click", () => openLibrary({ routeId: r.id }));
        keepCopy(ctx.owner, r, full.track);
      }
      wire(slot, r, segs, ctx, () => { slot.innerHTML = ""; });
      return { meta: r, segs, timed: segs.some((s) => s.some((f, i) => i > 0 && f.t > s[0].t)) };
    } catch { return null; /* a server without the function, or a changed account: no map, no noise */ }
  }

  /* The library as it was before V1.7.7 (screens.gps off): a list, a map, two downloads, a deletion. Kept unchanged. */
  async function openLegacy() {
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

  /* ---- Saving (one path for a file, a planned line and a recording) ---- */
  const inFlight = new Map();
  /** Saves a route in the library. Resolves { ok, id, created?, local?, queued?, nameLocal?, error? } and never throws.
      - no network: the route is kept in this browser and sent when the connection is back (`queued`);
      - a discovery account: kept in this browser only (`local`), nothing to send;
      - a server that only knows v1: saved, the name kept here (`nameLocal`).
      The same route asked twice at once (a double tap) is one request. */
  function saveRoute(ctx, route, options) {
    const spec = saveArgs(route, options);
    if (!spec.ok) return Promise.resolve({ ok: false, error: spec.error });
    if (!alive(ctx)) return Promise.resolve({ ok: false, error: "Le compte a changé : rien n’a été enregistré." });
    const key = `${ctx.owner}:${spec.clientRouteId}`;
    if (inFlight.has(key)) return inFlight.get(key);
    const run = doSave(ctx, spec).catch(() => ({ ok: false, error: "L’enregistrement n’a pas abouti. Réessaie dans un instant." })).finally(() => inFlight.delete(key));
    inFlight.set(key, run);
    return run;
  }
  function keepLocal(ctx, spec, queued) {
    const id = `local:${spec.clientRouteId}`;
    const kept = copies(ctx.owner).put(id, { ...spec.meta, queued, clientRouteId: spec.clientRouteId, eventId: spec.eventId }, spec.v2.p_track);
    return kept.ok ? { ok: true, id, local: true, queued } : { ok: false, error: "Le stockage de ce navigateur est plein : ce parcours n’a pas pu être gardé sur cet appareil." };
  }
  async function doSave(ctx, spec) {
    if (isGuest(ctx.owner) || !ctx.client?.rpc) return keepLocal(ctx, spec, false);
    if (!online()) return keepLocal(ctx, spec, true);
    try {
      const { v, data } = await versioned(ctx, "titan_route_save_v2", spec.v2, "titan_route_save_v1", spec.v1);
      if (!data?.id) return { ok: false, error: saveError("") };
      const id = String(data.id), nameLocal = v === 1;
      if (nameLocal) setLocalMeta(ctx.owner, id, { name: spec.meta.name, origin: spec.meta.origin, summary: spec.meta.summary });
      copies(ctx.owner).remove(`local:${spec.clientRouteId}`);
      keepCopy(ctx.owner, { ...spec.meta, id }, spec.v2.p_track, true);
      if (spec.eventId) { try { await call(ctx, "titan_route_link_v1", { p_client_route_id: spec.clientRouteId, p_event_id: spec.eventId }); } catch { /* the route is saved; the link to its session is retried by nobody: it only adds the map to the journal */ } }
      return { ok: true, id, created: data.created !== false, nameLocal: nameLocal && !!spec.meta.name };
    } catch (e) {
      if (e.message === "STALE") return { ok: false, error: "Le compte a changé : rien n’a été enregistré." };
      if (e.unreachable) return keepLocal(ctx, spec, true);
      return { ok: false, error: saveError(e.message) };
    }
  }
  /** Sends what was kept while offline. One at a time; a refusal by the server leaves the route here, marked, rather than losing it. */
  let flushing = false;
  async function flush(ctx) {
    if (flushing || !online() || !same(ctx, context())) return 0;
    flushing = true;
    let sent = 0;
    try {
      const c = copies(ctx.owner);
      for (const meta of c.list().filter((m) => m.queued && !m.refused)) {
        const entry = c.get(meta.id);
        if (!entry) { c.remove(meta.id); continue; }
        const v1 = { p_client_route_id: meta.clientRouteId, p_sport: meta.sport, p_started_at: meta.startedAt, p_distance_m: meta.distanceM, p_duration_s: meta.durationS, p_ascent_m: meta.ascentM, p_track: entry.doc };
        try {
          const { v, data } = await versioned(ctx, "titan_route_save_v2", { ...v1, p_name: meta.name || null, p_origin: meta.origin, p_summary: summaryOf(meta.summary) }, "titan_route_save_v1", v1);
          if (!data?.id) continue;
          const id = String(data.id);
          if (v === 1) setLocalMeta(ctx.owner, id, { name: meta.name, origin: meta.origin, summary: meta.summary });
          c.remove(meta.id);
          keepCopy(ctx.owner, { ...meta, id, queued: undefined }, entry.doc, true);
          if (meta.eventId) { try { await call(ctx, "titan_route_link_v1", { p_client_route_id: meta.clientRouteId, p_event_id: meta.eventId }); } catch { /* see doSave */ } }
          sent++;
        } catch (e) {
          if (e.message === "STALE" || e.unreachable) break;
          c.patch(meta.id, { refused: saveError(e.message) });
        }
      }
    } finally { flushing = false; }
    if (sent) window.dispatchEvent(new CustomEvent("titan:routes-updated"));
    return sent;
  }
  window.addEventListener("online", () => { const ctx = context(); if (gpsEnabled() && same(ctx, context())) flush(ctx); });

  /** Called by the outing page once the session is saved: the recorded trace enters the library (origin « recorded ») with the engine's
      digest as its summary. Resolves { ok, id, local? } and never throws; a retry of the same recording never makes a second route. */
  function saveRecorded(recording, analysis, name) {
    const N = NAV(), E = ENG();
    if (!N || !E || !recording || !Array.isArray(recording.segs)) return Promise.resolve({ ok: false, error: "Le module GPS n’est pas chargé sur cette page." });
    const route = N.fromFixes(recording.segs, { sport: recording.sport, name: cleanName(name) });
    if (!route) return Promise.resolve({ ok: false, error: "Cette sortie n’a pas assez de positions pour faire un parcours." });
    const a = analysis || E.analyse(recording);
    const startedAt = Number.isFinite(recording.startedAt) ? recording.startedAt : a.start;
    return saveRoute(context(), route, { origin: "recorded", sport: recording.sport, name, startedAt, distanceM: a.distanceM, durationS: Number.isFinite(a.effortS) ? a.effortS : a.movingS, ascentM: a.ascentM,
      summary: E.digest(a), eventId: recording.eventId || recording.clientEventId || null, clientRouteId: clientRouteId("recorded", startedAt, recording.sport) });
  }

  /** Writes the hand-off the outing page reads, then goes there. Returns false (and says why through `say`) when it cannot. */
  function follow(ctx, route, id, say, onFollow) {
    if (!alive(ctx)) return false;
    const payload = handoff(route, id, Date.now());
    try { window.localStorage.setItem(followKey(ctx.owner), JSON.stringify(payload)); }
    catch { say?.("Le stockage de ce navigateur est plein ou bloqué : le parcours n’a pas pu être transmis à la page de sortie."); return false; }
    if (typeof onFollow === "function") onFollow(payload); else window.location.assign("/sortie");
    return true;
  }

  /* ---- The library (screens.gps) ---- */
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const chip = (r) => `<span class="asc-chip rt-origin" data-origin="${esc(r.origin)}">${esc(ORIGINS[r.origin] || ORIGINS.recorded)}</span>`;
  const gpsSports = () => (ENG()?.GPS_SPORTS || []).map((id) => [id, sportLabel(id)]).sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const lastGpsSport = () => { const E = ENG(); return (window.state?.history || []).map((l) => l.sport).find((s) => E?.isGpsSport(s)) || "hiking"; };

  async function openLibrary(options) {
    const o = options || {};
    if (!enabled() && !gpsEnabled()) return null;
    // Without the flag — or on a page that did not load the GPS modules — the library is the one from before, when it is open at all.
    if (!gpsEnabled() || !NAV() || !ENG()) return enabled() && window.titanShell?.sheet ? openLegacy() : null;
    const ctx = context();
    if (!alive(ctx)) return null;
    const guest = isGuest(ctx.owner);
    const body = document.createElement("div");
    body.className = "asc-stack rt-lib";
    const d = sheet({ title: "Mes parcours", eyebrow: "GPS", body });
    guardSheet(d, ctx);
    const S = { rows: [], more: false, offline: false, nameLocal: false, error: "", q: "", flash: o.flash || "", run: 0, pulls: 0, quiet: 0, tracks: new Map() };
    const C = () => copies(ctx.owner);
    const ok = () => alive(ctx) && d.open;
    const say = (t) => { const n = body.querySelector("[data-rt-status]"); if (n) n.textContent = t || ""; };
    let onClick = null, onChange = null, onInput = null;
    // The second tap of a double tap on « Enregistrer » would land on whatever the redrawn sheet puts under the finger: it is ignored.
    body.addEventListener("click", (e) => { if (ok() && Date.now() >= S.quiet) onClick?.(e); });
    body.addEventListener("change", (e) => { if (ok()) onChange?.(e); });
    body.addEventListener("input", (e) => { if (ok()) onInput?.(e); });
    const refresh = () => { if (ok() && body.querySelector("[data-rt-view='list']")) load(); };
    window.addEventListener("titan:routes-updated", refresh);
    d.addEventListener("close", () => { S.run++; window.removeEventListener("titan:routes-updated", refresh); }, { once: true });
    // A new view starts at its top: what was just said (a saved route, a refusal) is never left above the visible part of the sheet.
    const show = (view, html, keep) => { body.innerHTML = `<div class="asc-stack" data-rt-view="${view}">${html}</div>`; if (!keep) body.closest(".asc-sheet-body")?.scrollTo?.(0, 0); };

    /* -- list -- */
    const localRows = () => C().list().map(rowOf);
    /** Reads one page of the library into S (the first one, or the page before `before`). True when S was brought up to date. */
    async function pull(before) {
      const token = ++S.pulls;
      if (!before) { S.error = ""; S.offline = false; }
      if (guest) { S.rows = localRows(); S.more = false; return true; }
      if (!online()) { S.offline = true; S.rows = localRows(); S.more = false; return true; }
      try {
        const args = { p_limit: 100, ...(before ? { p_before: before } : {}) };
        const { v, data } = await versioned(ctx, "titan_routes_v2", args, "titan_routes_v1", args);
        if (token !== S.pulls || !ok()) return false;
        const mine = localMeta(ctx.owner), page = (Array.isArray(data) ? data : []).map((r) => normalize(r, mine)).filter(Boolean);
        S.nameLocal = v === 1;
        S.more = page.length >= 100;
        S.rows = before ? [...S.rows, ...page] : [...localRows().filter((r) => r.queued), ...page];
        return true;
      } catch (e) {
        if (token !== S.pulls || !ok() || e.message === "STALE") return false;
        if (e.unreachable) { S.offline = true; S.rows = localRows(); S.more = false; } else S.error = "Les parcours ne sont pas disponibles pour le moment.";
        return true;
      }
    }
    async function load(before) {
      const view = ++S.run;
      if (!(await pull(before)) || view !== S.run) return;
      list(!!before);
      if (!before && !S.offline && S.rows.some((r) => r.queued)) flush(ctx);
    }
    const rowHtml = (r) => `<li><button type="button" class="rt-row" data-rt-open="${esc(r.id)}"><span class="rt-row-top"><strong class="rt-row-name">${esc(titleOf(r))}</strong>${chip(r)}${r.queued ? '<span class="asc-chip warn">En attente d’envoi</span>' : r.localOnly ? '<span class="asc-chip">Sur cet appareil</span>' : ""}</span>
      <span class="asc-small asc-muted rt-row-sub">${esc([r.name ? sportLabel(r.sport) : "", r.name && r.startedAt ? when(r.startedAt) : "", km(r.distanceM), r.ascentM === null ? "" : `D+ ${r.ascentM} m`].filter(Boolean).join(" · "))}</span></button></li>`;
    function listItems() {
      const q = norm(S.q), rows = q ? S.rows.filter((r) => norm(titleOf(r)).includes(q)) : S.rows;
      if (!S.rows.length) return `<p class="asc-small asc-muted" data-rt-empty>${S.offline ? "Aucun parcours gardé sur cet appareil pour l’instant. Ceux que tu ouvres, importes ou enregistres en ligne y seront copiés." : guest ? "Aucun parcours sur cet appareil pour le moment. Importe un GPX pour le suivre." : "Aucun parcours pour le moment. Importe un GPX, crée un parcours, ou enregistre une sortie avec le GPS."}</p>`;
      if (!rows.length) return `<p class="asc-small asc-muted" data-rt-empty>Aucun parcours ne porte ce nom.</p>`;
      return `<ul class="rt-list">${rows.map(rowHtml).join("")}</ul>`;
    }
    function list(keep) {
      const notes = [
        S.flash ? `<p class="asc-note" role="status" data-rt-flash>${icon("check")}<span>${esc(S.flash)}</span></p>` : "",
        guest ? `<p class="asc-note" data-rt-guest>${icon("info")}<span>Mes parcours demande un compte : la bibliothèque est gardée sur ton compte TITAN. En mode découverte, un parcours importé reste sur cet appareil seulement, sans sauvegarde ni synchronisation.</span></p>` : "",
        S.offline ? `<p class="asc-note warn" data-rt-offline-note>${icon("offline")}<span>Hors ligne : parcours gardés sur cet appareil</span></p>` : "",
        S.error ? `<p class="asc-note err">${icon("alert")}<span>${esc(S.error)}</span><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm rt-tap" data-rt-retry>Réessayer</button></p>` : "",
        S.nameLocal && !S.offline ? `<p class="asc-small asc-faint" data-rt-v1>Le serveur n’a pas encore la mise à jour des parcours : les noms que tu donnes restent sur cet appareil en attendant.</p>` : "",
      ].join("");
      S.flash = "";
      show("list", `<p class="asc-small asc-muted">Tes parcours enregistrés, importés ou planifiés. Privés : jamais partagés ni publiés.</p>
        <div class="rt-tools"><button type="button" class="asc-btn asc-btn-secondary rt-tap" data-rt-import>${icon("upload")}<span>Importer un GPX</span></button>
          <button type="button" class="asc-btn asc-btn-secondary rt-tap" data-rt-plan>${icon("route")}<span>Créer un parcours</span></button>
          <button type="button" class="asc-btn asc-btn-secondary rt-tap" data-rt-places>${icon("pin")}<span>Mes points</span></button>
          <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" data-rt-file hidden aria-label="Fichier GPX à importer" /></div>
        ${notes}<p class="asc-small" role="status" data-rt-status></p>
        ${S.rows.length > 1 ? `<label class="asc-field rt-search"><span>Chercher par nom</span><input type="search" class="asc-input" data-rt-q value="${esc(S.q)}" autocomplete="off" enterkeyhint="search" /></label>` : ""}
        <div data-rt-items>${listItems()}</div>
        ${S.more ? `<button type="button" class="asc-btn asc-btn-ghost rt-tap" data-rt-more>Afficher les parcours plus anciens</button>` : ""}`, keep);
      onInput = (e) => { if (e.target.matches("[data-rt-q]")) { S.q = e.target.value; body.querySelector("[data-rt-items]").innerHTML = listItems(); } };
      onChange = (e) => { if (e.target.matches("[data-rt-file]")) pick(e.target); };
      onClick = (e) => {
        const t = e.target;
        const id = t.closest("[data-rt-open]")?.dataset.rtOpen;
        if (id) return detail(id);
        if (t.closest("[data-rt-retry]")) return load();
        if (t.closest("[data-rt-more]")) return load(S.rows[S.rows.length - 1]?.startedAt);
        if (t.closest("[data-rt-import]")) {
          if (!window.TitanGpx?.analyse) return say("L’import GPX n’est pas disponible sur cette page (lecteur de fichiers non chargé).");
          return body.querySelector("[data-rt-file]").click();
        }
        if (t.closest("[data-rt-plan]")) return window.TitanPlanner?.open ? window.TitanPlanner.open({ fromLibrary: true, onSaved: (r) => { S.flash = r?.message || "Parcours enregistré dans Mes parcours."; if (ok()) load(); }, onFollow: o.onFollow }) : say("La planification n’est pas chargée sur cette page.");
        if (t.closest("[data-rt-places]")) return window.TitanPlaces?.open ? window.TitanPlaces.open() : say("Mes points n’est pas chargé sur cette page.");
      };
    }

    /* -- import -- */
    async function pick(input) {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) return say("Le GPX doit faire moins de 15 Mo.");
      say("Lecture du fichier…");
      let text = "";
      try { text = await file.text(); } catch { return ok() && say("Ce fichier n’a pas pu être lu."); }
      if (!ok()) return;
      await new Promise((r) => setTimeout(r, 30)); // lets « Lecture du fichier… » be painted before a long file is parsed
      if (!ok()) return;
      const read = NAV().importGpx(text, window.TitanGpx);
      if (!read.ok) return say(read.error);
      preview(read, file.name);
    }
    function preview(read, fileName) {
      const route = read.route, f = read.facts, sports = gpsSports(), sport = lastGpsSport();
      const stored = NAV().fit(route), name = cleanName(route.name || String(fileName || "").replace(/\.gpx$/i, ""));
      show("import", `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm rt-tap rt-back" data-rt-back>← Mes parcours</button>
        <h3 class="asc-h3" tabindex="-1" data-rt-focus>Aperçu de l’import</h3>
        ${routeMap(route, `Trace importée de ${km(route.distanceM)}`)}
        <dl class="jr-kv rt-facts"><div><dt>Distance</dt><dd class="asc-num">${esc(km(route.distanceM))}</dd></div>
          <div><dt>Dénivelé positif</dt><dd class="asc-num">${route.ascentM === null ? "–" : esc(`${route.ascentM} m`)}</dd></div>
          <div><dt>Points lus</dt><dd class="asc-num">${esc(String(f.points))}</dd></div><div><dt>Points ignorés</dt><dd class="asc-num">${esc(String(f.ignoredPoints || 0))}</dd></div>
          <div><dt>Tronçons</dt><dd class="asc-num">${esc(String(f.segments))}</dd></div></dl>
        <ul class="asc-small asc-muted rt-notes">
          ${route.ascentM === null ? "<li>Dénivelé : ce fichier ne donne pas une altitude sur chaque point, aucun chiffre n’est calculé.</li>" : "<li>Dénivelé calculé sur les altitudes du fichier, non vérifiées.</li>"}
          ${f.cut > 0 ? "<li>Le fichier contient des sauts de plus de 5 km : la trace est coupée à ces endroits, jamais reliée par une ligne inventée.</li>" : ""}
          ${stored.points < route.points ? `<li>Trace allégée de ${route.points} à ${stored.points} points pour être gardée (la forme est conservée).</li>` : ""}
          <li>Un fichier importé est un tracé à suivre : il ne compte pas comme une séance et ne donne aucune récompense.</li></ul>
        <label class="asc-field"><span>Nom du parcours</span><input type="text" class="asc-input" maxlength="80" data-rt-name value="${esc(name)}" autocomplete="off" /></label>
        <label class="asc-field"><span>Sport</span><select data-rt-sport>${sports.map(([id, label]) => `<option value="${esc(id)}"${id === sport ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
        <div class="asc-actions rt-actions"><button type="button" class="asc-btn asc-btn-primary rt-tap" data-rt-save>${guest ? "Garder sur cet appareil" : "Enregistrer dans Mes parcours"}</button>
          <button type="button" class="asc-btn asc-btn-secondary rt-tap" data-rt-follow-now>${icon("play")} Suivre maintenant</button>
          <button type="button" class="asc-btn asc-btn-ghost rt-tap" data-rt-back>Annuler</button></div>
        <p class="asc-small" role="status" data-rt-status></p>`);
      body.querySelector("[data-rt-focus]")?.focus();
      const form = () => ({ name: cleanName(body.querySelector("[data-rt-name]").value), sport: body.querySelector("[data-rt-sport]").value });
      onChange = onInput = null;
      onClick = async (e) => {
        const t = e.target;
        if (t.closest("[data-rt-back]")) return list();
        if (t.closest("[data-rt-follow-now]")) { const v = form(); return follow(ctx, { ...route, name: v.name, sport: v.sport }, null, say, o.onFollow); }
        const b = t.closest("[data-rt-save]");
        if (!b || b.disabled) return;
        const v = form();
        b.disabled = true;
        S.quiet = Date.now() + 450; // the second tap of a double tap, whatever is under the finger by then
        say("Enregistrement…");
        const r = await saveRoute(ctx, { ...route, name: v.name, sport: v.sport }, { origin: "imported", sport: v.sport, name: v.name });
        if (!ok()) return;
        if (!r.ok) { b.disabled = false; return say(r.error); }
        S.flash = saved(r, v.name);
        load();
      };
    }
    const saved = (r, name) => r.queued ? "Hors ligne : parcours gardé sur cet appareil. Il partira vers ta bibliothèque au retour du réseau."
      : r.local ? "Parcours gardé sur cet appareil seulement (mode découverte)."
      : r.created === false ? "Ce parcours est déjà dans ta bibliothèque : rien n’a été ajouté."
      : r.nameLocal && name ? "Parcours enregistré. Nom gardé sur cet appareil : ta bibliothèque en ligne ne prend pas encore les noms." : "Parcours enregistré dans Mes parcours.";

    /* -- detail -- */
    /** One route with its trace. `known` (a row of the list) lets a copy kept in this browser answer without a request. */
    async function fetchRoute(id, known) {
      if (S.tracks.has(id)) return S.tracks.get(id);
      const local = () => { const entry = C().get(id); return entry ? { r: known || rowOf(entry.meta), doc: entry.doc, fromCopy: true } : null; };
      let out = null;
      if (known || String(id).startsWith("local:") || guest || !online()) out = local();
      if (!out && !String(id).startsWith("local:") && !guest && online()) {
        try {
          const { data } = await versioned(ctx, "titan_route_get_v2", { p_id: id }, "titan_route_get_v1", { p_id: id });
          const r = normalize(data, localMeta(ctx.owner));
          out = r && r.track ? { r, doc: r.track, fromCopy: false } : null;
        } catch (e) { if (e.message === "STALE") throw e; out = e.unreachable ? local() : null; }
      }
      if (out) { out.route = NAV().decode(out.doc, { name: out.r.name, sport: out.r.sport, origin: out.r.origin }); if (!out.route) out = null; }
      if (out && !known) S.tracks.set(id, out);
      return out;
    }
    function copyHtml(r) {
      const meta = C().list().find((m) => m.id === r.id);
      return `<p class="asc-eyebrow">Copie hors ligne</p>${meta
        ? `<p class="asc-small" data-rt-copy-state="kept">Copie sur cet appareil : ${esc(size(meta.bytes || 0))}, gardée le ${esc(stamp(meta.savedAt))}.</p>${r.queued || r.localOnly ? "" : `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm rt-tap" data-rt-copy-del>Supprimer la copie</button>`}`
        : `<p class="asc-small" data-rt-copy-state="none">Pas de copie hors ligne sur cet appareil : ce parcours demande une connexion pour être ouvert.</p><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm rt-tap" data-rt-copy-add>Garder une copie hors ligne</button>`}
        <p class="asc-small asc-faint">Une copie hors ligne contient la trace, pas un fond de carte. ${esc(String(C().list().length))} parcours gardés ici (${esc(size(C().bytes()))}), les ${MAX_OFFLINE} ouverts le plus récemment au plus.</p>`;
    }
    async function detail(id, note) {
      const run = ++S.run;
      show("detail", '<div class="asc-skeleton" style="height:120px"></div>');
      let got = null;
      try { got = await fetchRoute(id); } catch { return; }
      if (run !== S.run || !ok()) return;
      if (!got) {
        show("detail", `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm rt-tap rt-back" data-rt-back>← Mes parcours</button><p class="asc-note err">${icon("alert")}<span>${online() ? "Ce parcours n’a pas pu être ouvert." : "Hors ligne : ce parcours n’a pas de copie sur cet appareil."}</span></p>`);
        onClick = (e) => { if (e.target.closest("[data-rt-back]")) list(); };
        return;
      }
      const { r, doc, route } = got, segs = decode(doc), E = ENG(), s = r.summary;
      const refused = r.queued ? C().list().find((m) => m.id === r.id)?.refused || "" : "";
      if (!got.fromCopy) keepCopy(ctx.owner, r, doc);
      const figures = [["Distance", km(r.distanceM)],
        ...(r.origin === "recorded" ? (s ? [["En mouvement", E.clock(s.movingS)], ["Temps total", E.clock(s.elapsedS)], ["À l’arrêt", E.clock(s.stoppedS || 0)]] : [["Temps actif", clock(r.durationS)]]) : []),
        ["Dénivelé positif", r.ascentM === null ? "–" : `${r.ascentM} m`]];
      show("detail", `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm rt-tap rt-back" data-rt-back>← Mes parcours</button>
        <div class="rt-detail">
          <div class="rt-head"><h3 class="asc-h3 rt-name" tabindex="-1" data-rt-title>${esc(titleOf(r))}</h3>${chip(r)}</div>
          <p class="asc-small asc-muted">${esc([sportLabel(r.sport), r.startedAt ? when(r.startedAt) : "", r.queued ? "en attente d’envoi" : r.localOnly ? "sur cet appareil seulement" : ""].filter(Boolean).join(" · "))}${r.nameLocal ? ' · <span data-rt-name-local>nom gardé sur cet appareil</span>' : ""}</p>
          ${got.fromCopy && !r.queued && !r.localOnly ? `<p class="asc-note warn">${icon("offline")}<span>Hors ligne : affiché depuis la copie gardée sur cet appareil.</span></p>` : ""}
          ${refused ? `<p class="asc-note err">${icon("alert")}<span>${esc(refused)} Il reste sur cet appareil.</span></p>` : ""}
          ${mapSvg(NAV().fit(route, 700).segs, `Trace de ${km(r.distanceM)}`)}
          <dl class="moment-metrics">${figures.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="asc-num">${esc(v)}</dd></div>`).join("")}</dl>
          ${r.origin === "recorded" && !s ? '<p class="asc-small asc-faint">Sortie enregistrée avant le détail des arrêts : seul le temps actif (arrêts compris) est connu.</p>' : ""}
          ${r.origin !== "recorded" ? '<p class="asc-small asc-faint">Tracé à suivre : il ne porte ni durée ni effort.</p>' : ""}
          <div class="asc-actions rt-actions"><button type="button" class="asc-btn asc-btn-primary rt-tap" data-rt-follow>${icon("play")} Suivre ce parcours</button>
            ${r.queued || r.localOnly ? "" : `<button type="button" class="asc-btn asc-btn-secondary rt-tap" data-rt-rename>${icon("edit")} Renommer</button>`}
            ${guest || r.queued ? "" : `<button type="button" class="asc-btn asc-btn-secondary rt-tap rt-wrap" data-rt-compare>${icon("swap")} Comparer mes sorties sur ce parcours</button>`}</div>
          <p class="asc-small asc-faint">Suivre un parcours est une indication : TITAN ne connaît ni l’état du chemin ni la circulation.</p>
          <div data-rt-rename-slot></div>
          <section class="rt-copy" data-rt-copy>${copyHtml(r)}</section>
          <div class="asc-actions rt-actions"><button type="button" class="asc-btn asc-btn-secondary rt-tap" data-rt-gpx>${icon("download")} Télécharger en GPX</button>
            <button type="button" class="asc-btn asc-btn-secondary rt-tap" data-rt-share>${icon("share")} GPX à partager</button>
            <button type="button" class="asc-btn asc-btn-ghost rt-tap" data-rt-del>${icon("trash")} Supprimer</button></div>
          <p class="asc-small asc-faint">Le GPX à partager n’a ni heure ni altitude, et ses 300 premiers et derniers mètres sont retirés pour ne pas révéler ton point de départ. Rien n’est publié par TITAN.</p>
          <p class="asc-small" role="status" data-rt-status>${esc(note || "")}</p></div>`);
      body.querySelector("[data-rt-title]")?.focus();
      wireDownloads(body, r, segs, say);
      onChange = onInput = null;
      onClick = async (e) => {
        const t = e.target;
        if (t.closest("[data-rt-back]")) return list();
        if (t.closest("[data-rt-follow]")) return follow(ctx, route, r.id, say, o.onFollow);
        if (t.closest("[data-rt-compare]")) return compare(got);
        if (t.closest("[data-rt-copy-del]")) { C().remove(r.id, true); body.querySelector("[data-rt-copy]").innerHTML = copyHtml(r); return say("Copie supprimée de cet appareil. Le parcours reste dans ta bibliothèque."); }
        if (t.closest("[data-rt-copy-add]")) {
          const kept = keepCopy(ctx.owner, r, doc, true);
          body.querySelector("[data-rt-copy]").innerHTML = copyHtml(r);
          return say(kept.ok ? "Copie gardée sur cet appareil." : "Copie impossible : le stockage de ce navigateur est plein. Supprime d’autres copies, puis réessaie.");
        }
        if (t.closest("[data-rt-rename]")) return renameForm(got);
        if (t.closest("[data-rt-del]")) return remove(r);
      };
    }
    function renameForm(got) {
      const r = got.r, slot = body.querySelector("[data-rt-rename-slot]");
      slot.innerHTML = `<form class="rt-rename asc-stack-sm" data-rt-rename-form novalidate><label class="asc-field"><span>Nom du parcours</span><input type="text" class="asc-input" maxlength="80" data-rt-new-name value="${esc(r.name)}" autocomplete="off" /></label>
        <div class="asc-actions"><button type="submit" class="asc-btn asc-btn-primary rt-tap">Enregistrer le nom</button><button type="button" class="asc-btn asc-btn-ghost rt-tap" data-rt-rename-cancel>Annuler</button></div></form>`;
      const input = slot.querySelector("[data-rt-new-name]");
      input.focus(); input.select();
      slot.querySelector("[data-rt-rename-cancel]").addEventListener("click", () => { slot.innerHTML = ""; body.querySelector("[data-rt-rename]")?.focus(); });
      slot.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = cleanName(input.value), b = slot.querySelector("[type=submit]");
        if (b.disabled) return;
        b.disabled = true;
        let localOnly = false;
        try { await call(ctx, "titan_route_rename_v1", { p_id: r.id, p_name: name }); setLocalMeta(ctx.owner, r.id, { name: "" }); }
        catch (err) {
          if (!ok() || err.message === "STALE") return;
          if (!err.missing) { b.disabled = false; return say(err.unreachable ? "Hors ligne : le nom sera à changer au retour du réseau." : /BAD_NAME/.test(err.message) ? "Ce nom est trop long." : "Le nom n’a pas pu être changé pour le moment."); }
          localOnly = true;
          if (!setLocalMeta(ctx.owner, r.id, { name })) { b.disabled = false; return say("Le nom n’a pas pu être gardé : le stockage de ce navigateur est plein ou bloqué."); }
        }
        if (!ok()) return;
        const next = { ...r, name, nameLocal: localOnly && !!name };
        S.rows = S.rows.map((x) => (x.id === r.id ? { ...x, name, nameLocal: next.nameLocal } : x));
        S.tracks.set(r.id, { ...got, r: next, route: { ...got.route, name } });
        C().patch(r.id, { name });
        detail(r.id, localOnly ? "Nom gardé sur cet appareil : ta bibliothèque en ligne ne prend pas encore les noms." : name ? "Nom enregistré." : "Nom retiré : le parcours reprend son sport et sa date.");
      });
    }
    async function remove(r) {
      const local = String(r.id).startsWith("local:");
      const done = await confirm({ title: "Supprimer ce parcours ?", message: `« ${titleOf(r)} » sera retiré de ${local ? "cet appareil" : "ta bibliothèque et de cet appareil"}.`,
        detail: local ? "Il n’existe qu’ici : il ne pourra pas être retrouvé." : "La séance du journal liée à ce parcours n’est pas touchée. Cette suppression ne peut pas être annulée.", confirmLabel: "Supprimer", danger: true,
        action: async () => {
          if (!local) {
            try { await call(ctx, "titan_route_delete_v1", { p_id: r.id }); }
            catch (err) { throw Error(err.message === "STALE" ? "Le compte a changé." : err.unreachable ? "Hors ligne : la suppression demande une connexion." : "Suppression impossible pour le moment."); }
          }
          C().remove(r.id); setLocalMeta(ctx.owner, r.id, null); S.tracks.delete(r.id);
        } });
      if (!done || !ok()) return;
      S.flash = "Parcours supprimé.";
      S.rows = S.rows.filter((x) => x.id !== r.id);
      load();
    }

    /* -- comparison -- */
    async function allRows() {
      // The comparison looks at the whole library (200 routes at most), not only at the page on screen.
      let pages = 0;
      if (!S.rows.length && !S.offline) await pull();
      while (S.more && pages++ < 3 && online() && ok()) { if (!(await pull(S.rows[S.rows.length - 1]?.startedAt))) break; }
      return S.rows.filter((r) => !r.queued && !r.localOnly);
    }
    async function compare(got) {
      const target = got.r, N = NAV(), E = ENG(), run = ++S.run;
      const pace = !!window.TitanGpsSession?.layout?.(target.sport)?.pace;
      const speed = (m, s) => { const t = window.TitanGpsSession?.speedText?.(s > 0 ? m / s : null, pace); return t ? `${t.value} ${t.unit}` : s > 0 ? `${((m / s) * 3.6).toFixed(1).replace(".", ",")} km/h` : "–"; };
      show("compare", `<button type="button" class="asc-btn asc-btn-ghost asc-btn-sm rt-tap rt-back" data-rt-back-detail>← ${esc(titleOf(target))}</button>
        <h3 class="asc-h3" tabindex="-1" data-rt-focus>Mes sorties sur ce parcours</h3>
        <p class="asc-small asc-muted">${esc(N.SAME.text)}</p>
        <div class="rt-progress" data-rt-progress><p class="asc-small" role="status" data-rt-status>Recherche des sorties proches…</p></div>
        <div class="asc-stack" data-rt-result></div><div class="asc-stack" data-rt-manual></div>`);
      body.querySelector("[data-rt-focus]")?.focus();
      let stopped = false, shownManual = null;
      onChange = (e) => { if (e.target.matches("[data-rt-with]")) manual(e.target.value); };
      onInput = null;
      onClick = (e) => {
        if (e.target.closest("[data-rt-back-detail]")) return detail(target.id);
        if (e.target.closest("[data-rt-stop]")) { stopped = true; e.target.closest("[data-rt-stop]").disabled = true; }
      };
      const rows = guest ? [] : await allRows();
      if (run !== S.run || !ok()) return;
      const cands = candidates(target, rows), matches = target.origin === "recorded" ? [{ row: target, direction: "same" }] : [];
      const progress = body.querySelector("[data-rt-progress]");
      let read = 0, other = 0, unread = 0;
      const tell = () => { progress.innerHTML = `<p class="asc-small" role="status" data-rt-status>Lecture des sorties proches : ${read} sur ${cands.length}</p><button type="button" class="asc-btn asc-btn-secondary asc-btn-sm rt-tap" data-rt-stop>Arrêter</button>`; };
      for (const row of cands) {
        if (stopped) break;
        tell();
        let c = null;
        try { c = await fetchRoute(row.id, row); } catch { return; }
        if (run !== S.run || !ok()) return;
        read++;
        if (!c) { unread++; continue; }
        const sameAs = N.sameRoute(got.route, c.route);
        if (sameAs.match) matches.push({ row: c.r, direction: sameAs.direction === "reverse" ? "reverse" : "same" }); else other++;
      }
      const result = comparison(target, matches), others = matches.length - (target.origin === "recorded" ? 1 : 0);
      progress.innerHTML = `<p class="asc-small asc-muted" role="status" data-rt-status>${stopped ? `Recherche arrêtée : ${read} sortie${read > 1 ? "s" : ""} lue${read > 1 ? "s" : ""} sur ${cands.length}.` : cands.length ? `${cands.length} sortie${cands.length > 1 ? "s" : ""} proche${cands.length > 1 ? "s" : ""} en distance lue${cands.length > 1 ? "s" : ""}.` : "Aucune autre sortie de la même famille de sport à moins de 10 % de cette distance."}${unread ? ` ${unread} n’ont pas pu être lues${online() ? "" : " hors ligne"}.` : ""}</p>`;
      const line = (e2, extra) => `<li><span class="rt-cmp-date">${esc(e2.startedAt ? when(e2.startedAt) : "Sans date")}${e2.id === target.id ? " · cette sortie" : ""}</span><span class="rt-cmp-figures asc-num">${extra}</span></li>`;
      const parts = [];
      if (!others) parts.push(`<p class="asc-note" data-rt-none>${icon("info")}<span>Aucune autre sortie sur ce parcours</span></p>`);
      if (result.comparable.length) parts.push(`<section class="rt-cmp" data-rt-comparable><p class="asc-eyebrow">Sorties comparables · temps en mouvement</p>
        <ol class="rt-cmp-list">${result.comparable.map((e2, i) => line(e2, `${esc(E.clock(e2.movingS))} · ${esc(km(e2.distanceM))} · ${esc(speed(e2.distanceM, e2.movingS))}${result.best && i === 0 ? ' <span class="asc-chip am" data-rt-best>Meilleur temps</span>' : ""}`)).join("")}</ol>
        <p class="asc-small asc-faint">${esc(result.note)}</p></section>`);
      if (result.approx.length) parts.push(`<section class="rt-cmp" data-rt-approx><p class="asc-eyebrow">Sans détail des arrêts</p>
        <ul class="rt-cmp-list">${result.approx.map((e2) => line(e2, `${esc(clock(e2.activeS))} · temps actif, arrêts compris`)).join("")}</ul>
        <p class="asc-small asc-faint">Enregistrées avant le détail des arrêts : montrées pour mémoire, jamais retenues pour un meilleur temps.</p></section>`);
      if (result.excluded.length) parts.push(`<section class="rt-cmp" data-rt-excluded><p class="asc-eyebrow">Mises de côté</p>
        <ul class="rt-cmp-list">${result.excluded.map((e2) => line(e2, esc(e2.reason))).join("")}</ul></section>`);
      if (other) parts.push(`<p class="asc-small asc-muted" data-rt-other>${other} sortie${other > 1 ? "s" : ""} proche${other > 1 ? "s" : ""} en distance ne sui${other > 1 ? "vent" : "t"} pas ce parcours : non comparée${other > 1 ? "s" : ""}.</p>`);
      body.querySelector("[data-rt-result]").innerHTML = parts.join("");
      const choices = rows.filter((r) => r.id !== target.id);
      body.querySelector("[data-rt-manual]").innerHTML = choices.length ? `<label class="asc-field"><span>Comparer avec…</span><select data-rt-with><option value="">Choisir un autre parcours</option>${choices.map((r) => `<option value="${esc(r.id)}">${esc(titleOf(r))} · ${esc(km(r.distanceM))}</option>`).join("")}</select></label><div data-rt-manual-result></div>` : "";
      async function manual(id) {
        const slot = body.querySelector("[data-rt-manual-result]");
        if (!slot) return;
        if (!id) { slot.innerHTML = ""; return; }
        const token = (shownManual = id);
        slot.innerHTML = '<p class="asc-small" role="status">Lecture du parcours…</p>';
        let c = null;
        try { c = await fetchRoute(id); } catch { return; }
        if (!ok() || shownManual !== token || !slot.isConnected) return;
        if (!c) { slot.innerHTML = `<p class="asc-note err">${icon("alert")}<span>Ce parcours n’a pas pu être lu${online() ? "" : " hors ligne"}.</span></p>`; return; }
        const sameAs = N.sameRoute(got.route, c.route);
        const cell = (r) => { const s2 = summaryOf(r.summary); return r.origin !== "recorded" ? ["–", "tracé à suivre"] : s2 ? [E.clock(s2.movingS), "en mouvement"] : [clock(r.durationS), "temps actif, arrêts compris"]; };
        const rowHtml2 = (r) => { const [time, kind] = cell(r); return `<tr><th scope="row">${esc(titleOf(r))}</th><td class="asc-num">${esc(km(r.distanceM))}</td><td class="asc-num">${esc(time)}<br /><span class="asc-small asc-faint">${esc(kind)}</span></td><td class="asc-num">${r.ascentM === null ? "–" : esc(`${r.ascentM} m`)}</td></tr>`; };
        slot.innerHTML = `<p class="asc-note ${sameAs.match ? "" : "warn"}" data-rt-indicative>${icon(sameAs.match ? "info" : "alert")}<span>${sameAs.match ? `Même parcours${sameAs.direction === "reverse" ? ", dans l’autre sens" : ""} selon le critère ci-dessus.` : `Parcours différents : comparaison indicative. ${esc(sameAs.reason)}`}</span></p>
          <div class="rt-table-wrap"><table class="rt-table"><thead><tr><th scope="col">Parcours</th><th scope="col">Distance</th><th scope="col">Temps</th><th scope="col">D+</th></tr></thead><tbody>${rowHtml2(target)}${rowHtml2(c.r)}</tbody></table></div>`;
      }
    }

    if (o.routeId) { pull(); detail(String(o.routeId)); }
    else { show("list", '<div class="asc-skeleton" style="height:120px"></div>'); load(); }
    return d;
  }

  /** The library as other screens need it (the planner's « start of a route », the points « along a route »): rows, then one route. */
  async function catalog() {
    const ctx = context();
    if (!alive(ctx)) return [];
    const local = copies(ctx.owner).list().map(rowOf);
    if (isGuest(ctx.owner) || !online() || !ctx.client?.rpc) return local;
    try {
      const { data } = await versioned(ctx, "titan_routes_v2", { p_limit: 100 }, "titan_routes_v1", { p_limit: 100 });
      const mine = localMeta(ctx.owner);
      return [...local.filter((r) => String(r.id).startsWith("local:")), ...(Array.isArray(data) ? data : []).map((r) => normalize(r, mine)).filter(Boolean)];
    } catch { return local; }
  }
  /** One route to follow or to measure against: the copy in this browser first (no network), else the server. Null when neither has it. */
  async function loadRoute(id) {
    const ctx = context();
    if (!alive(ctx) || !NAV()) return null;
    const entry = copies(ctx.owner).get(String(id));
    if (entry) return routeOf(entry);
    if (isGuest(ctx.owner) || !online() || String(id).startsWith("local:")) return null;
    try {
      const { data } = await versioned(ctx, "titan_route_get_v2", { p_id: id }, "titan_route_get_v1", { p_id: id });
      const r = normalize(data, localMeta(ctx.owner));
      if (!r || !r.track) return null;
      keepCopy(ctx.owner, r, r.track);
      return NAV().decode(r.track, { name: r.name, sport: r.sport, origin: r.origin });
    } catch { return null; }
  }
  const offline = {
    /** The route kept in this browser under this id, ready to follow (NavRoute), or null. */
    get: (id) => routeOf(copies(context().owner).get(String(id))),
    /** What is kept here: [{ id, name, sport, origin, distanceM, ascentM, savedAt, bytes, queued? }]. */
    list: () => copies(context().owner).list(),
    remove: (id) => copies(context().owner).remove(String(id), true),
  };
  /** Keeps a route in the library from another screen (the planner): same path, same answers as an import. */
  const save = (route, options) => saveRoute(context(), route, options);
  const followRoute = (route, id, say, onFollow) => follow(context(), route, id, say, onFollow);
  const ui = { esc, icon, sheet, confirm, guardSheet, askPosition, mapSvg, routeMap, context, alive, isGuest, online, km, when, stamp, store, sportLabel, gpsSports, lastGpsSport, titleOf };

  Object.assign(root.TitanRoutes, { mountForSession, openLibrary, enabled, gpsEnabled, saveRecorded, save, follow: followRoute, catalog, load: loadRoute, offline, flush: () => flush(context()), ui });
})(typeof window !== "undefined" ? window : globalThis);
