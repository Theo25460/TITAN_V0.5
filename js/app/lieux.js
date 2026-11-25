/* TITAN — V1.7.7 personal points (« Mes points ») and useful points nearby (« Points utiles »).
   A personal point is a place the athlete wants to find again (a fountain, a shelter, a bike workshop). PRIVATE: it lives in this
   browser first (localStorage, one list per account) and, once the server knows the functions, on the athlete's own account only
   (titan_places_v1 and friends read and write the caller's rows). It is never part of a share, a card or the adventure.
   Local first: a point added without a network exists at once and is sent later (`dirty`); a deleted point stays as a tombstone until
   the server has removed it; when two devices changed the same point the latest change wins; two devices adding different points keep both.
   « Points utiles » is optional and asks nothing until the athlete starts a search: it then sends the chosen area to the same-origin
   function /.netlify/functions/poi-nearby, which reads OpenStreetMap. What comes back is data other people entered: opening hours are
   quoted as written, never turned into « ouvert », and every list says where it comes from and when it was read.
   No position, distance or place name enters an analytics event: this file sends none.
   Loaded after parcours.js (it borrows its sheet, its confirmation and its account guard through TitanRoutes.ui). */
(function (root) {
  "use strict";
  const KINDS = { water: "Point d’eau", toilets: "Toilettes", shelter: "Abri", bike_repair: "Réparation vélo", food: "Ravitaillement", viewpoint: "Point de vue", parking: "Stationnement", other: "Autre" };
  /** What « Points utiles » can look for (the chips), in the plural the athlete reads. */
  const POI_KINDS = { water: "Eau", toilets: "Toilettes", shelter: "Abris", bike_repair: "Réparation vélo" };
  const MAX_PLACES = 300, POI_MAX = 200, ALONG_MAX_POINTS = 60;
  const keyOf = (owner) => `titan.places.v1:${owner}`;
  const poiKeyOf = (owner) => `titan.poi.v1:${owner}`;
  const dep = (name, file) => root[name] || (typeof module !== "undefined" && typeof require === "function" ? require(file) : null);
  const NAV = () => dep("TitanGpsNav", "../core/gps-nav.js");

  /** « 48.5839, 7.7455 » (or with decimal commas, a semicolon, a space) -> { lat, lon }, else null. No address is ever looked up. */
  function parseCoords(text) {
    const m = /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*°?\s*[;,\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*°?\s*$/.exec(String(text === null || text === undefined ? "" : text));
    if (!m) return null;
    const lat = Number(m[1].replace(",", ".")), lon = Number(m[2].replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
    return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
  }
  const coordsText = (p) => `${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}`;
  const label = (text, max) => String(text === null || text === undefined ? "" : text).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  /** A point as it is kept: a name of 60 characters, a note of 200, a position rounded to about a metre. Throws PLACE_NAME / PLACE_POSITION. */
  function clean(p) {
    const name = label(p && p.name, 60);
    if (!name) throw Error("PLACE_NAME");
    const lat = Number(p.lat), lon = Number(p.lon);
    if (p.lat === null || p.lon === null || p.lat === "" || p.lon === "" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw Error("PLACE_POSITION");
    return { name, kind: Object.prototype.hasOwnProperty.call(KINDS, p.kind) ? p.kind : "other", lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, note: label(p.note, 200) };
  }
  const newId = (now) => `pl-${(Number.isFinite(now) ? now : Date.now()).toString(36)}-${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;

  /** The points of one account in this browser. `storage` is localStorage or anything like it; `clock` gives the time (tests).
      Every row: { id, name, kind, lat, lon, note, updatedAt, dirty?, deleted?, serverId? }. A write that the storage refuses throws
      PLACE_STORAGE: the caller says the point was not kept, rather than pretending. */
  function placeStore(storage, owner, clock) {
    const now = clock || Date.now, KEY = keyOf(owner);
    const raw = () => { try { const v = JSON.parse(storage.getItem(KEY) || "null"); return Array.isArray(v) ? v.filter((p) => p && typeof p.id === "string") : []; } catch { return []; } };
    const write = (rows) => { try { storage.setItem(KEY, JSON.stringify(rows)); } catch { throw Error("PLACE_STORAGE"); } };
    return {
      raw, write,
      /** The points to show: tombstones left out, by name. */
      list: () => raw().filter((p) => !p.deleted).sort((a, b) => a.name.localeCompare(b.name, "fr")),
      add(p, id) {
        const rows = raw();
        if (rows.filter((x) => !x.deleted).length >= MAX_PLACES) throw Error("PLACE_LIMIT");
        const place = { id: id || newId(now()), ...clean(p), updatedAt: now(), dirty: true };
        write([...rows, place]);
        return place;
      },
      update(id, patch) {
        const rows = raw(), cur = rows.find((p) => p.id === id && !p.deleted);
        if (!cur) return null;
        const next = { ...cur, ...clean({ ...cur, ...(patch || {}) }), updatedAt: Math.max(now(), cur.updatedAt + 1), dirty: true };
        write(rows.map((p) => (p.id === id ? next : p)));
        return next;
      },
      /** A point the server never saw simply disappears; one it knows stays as a tombstone until the deletion is confirmed. */
      remove(id) {
        const rows = raw(), cur = rows.find((p) => p.id === id && !p.deleted);
        if (!cur) return false;
        write(rows.flatMap((p) => (p.id !== id ? [p] : p.serverId ? [{ ...p, deleted: true, dirty: true, updatedAt: Math.max(now(), p.updatedAt + 1) }] : [])));
        return true;
      },
    };
  }

  const ms = (t) => (typeof t === "number" ? t : Date.parse(t) || 0);
  const fromRemote = (r, id) => ({ id: id || String(r.clientPlaceId), name: String(r.name || ""), kind: Object.prototype.hasOwnProperty.call(KINDS, r.kind) ? r.kind : "other", lat: Number(r.lat), lon: Number(r.lon), note: String(r.note || ""), updatedAt: ms(r.updatedAt), serverId: String(r.id) });
  /** What one synchronisation must do, from what this browser holds (`local`, tombstones included) and what the server answered
      (`remote`): { push: rows to send, del: tombstones to confirm, next: the list once both are done }. Pure.
      - same point changed on both sides: the latest `updatedAt` wins, whichever side it is (a deletion is a change);
      - a point the server no longer has and that was not changed here was deleted on another device: it leaves;
      - a point the server does not know yet is sent; a point this browser does not know yet is added. */
  function plan(local, remote) {
    const rows = Array.isArray(remote) ? remote.filter((r) => r && r.id && r.clientPlaceId) : [];
    const byClient = new Map(rows.map((r) => [String(r.clientPlaceId), r])), byServer = new Map(rows.map((r) => [String(r.id), r]));
    const push = [], del = [], next = [], seen = new Set();
    for (const p of local || []) {
      const r = byClient.get(p.id) || (p.serverId ? byServer.get(p.serverId) : null);
      if (r) seen.add(String(r.id));
      if (p.deleted) {
        if (!r) continue; // nothing left to delete
        if (ms(r.updatedAt) > p.updatedAt) next.push(fromRemote(r, p.id)); // changed elsewhere after this deletion: the change wins
        else { del.push({ id: p.id, serverId: String(r.id) }); next.push({ ...p, serverId: String(r.id) }); }
        continue;
      }
      if (!r) {
        if (p.serverId && !p.dirty) continue; // deleted on another device
        push.push(p); next.push(p);
        continue;
      }
      if (p.dirty && p.updatedAt >= ms(r.updatedAt)) { push.push(p); next.push({ ...p, serverId: String(r.id) }); }
      else next.push(fromRemote(r, p.id));
    }
    for (const r of rows) if (!seen.has(String(r.id))) next.push(fromRemote(r));
    return { push, del, next };
  }
  /** The list to keep once the requests are done: `next`, except the rows the athlete changed or added while they were running. */
  function reconcile(current, snapshot, next) {
    const before = new Map((snapshot || []).map((p) => [p.id, p.updatedAt]));
    const out = next.map((n) => { const c = (current || []).find((x) => x.id === n.id); return c && before.has(n.id) && c.updatedAt > before.get(n.id) ? { ...c, serverId: c.serverId || n.serverId } : n; });
    for (const c of current || []) if (!before.has(c.id) && !out.some((x) => x.id === c.id)) out.push(c);
    return out;
  }
  /** The server does not know this function yet (migration not applied): PostgREST PGRST202 or HTTP 404, Postgres 42883. */
  function missing(error) {
    if (!error) return false;
    const code = String(error.code || ""), status = Number(error.status) || 0;
    return code === "PGRST202" || code === "42883" || status === 404 || /could not find the function|function [\w.]+\([^)]*\) does not exist/i.test(String(error.message || ""));
  }
  /** Runs one synchronisation. `rpc(fn, args)` resolves { data, error, status } (the Supabase client's shape). Never throws.
      Resolves { state: "synced" | "local-only" (the server has no points yet) | "error", pushed, deleted }. */
  async function syncWith(store, rpc) {
    const ask = async (fn, args) => { try { const r = await rpc(fn, args); return r && r.error ? { error: { ...r.error, status: r.status } } : { data: r ? r.data : null }; } catch (e) { return { error: { message: String((e && e.message) || e), status: 0 } }; } };
    const listed = await ask("titan_places_v1", {});
    if (listed.error) return { state: missing(listed.error) ? "local-only" : "error", pushed: 0, deleted: 0 };
    const snapshot = store.raw(), todo = plan(snapshot, listed.data);
    let next = todo.next, pushed = 0, deleted = 0, failed = false;
    for (const d of todo.del) {
      const r = await ask("titan_place_delete_v1", { p_id: d.serverId });
      if (r.error) { failed = true; continue; }
      next = next.filter((p) => p.id !== d.id); deleted++;
    }
    for (const p of todo.push) {
      const r = await ask("titan_place_save_v1", { p_client_place_id: p.id, p_name: p.name, p_kind: p.kind, p_lat: p.lat, p_lon: p.lon, p_note: p.note || "" });
      if (r.error || !r.data || !r.data.id) { failed = true; continue; }
      next = next.map((x) => (x.id === p.id ? { ...x, serverId: String(r.data.id), dirty: false } : x)); pushed++;
    }
    try { store.write(reconcile(store.raw(), snapshot, next).map((p) => { const { dirty, deleted: gone, ...rest } = p; return { ...rest, ...(dirty ? { dirty: true } : {}), ...(gone ? { deleted: true } : {}) }; })); }
    catch { return { state: "error", pushed, deleted }; }
    return { state: failed ? "error" : "synced", pushed, deleted };
  }

  /* ---- Points utiles: the request and what is read back (pure) ---- */
  /** At most 60 positions that still draw the route: shape first (growing tolerance), then one in n if that is not enough. */
  function thin(route, max) {
    const N = NAV(), limit = max || ALONG_MAX_POINTS;
    let pts = (route && route.segs ? route.segs : []).flat().map((p) => ({ lat: p.lat, lon: p.lon }));
    if (pts.length <= limit) return pts;
    for (let tol = 10; pts.length > limit && tol < 5000; tol *= 1.7) pts = N.simplify(pts, tol);
    if (pts.length > limit) { const step = (pts.length - 1) / (limit - 1); pts = Array.from({ length: limit }, (_, i) => pts[Math.round(i * step)]); }
    return pts;
  }
  /** The body of one search. `q`: { kinds, mode: "around" | "along", center: {lat, lon}, radiusM, route }. { ok, body } or { ok: false, error }. */
  function poiRequest(q) {
    const kinds = [...new Set((q && q.kinds) || [])].filter((k) => Object.prototype.hasOwnProperty.call(POI_KINDS, k));
    if (!kinds.length) return { ok: false, error: "Choisis au moins un type de point à chercher." };
    const radiusM = Math.max(50, Math.min(5000, Math.round(Number(q.radiusM) || 0)));
    if (q.mode === "along") {
      const pts = thin(q.route);
      if (pts.length < 2) return { ok: false, error: "Choisis un parcours le long duquel chercher." };
      return { ok: true, body: { kinds, along: { points: pts.map((p) => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]), radiusM } } };
    }
    const c = q.center;
    if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return { ok: false, error: "Il faut une position autour de laquelle chercher." };
    return { ok: true, body: { kinds, around: { lat: Math.round(c.lat * 1e5) / 1e5, lon: Math.round(c.lon * 1e5) / 1e5, radiusM } } };
  }
  const text = (v, max) => (typeof v === "string" && v.trim() ? label(v, max) : null);
  /** Reads the function's answer into one state the screen can draw. Anything unexpected is « unavailable », never a made-up list. */
  function readPoi(status, json) {
    if (json && json.ok === true && Array.isArray(json.pois)) {
      const pois = json.pois.filter((p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180).slice(0, POI_MAX)
        .map((p) => ({ id: String(p.id === undefined || p.id === null ? "" : p.id).slice(0, 64), kind: Object.prototype.hasOwnProperty.call(KINDS, p.kind) ? p.kind : "other", lat: Number(p.lat), lon: Number(p.lon),
          name: text(p.name, 80), openingHours: text(p.openingHours, 160), fee: text(p.fee, 40), access: text(p.access, 40), osmUpdatedAt: text(p.osmUpdatedAt, 40) }));
      return { state: pois.length ? "ok" : "empty", pois, source: text(json.source, 60), license: text(json.license, 60), attribution: text(json.attribution, 160), fetchedAt: text(json.fetchedAt, 40), truncated: json.truncated === true || json.pois.length > POI_MAX };
    }
    const code = json && typeof json.code === "string" ? json.code : "";
    if (code === "POI_NOT_CONFIGURED" || status === 404) return { state: "not_configured" };
    if (code === "AUTH_REQUIRED" || status === 401 || status === 403) return { state: "auth" };
    if (code === "RATE_LIMITED" || status === 429) return { state: "rate" };
    if (code === "QUOTA_EXCEEDED") return { state: "quota" };
    if (code === "BAD_REQUEST" || status === 400) return { state: "bad" };
    return { state: "unavailable" };
  }
  const POI_MESSAGES = {
    not_configured: "La recherche de points utiles n’est pas encore activée : elle demande un service de données OpenStreetMap configuré sur le serveur (voir docs/V177_CARTES_ET_ROUTAGE.md). En attendant, tes propres repères dans « Mes points » fonctionnent sans ce service.",
    offline: "La recherche de points utiles demande une connexion. Tes points personnels restent disponibles.",
    auth: "La recherche de points utiles demande un compte connecté. Reconnecte-toi, puis relance la recherche.",
    guest: "La recherche de points utiles demande un compte. En mode découverte, tu peux ajouter tes propres repères dans « Mes points ».",
    rate: "Trop de recherches en peu de temps. Réessaie dans quelques minutes.",
    quota: "Le quota de recherches du jour est atteint. Il se libère demain ; tes points personnels restent disponibles.",
    bad: "Cette recherche n’a pas été acceptée (zone ou rayon hors limites). Change la zone, puis réessaie.",
    unavailable: "La recherche n’a pas abouti. Aucun résultat n’est affiché plutôt qu’une liste incertaine. Réessaie dans un instant.",
    empty: "Aucun point de ce type n’est connu d’OpenStreetMap dans cette zone. Cela ne dit pas qu’il n’y en a pas : la carte peut être incomplète.",
  };
  const two = (n) => String(n).padStart(2, "0");
  /** « Source : OpenStreetMap (ODbL), relevé du 25/11 à 09:41 ». The date is the one the function gave, else when this browser read it. */
  function sourceLine(res, readAt) {
    const t = ms((res && res.fetchedAt) || 0) || readAt || 0, d = new Date(t);
    const osm = !res || !res.source || /osm|openstreetmap|overpass/i.test(res.source);
    const who = osm ? "OpenStreetMap" : res.source, lic = (res && res.license) || (osm ? "ODbL" : "");
    return `Source : ${who}${lic ? ` (${lic})` : ""}${t ? `, relevé du ${two(d.getDate())}/${two(d.getMonth() + 1)} à ${two(d.getHours())}:${two(d.getMinutes())}` : ""}`;
  }
  /** How old the map entry is, as the map says it — or that nobody knows. Never a statement about the place itself. */
  function freshness(osmUpdatedAt) {
    const t = ms(osmUpdatedAt || 0);
    return t ? `fiche modifiée en ${new Date(t).getFullYear()}` : "fraîcheur inconnue";
  }
  const hoursText = (raw) => (raw ? `Horaires indiqués : ${raw} (non vérifiés)` : "");
  const feeText = (fee) => (!fee ? "" : /^yes$/i.test(fee) ? "Indiqué payant (non vérifié)" : /^no$/i.test(fee) ? "Indiqué gratuit (non vérifié)" : `Tarif indiqué : ${fee} (non vérifié)`);
  const accessText = (access) => (!access || /^(yes|public)$/i.test(access) ? "" : `Accès indiqué : ${access} (non vérifié)`);
  const metres = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1).replace(".", ",")} km` : `${Math.round(m / 10) * 10 || Math.round(m)} m`);
  /** The list in the order it is useful: nearest first around a position; in the order they are met along a route. */
  function arrange(pois, q) {
    const N = NAV();
    if (q.mode === "along" && q.route) return N.nearRoute(pois, q.route, Math.max(q.radiusM * 2, q.radiusM + 150)).map((p) => ({ ...p, where: `km ${(p.alongM / 1000).toFixed(1).replace(".", ",")} du parcours · à ${metres(p.offM)} du tracé` }));
    if (!q.center) return pois.map((p) => ({ ...p, where: "" }));
    return pois.map((p) => { const d = N.haversine(q.center, p); return { ...p, distanceM: Math.round(d), where: `à ${metres(d)}` }; }).sort((a, b) => a.distanceM - b.distanceM);
  }

  const api = { KINDS, POI_KINDS, MAX_PLACES, keyOf, poiKeyOf, parseCoords, coordsText, clean, placeStore, plan, reconcile, missing, syncWith, thin, poiRequest, readPoi, POI_MESSAGES, sourceLine, freshness, hoursText, feeText, accessText, arrange };
  root.TitanPlaces = Object.assign(root.TitanPlaces || {}, api);
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;

  /* ---------------- Interface (browser only) ---------------- */
  const U = () => window.TitanRoutes?.ui || null;
  const owner = () => window.state?.user?.id || null;
  const storage = () => { try { const s = window.localStorage; s.getItem("titan.probe"); return s; } catch { return null; } };
  const mine = () => { const s = storage(), o = owner(); return s && o ? placeStore(s, o) : null; };
  const WORDS = { PLACE_NAME: "Donne un nom à ce point.", PLACE_POSITION: "Indique une position valide, par exemple « 48.5839, 7.7455 ».", PLACE_LIMIT: `Tu as déjà ${MAX_PLACES} points : supprime-en un pour en ajouter.`, PLACE_STORAGE: "Le stockage de ce navigateur est plein ou bloqué : ce point n’a pas été gardé." };
  const guarded = (fn) => { try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: WORDS[e.message] || "Ce point n’a pas pu être gardé." }; } };

  let syncing = null, lastSync = null, again = false;
  /** Sends what is waiting and reads what other devices changed. Resolves { state } with "guest", "offline", "local-only", "synced" or "error".
      One at a time: a change made while a synchronisation runs is sent by one more run right after it. */
  function sync() {
    if (syncing) { again = true; return syncing; }
    const ui = U(), ctx = ui?.context(), store = mine();
    if (!ui || !store || !ui.alive(ctx)) return Promise.resolve({ state: "error" });
    if (ui.isGuest(ctx.owner) || !ctx.client?.rpc) return Promise.resolve((lastSync = { state: "guest" }));
    if (!ui.online()) return Promise.resolve((lastSync = { state: "offline" }));
    syncing = syncWith(store, (fn, args) => (ui.alive(ctx) ? ctx.client.rpc(fn, args) : Promise.reject(Error("STALE"))))
      .then((r) => { if (ui.alive(ctx)) { lastSync = r; window.dispatchEvent(new CustomEvent("titan:places-updated")); } return r; })
      .finally(() => { syncing = null; if (again) { again = false; if (lastSync?.state === "synced") sync(); } });
    return syncing;
  }
  const list = () => mine()?.list() || [];
  const add = (p) => { const s = mine(); if (!s) throw Error("PLACE_STORAGE"); const place = s.add(p); sync(); return place; };
  const update = (id, patch) => { const s = mine(); if (!s) throw Error("PLACE_STORAGE"); const place = s.update(id, patch); sync(); return place; };
  const remove = (id) => { const s = mine(); if (!s) return false; const done = s.remove(id); sync(); return done; };

  async function post(ctx, body) {
    const token = (await ctx.client.auth.getSession())?.data?.session?.access_token;
    if (typeof token !== "string" || !token) return { status: 401, json: { ok: false, code: "AUTH_REQUIRED" } };
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 25000);
    try {
      const res = await fetch("/.netlify/functions/poi-nearby", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: stop.signal });
      let json = null;
      try { json = await res.json(); } catch { /* not JSON: read as unavailable */ }
      return { status: res.status, json };
    } finally { clearTimeout(timer); }
  }
  const readCache = (o) => { try { const v = JSON.parse(storage()?.getItem(poiKeyOf(o)) || "null"); return v && v.result && Array.isArray(v.result.pois) ? v : null; } catch { return null; } };
  const writeCache = (o, v) => { try { storage()?.setItem(poiKeyOf(o), JSON.stringify(v)); return true; } catch { return false; } };

  /** Opens « Mes points ». `options`: { view: "places" | "poi", add: { lat, lon, name?, kind? } (opens the form filled with this position) }. */
  function open(options) {
    const ui = U(), o = options || {};
    if (!ui) return null;
    const ctx = ui.context();
    if (!ui.alive(ctx)) return null;
    const { esc, icon } = ui, guest = ui.isGuest(ctx.owner), store = mine();
    const body = document.createElement("div");
    body.className = "asc-stack pl-sheet";
    const d = ui.sheet({ title: "Mes points", eyebrow: "GPS", body });
    ui.guardSheet(d, ctx);
    const ok = () => ui.alive(ctx) && d.open;
    const P = { view: o.view === "poi" ? "poi" : "places", editing: o.add ? "new" : null, draft: o.add || null, flash: "",
      poi: { kinds: ["water"], mode: "around", radiusM: 1000, alongM: 300, routeId: "", routes: null, busy: false, shown: null, message: "", state: "" } };
    const onPlaces = () => { if (ok() && P.view === "places" && !P.editing) draw(); };
    window.addEventListener("titan:places-updated", onPlaces);
    d.addEventListener("close", () => window.removeEventListener("titan:places-updated", onPlaces), { once: true });

    const tabs = () => `<div class="asc-seg pl-tabs" role="group" aria-label="Points"><button type="button" class="rt-tap" data-pl-tab="places" aria-pressed="${P.view === "places"}">Mes points</button><button type="button" class="rt-tap" data-pl-tab="poi" aria-pressed="${P.view === "poi"}">Points utiles</button></div>`;
    const syncLine = () => {
      const s = lastSync?.state, waiting = (store?.raw() || []).some((p) => p.dirty);
      const t = !store ? "Le stockage de ce navigateur est bloqué : tes points ne peuvent pas être gardés ici."
        : guest ? "Mode découverte : tes points restent sur cet appareil seulement, sans sauvegarde sur un compte."
        : s === "local-only" ? "Enregistrés sur cet appareil seulement pour l’instant : le serveur n’a pas encore la mise à jour des points."
        : s === "offline" || !ui.online() ? `Hors ligne : tes points sont sur cet appareil${waiting ? " et partiront vers ton compte au retour du réseau" : ""}.`
        : s === "synced" ? "Synchronisés avec ton compte. Privés : jamais partagés ni publiés."
        : s === "error" ? "La synchronisation n’a pas abouti : tes points sont sur cet appareil, un nouvel essai aura lieu à la prochaine ouverture."
        : "Synchronisation avec ton compte…";
      return `<p class="asc-small asc-muted" role="status" data-pl-sync data-state="${esc(guest ? "guest" : s || "pending")}">${esc(t)}</p>`;
    };
    const formHtml = (p) => `<form class="pl-form asc-stack" data-pl-form novalidate>
        <h3 class="asc-h3" tabindex="-1" data-pl-focus>${P.editing === "new" ? "Ajouter un point" : "Modifier le point"}</h3>
        <label class="asc-field"><span>Nom</span><input type="text" class="asc-input" maxlength="60" data-pl-name value="${esc(p.name || "")}" autocomplete="off" /></label>
        <label class="asc-field"><span>Type</span><select data-pl-kind>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === (p.kind || "water") ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
        <label class="asc-field"><span>Position (latitude, longitude)</span><input type="text" class="asc-input" inputmode="text" data-pl-coords value="${p.lat !== undefined && p.lat !== null ? esc(coordsText(p)) : ""}" placeholder="48.5839, 7.7455" autocomplete="off" />
          <small>Pas de recherche d’adresse dans TITAN : utilise ta position ou saisis des coordonnées.</small></label>
        <button type="button" class="asc-btn asc-btn-secondary rt-tap pl-here" data-pl-here>${icon("pin")} Ma position</button>
        <div data-pl-ask hidden></div>
        <label class="asc-field"><span>Note (facultatif)</span><input type="text" class="asc-input" maxlength="200" data-pl-note value="${esc(p.note || "")}" autocomplete="off" /></label>
        <p class="asc-small" role="alert" data-pl-error></p>
        <div class="asc-actions"><button type="submit" class="asc-btn asc-btn-primary rt-tap">Enregistrer le point</button><button type="button" class="asc-btn asc-btn-ghost rt-tap" data-pl-cancel>Annuler</button></div></form>`;
    function placesHtml() {
      if (P.editing) return formHtml(P.editing === "new" ? P.draft || {} : (store?.raw() || []).find((p) => p.id === P.editing) || {});
      const rows = store ? store.list() : [];
      return `<p class="asc-small asc-muted">Tes repères personnels : une fontaine, un abri, un atelier vélo. Privés : jamais partagés ni publiés.</p>
        ${syncLine()}
        ${P.flash ? `<p class="asc-note" role="status" data-pl-flash>${icon("check")}<span>${esc(P.flash)}</span></p>` : ""}
        <button type="button" class="asc-btn asc-btn-secondary rt-tap" data-pl-add ${store ? "" : "disabled"}>${icon("plus")} Ajouter un point</button>
        ${rows.length ? `<ul class="pl-list">${rows.map((p) => `<li class="pl-item" data-pl-id="${esc(p.id)}"><div class="pl-item-main"><strong class="pl-name">${esc(p.name)}</strong><span class="asc-chip">${esc(KINDS[p.kind] || KINDS.other)}</span></div>
          <p class="asc-small asc-muted asc-num">${esc(coordsText(p))}</p>${p.note ? `<p class="asc-small">${esc(p.note)}</p>` : ""}
          <div class="pl-item-actions"><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm rt-tap" data-pl-edit aria-label="Modifier ${esc(p.name)}">${icon("edit")} Modifier</button><button type="button" class="asc-btn asc-btn-ghost asc-btn-sm rt-tap" data-pl-del aria-label="Supprimer ${esc(p.name)}">${icon("trash")} Supprimer</button></div></li>`).join("")}</ul>`
          : '<p class="asc-small asc-muted" data-pl-empty>Aucun point pour le moment.</p>'}`;
    }

    /* -- Points utiles -- */
    const hit = (p, i) => `<li class="poi-item" data-poi-index="${i}"><div class="pl-item-main"><strong class="pl-name">${esc(p.name || KINDS[p.kind] || KINDS.other)}</strong><span class="asc-chip">${esc(KINDS[p.kind] || KINDS.other)}</span></div>
      <p class="asc-small asc-muted">${esc([p.where, freshness(p.osmUpdatedAt)].filter(Boolean).join(" · "))}</p>
      ${[hoursText(p.openingHours), feeText(p.fee), accessText(p.access)].filter(Boolean).map((t) => `<p class="asc-small poi-raw">${esc(t)}</p>`).join("")}
      <button type="button" class="asc-btn asc-btn-secondary asc-btn-sm rt-tap" data-poi-keep>${icon("plus")} Enregistrer dans mes points</button><span class="asc-small" role="status" data-poi-kept></span></li>`;
    function resultsHtml() {
      const s = P.poi, shown = s.shown;
      const note = s.state && s.state !== "ok" ? `<div class="asc-note ${s.state === "empty" ? "" : s.state === "not_configured" || s.state === "offline" || s.state === "guest" ? "warn" : "err"}" data-poi-state="${esc(s.state)}">${icon(s.state === "offline" ? "offline" : s.state === "empty" ? "info" : "alert")}<span>${esc(POI_MESSAGES[s.state] || POI_MESSAGES.unavailable)}</span></div>` : "";
      if (!shown) return note;
      return `${note}<section class="poi-results" data-poi-results><p class="asc-eyebrow">${shown.cached ? "Dernier relevé gardé sur cet appareil" : "Résultats"}${shown.label ? ` · ${esc(shown.label)}` : ""}</p>
        <p class="asc-small asc-muted" data-poi-source>${esc(sourceLine(shown.result, shown.at))}${shown.result.attribution ? ` · ${esc(shown.result.attribution)}` : ""}</p>
        <p class="asc-small asc-faint">Données saisies par des contributeurs : un point peut avoir disparu, être fermé ou manquer. Vérifie sur place.</p>
        ${shown.result.truncated ? '<p class="asc-small asc-muted">Liste tronquée : seuls les premiers points sont montrés. Réduis le rayon pour tout voir.</p>' : ""}
        <ul class="pl-list">${shown.result.pois.map(hit).join("")}</ul></section>`;
    }
    function poiHtml() {
      const s = P.poi;
      return `<p class="asc-small asc-muted">Facultatif : rien n’est demandé tant que tu ne lances pas une recherche. Elle envoie la zone choisie au service de points d’intérêt du serveur, puis le résultat est gardé sur cet appareil.</p>
        <fieldset class="pl-fieldset"><legend>Chercher</legend><div class="pl-chips">${Object.entries(POI_KINDS).map(([k, v]) => `<label class="pl-chip"><input type="checkbox" data-poi-kind value="${k}"${s.kinds.includes(k) ? " checked" : ""} /><span>${esc(v)}</span></label>`).join("")}</div></fieldset>
        <fieldset class="pl-fieldset"><legend>Où</legend>
          <label class="pl-radio"><input type="radio" name="poi-mode" data-poi-mode value="around"${s.mode === "around" ? " checked" : ""} /><span>Autour de ma position</span></label>
          <label class="pl-radio"><input type="radio" name="poi-mode" data-poi-mode value="along"${s.mode === "along" ? " checked" : ""} /><span>Le long d’un parcours</span></label>
          ${s.mode === "around" ? `<label class="asc-field"><span>Rayon</span><select data-poi-radius>${[[500, "500 m"], [1000, "1 km"], [2000, "2 km"], [5000, "5 km"]].map(([v, t]) => `<option value="${v}"${v === s.radiusM ? " selected" : ""}>${t}</option>`).join("")}</select></label>`
            : `<label class="asc-field"><span>Parcours</span><select data-poi-route>${s.routes === null ? '<option value="">Lecture de tes parcours…</option>' : s.routes.length ? `<option value="">Choisir un parcours</option>${s.routes.map((r) => `<option value="${esc(r.id)}"${r.id === s.routeId ? " selected" : ""}>${esc(ui.titleOf(r))} · ${esc(ui.km(r.distanceM))}</option>`).join("")}` : '<option value="">Aucun parcours dans ta bibliothèque</option>'}</select></label>
              <label class="asc-field"><span>Distance au tracé</span><select data-poi-along>${[[100, "100 m"], [300, "300 m"], [1000, "1 km"]].map(([v, t]) => `<option value="${v}"${v === s.alongM ? " selected" : ""}>${t}</option>`).join("")}</select></label>`}
        </fieldset>
        <button type="button" class="asc-btn asc-btn-primary rt-tap" data-poi-go ${s.busy ? "disabled" : ""}>${icon("search")} ${s.busy ? "Recherche…" : "Chercher"}</button>
        <div data-poi-ask hidden></div>
        <p class="asc-small" role="status" data-poi-status>${esc(s.message)}</p>
        <div data-poi-out>${resultsHtml()}</div>`;
    }
    function draw() {
      body.innerHTML = `${P.editing ? "" : tabs()}<div class="asc-stack" data-pl-view="${P.view}">${P.view === "places" ? placesHtml() : poiHtml()}</div>`;
      P.flash = "";
      if (P.editing) body.querySelector("[data-pl-focus]")?.focus();
    }
    async function search() {
      const s = P.poi;
      if (s.busy) return;
      const status = (t) => { s.message = t; const n = body.querySelector("[data-poi-status]"); if (n) n.textContent = t; };
      const fail = (state) => { s.state = state; s.busy = false; s.message = ""; const cached = readCache(ctx.owner); if (cached && (state === "offline" || state === "unavailable")) s.shown = { ...cached, cached: true }; if (ok() && P.view === "poi") draw(); };
      if (guest) return fail("guest");
      if (!s.kinds.length) return status("Choisis au moins un type de point à chercher.");
      if (!ui.online()) return fail("offline");
      let q = { kinds: s.kinds, mode: s.mode, radiusM: s.mode === "around" ? s.radiusM : s.alongM }, labelText = "";
      if (s.mode === "around") {
        const here = await ui.askPosition(body.querySelector("[data-poi-ask]"), "Pour chercher autour de toi,");
        if (!ok() || !here) return;
        q.center = here; labelText = `autour de ta position, ${metres(s.radiusM)}`;
      } else {
        if (!s.routeId) return status("Choisis un parcours le long duquel chercher.");
        status("Lecture du parcours…");
        q.route = await window.TitanRoutes.load(s.routeId);
        if (!ok()) return;
        if (!q.route) return status("Ce parcours n’a pas pu être lu.");
        labelText = `le long de « ${ui.titleOf((s.routes || []).find((r) => r.id === s.routeId) || { name: q.route.name, sport: q.route.sport }) } », à ${metres(s.alongM)}`;
      }
      const req = poiRequest(q);
      if (!req.ok) return status(req.error);
      s.busy = true; s.state = ""; s.message = "Recherche en cours…";
      if (P.view === "poi") draw();
      let res;
      try { res = await post(ctx, req.body); } catch { if (ok()) fail(ui.online() ? "unavailable" : "offline"); return; }
      if (!ok()) return;
      const read = readPoi(res.status, res.json);
      if (read.state !== "ok" && read.state !== "empty") return fail(read.state);
      const result = { ...read, pois: arrange(read.pois, q) };
      delete result.state;
      const shown = { at: Date.now(), label: labelText, result };
      s.busy = false; s.state = read.state; s.message = read.state === "ok" ? `${result.pois.length} point${result.pois.length > 1 ? "s" : ""} trouvé${result.pois.length > 1 ? "s" : ""}.` : "";
      s.shown = read.state === "ok" ? shown : null;
      if (read.state === "ok") writeCache(ctx.owner, shown);
      if (P.view === "poi") draw();
    }

    body.addEventListener("change", (e) => {
      if (!ok()) return;
      const t = e.target, s = P.poi;
      if (t.matches("[data-poi-kind]")) s.kinds = [...body.querySelectorAll("[data-poi-kind]:checked")].map((n) => n.value);
      else if (t.matches("[data-poi-radius]")) s.radiusM = Number(t.value);
      else if (t.matches("[data-poi-along]")) s.alongM = Number(t.value);
      else if (t.matches("[data-poi-route]")) s.routeId = t.value;
      else if (t.matches("[data-poi-mode]")) {
        s.mode = t.value; draw();
        body.querySelector(`[data-poi-mode][value="${s.mode}"]`)?.focus();
        if (s.mode === "along" && s.routes === null) window.TitanRoutes.catalog().then((rows) => { s.routes = rows; if (ok() && P.view === "poi") { draw(); body.querySelector("[data-poi-route]")?.focus(); } });
      }
    });
    body.addEventListener("submit", (e) => {
      const form = e.target.closest("[data-pl-form]");
      if (!form || !ok()) return;
      e.preventDefault();
      const err = (t) => { form.querySelector("[data-pl-error]").textContent = t; };
      const at = parseCoords(form.querySelector("[data-pl-coords]").value);
      if (!at) return err(WORDS.PLACE_POSITION);
      const p = { name: form.querySelector("[data-pl-name]").value, kind: form.querySelector("[data-pl-kind]").value, note: form.querySelector("[data-pl-note]").value, lat: at.lat, lon: at.lon };
      const r = guarded(() => (P.editing === "new" ? add(p) : update(P.editing, p)));
      if (!r.ok) return err(r.error);
      if (!r.value) return err("Ce point n’existe plus sur cet appareil.");
      P.flash = P.editing === "new" ? "Point ajouté." : "Point modifié.";
      P.editing = null; P.draft = null;
      draw();
    });
    body.addEventListener("click", async (e) => {
      if (!ok()) return;
      const t = e.target;
      const tab = t.closest("[data-pl-tab]")?.dataset.plTab;
      if (tab) { P.view = tab; if (tab === "poi" && !P.poi.shown) { const c = readCache(ctx.owner); if (c) P.poi.shown = { ...c, cached: true }; } draw(); body.querySelector(`[data-pl-tab="${tab}"]`)?.focus(); return; }
      if (t.closest("[data-pl-add]")) { P.editing = "new"; P.draft = null; return draw(); }
      if (t.closest("[data-pl-cancel]")) { P.editing = null; P.draft = null; return draw(); }
      if (t.closest("[data-pl-here]")) {
        const here = await ui.askPosition(body.querySelector("[data-pl-ask]"), "Pour remplir la position de ce point,");
        const input = body.querySelector("[data-pl-coords]");
        if (ok() && here && input) { input.value = coordsText(here); body.querySelector("[data-pl-error]").textContent = here.acc ? `Position lue à ± ${here.acc} m. Vérifie-la avant d’enregistrer.` : ""; }
        return;
      }
      const id = t.closest("[data-pl-id]")?.dataset.plId;
      if (id && t.closest("[data-pl-edit]")) { P.editing = id; return draw(); }
      if (id && t.closest("[data-pl-del]")) {
        const p = (store?.raw() || []).find((x) => x.id === id);
        if (!p) return;
        const done = await ui.confirm({ title: "Supprimer ce point ?", message: `« ${p.name} » sera retiré de tes points${guest ? " sur cet appareil" : ", sur tous tes appareils"}.`, confirmLabel: "Supprimer", danger: true,
          action: async () => { const r = guarded(() => remove(id)); if (!r.ok) throw Error(r.error); } });
        if (done && ok()) { P.flash = "Point supprimé."; draw(); }
        return;
      }
      if (t.closest("[data-poi-go]")) return search();
      const keep = t.closest("[data-poi-keep]");
      if (keep) {
        const item = keep.closest("[data-poi-index]"), p = P.poi.shown?.result.pois[Number(item?.dataset.poiIndex)];
        if (!p) return;
        const r = guarded(() => add({ name: p.name || KINDS[p.kind] || KINDS.other, kind: p.kind, lat: p.lat, lon: p.lon, note: [hoursText(p.openingHours), "d’après OpenStreetMap"].filter(Boolean).join(" · ") }));
        item.querySelector("[data-poi-kept]").textContent = r.ok ? "Ajouté à tes points." : r.error;
        if (r.ok) keep.disabled = true;
      }
    });

    draw();
    sync().then(() => { if (ok() && P.view === "places" && !P.editing) draw(); });
    return d;
  }

  Object.assign(root.TitanPlaces, { list, add, update, remove, sync, open });
})(typeof window !== "undefined" ? window : globalThis);
