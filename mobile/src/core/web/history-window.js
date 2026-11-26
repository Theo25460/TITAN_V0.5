/* V1.6.6 — Journal longue durée. How a device holds a history of thousands of sessions, shared by the website and the Android app
   (copied unchanged by mobile/scripts/sync-web-core.mjs). Pure, except the three readers that take the Supabase client they are given.
   - Paged reading: the history is read by key (date, then id, newest first), 500 rows per page, never by offset (an offset page costs
     the server every row before it, and a row added meanwhile shifts every later page). The first page is usable on its own.
   - Coherent refresh: a device that already holds a complete copy reads only the manifest of the account (id, revision, archive,
     server status: the columns every server change of a session moves, see docs/V166_JOURNAL_LONGUE_DUREE.md), then the rows whose
     manifest line changed. An old session corrected on another device has a new revision, so it is read again whatever its date; a
     session removed on the server (withdrawn import batch, V1.6.4) leaves the manifest, so it leaves the device. When a refresh lands
     after a local correction, the higher revision wins: the newer copy is never replaced by an older one.
   - Offline coverage: what the device really holds (complete or not, from which date, how many of how many, checked when), so a view
     never presents a partial copy as a complete total.
   - Journal index: the rows sorted once per history change, with their time, family, day and search text, so a filter is one pass. */
(function (root) {
  "use strict";
  const DAY = 86400000;
  const PAGE = 500;
  const MANIFEST_PAGE = 1000;
  const CHUNK = 100;
  const MANIFEST_COLUMNS = "id,revision,archived_at,status,is_suspicious";

  const time = (l) => {
    const t = Date.parse(l?.date);
    return Number.isFinite(t) ? t : -Infinity;
  };
  /** The server order of the journal: date, then id, both descending (PostgREST order=date.desc,id.desc). */
  function order(a, b) {
    const ta = time(a), tb = time(b);
    if (ta !== tb) return tb - ta;
    const ia = String(a?.id || ""), ib = String(b?.id || "");
    return ia < ib ? 1 : ia > ib ? -1 : 0;
  }
  /** Rows in the server order, each date parsed once. */
  function sorted(rows) {
    return rows.map((row) => ({ row, t: time(row), id: String(row?.id || "") }))
      .sort((a, b) => (a.t !== b.t ? b.t - a.t : a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .map((e) => e.row);
  }
  /** One manifest line: what any server change of a session moves (revision on every correction, archive or restore; archived_at
      on a bulk archive of an import; status and is_suspicious on a review). */
  const fingerprint = (r) => `${Number(r?.revision) || 1}|${r?.archived_at || ""}|${r?.status || ""}|${r?.is_suspicious ? 1 : 0}`;

  /** What a manifest asks of a cached copy: rows to read again (new or changed), rows to drop (gone from the server). */
  function diff(cached, manifest) {
    const held = new Map();
    for (const r of cached || []) if (r && r.id) held.set(String(r.id), fingerprint(r));
    const seen = new Set();
    const fetch = [];
    for (const m of manifest || []) {
      const id = String(m.id);
      seen.add(id);
      if (held.get(id) !== fingerprint(m)) fetch.push(id);
    }
    const remove = [];
    for (const id of held.keys()) if (!seen.has(id)) remove.push(id);
    return { fetch, remove, kept: seen.size - fetch.length };
  }

  /** The cached copy with the rows read again and without the removed ones, in the server order. */
  function merge(cached, fetched, removed = []) {
    const out = new Map();
    const drop = new Set((removed || []).map(String));
    for (const r of cached || []) if (r && r.id && !drop.has(String(r.id))) out.set(String(r.id), r);
    for (const r of fetched || []) if (r && r.id) out.set(String(r.id), r);
    return sorted([...out.values()]);
  }

  /** A refreshed copy applied over what the device shows now: for each session the higher revision wins (a correction confirmed
      while the refresh was reading is kept), a removal applies only to a row not corrected since the refresh started. */
  function reconcile(current, refreshed, removed = [], startedFrom = []) {
    const now = new Map((current || []).filter((r) => r && r.id).map((r) => [String(r.id), r]));
    const base = new Map((startedFrom || []).filter((r) => r && r.id).map((r) => [String(r.id), Number(r.revision) || 1]));
    const out = new Map();
    for (const r of refreshed || []) {
      if (!r || !r.id) continue;
      const mine = now.get(String(r.id));
      out.set(String(r.id), mine && (Number(mine.revision) || 1) > (Number(r.revision) || 1) ? mine : r);
    }
    const gone = new Set((removed || []).map(String));
    for (const id of gone) {
      const mine = now.get(String(id));
      if (mine && (Number(mine.revision) || 1) > (base.get(String(id)) ?? Infinity)) out.set(String(id), mine);
    }
    // A confirmed row the device received after the refresh started (a session sent meanwhile) is kept too.
    for (const [id, mine] of now) if (!out.has(id) && !base.has(id) && !gone.has(id)) out.set(id, mine);
    return sorted([...out.values()]);
  }

  /** What the device holds. complete: every row of the account at checkedAt; otherwise rows from oldest to newest only. */
  function coverageOf(rows, { complete = false, total = null, checkedAt = null, mode = "" } = {}) {
    const list = rows || [];
    let oldest = null, newest = null;
    for (const r of list) {
      const t = time(r);
      if (!Number.isFinite(t)) continue;
      if (oldest === null || t < oldest) oldest = t;
      if (newest === null || t > newest) newest = t;
    }
    return {
      complete: Boolean(complete),
      count: list.length,
      total: Number.isFinite(Number(total)) && total !== null ? Number(total) : complete ? list.length : null,
      oldest: oldest === null ? null : new Date(oldest).toISOString(),
      newest: newest === null ? null : new Date(newest).toISOString(),
      checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null,
      mode,
    };
  }

  /** Whether totals over [since, now] can be trusted from this copy: a complete copy, or a partial one that reaches back past since. */
  function covers(coverage, since = -Infinity) {
    if (!coverage) return true; // no coverage known: the device never read the account page by page (guest, older cache)
    if (coverage.complete) return true;
    if (!coverage.oldest) return false;
    return Number.isFinite(since) && since > Date.parse(coverage.oldest);
  }

  const fr = (n) => Number(n).toLocaleString("fr-FR");
  const day = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const at = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  /** The sentence a journal shows about its coverage, or null when there is nothing to say (complete and online). */
  function describe(coverage, { online = true, loading = false } = {}) {
    if (!coverage) return null;
    if (coverage.complete) {
      if (online) return null;
      return {
        state: "complete", tone: "info", short: "Hors ligne · journal complet",
        text: `Hors ligne : tout ton journal est sur cet appareil (${fr(coverage.count)} séance${coverage.count > 1 ? "s" : ""}${coverage.checkedAt ? `, vérifié le ${at(coverage.checkedAt)}` : ""}). Une modification faite ailleurs depuis arrivera au retour du réseau.`,
      };
    }
    if (!coverage.count) {
      return { state: "none", tone: "warn", short: "Hors ligne", text: online ? "Chargement de ton journal…" : "Hors ligne : ton journal n’est pas encore sur cet appareil. Il arrivera au retour du réseau." };
    }
    const of = coverage.total !== null && coverage.total > coverage.count ? ` sur ${fr(coverage.total)}` : "";
    return {
      state: "partial", tone: "warn", short: "Journal partiel",
      text: `${online ? "" : "Hors ligne : "}cet appareil a tes séances du ${day(coverage.oldest)} à aujourd’hui (${fr(coverage.count)}${of}). ${loading && online ? "La suite se charge." : online ? "La suite arrive à la prochaine synchronisation." : "La suite arrivera au retour du réseau."} Les totaux qui commencent avant le ${day(coverage.oldest)} sont partiels.`,
    };
  }

  /* ---------- Readers (the Supabase client is given; the same supabase-js on the website and on Android) ---------- */
  const keyFilter = (last) => `date.lt."${last.date}",and(date.eq."${last.date}",id.lt.${last.id})`;
  const check = (owner, rows) => { for (const r of rows) if (r.user_id && r.user_id !== owner) throw new Error("LOG_OWNER_MISMATCH"); };

  /** Every row of the account, page by page by key. onPage(rows so far, total) after each page; the first one is usable alone. */
  async function readAll(client, owner, { pageSize = PAGE, onPage = null, timeout = (p) => p } = {}) {
    const rows = [];
    let total = null, last = null, requests = 0;
    for (;;) {
      let q = client.from("training_logs").select("*", total === null ? { count: "exact" } : undefined).eq("user_id", owner);
      if (last) q = q.or(keyFilter(last));
      const result = await timeout(q.order("date", { ascending: false }).order("id", { ascending: false }).limit(pageSize));
      requests++;
      if (result.error) throw result.error;
      const page = result.data || [];
      check(owner, page);
      if (total === null && result.count !== null && result.count !== undefined) total = result.count;
      rows.push(...page);
      if (page.length) last = page[page.length - 1];
      if (onPage) await onPage(rows, total);
      if (page.length < pageSize || (total !== null && rows.length >= total)) break;
    }
    if (total !== null && rows.length < total) throw new Error("Historique incomplet. Réessaie la synchronisation.");
    return { rows, total: total ?? rows.length, requests };
  }

  /** The manifest of the account, by id, 1 000 lines per page. */
  async function readManifest(client, owner, { pageSize = MANIFEST_PAGE, timeout = (p) => p } = {}) {
    const lines = [];
    let total = null, last = null, requests = 0;
    for (;;) {
      let q = client.from("training_logs").select(MANIFEST_COLUMNS, total === null ? { count: "exact" } : undefined).eq("user_id", owner);
      if (last) q = q.gt("id", last);
      const result = await timeout(q.order("id", { ascending: true }).limit(pageSize));
      requests++;
      if (result.error) throw result.error;
      const page = result.data || [];
      if (total === null && result.count !== null && result.count !== undefined) total = result.count;
      lines.push(...page);
      if (page.length) last = page[page.length - 1].id;
      if (!page.length || page.length < pageSize || (total !== null && lines.length >= total)) break;
    }
    if (total !== null && lines.length < total) throw new Error("Historique incomplet. Réessaie la synchronisation.");
    return { lines, total: total ?? lines.length, requests };
  }

  /** Full rows of the given ids, 100 per request. A row gone meanwhile is simply absent. */
  async function readRows(client, owner, ids, { chunk = CHUNK, timeout = (p) => p } = {}) {
    const rows = [];
    let requests = 0;
    for (let i = 0; i < ids.length; i += chunk) {
      const result = await timeout(client.from("training_logs").select("*").eq("user_id", owner).in("id", ids.slice(i, i + chunk)));
      requests++;
      if (result.error) throw result.error;
      check(owner, result.data || []);
      rows.push(...(result.data || []));
    }
    return { rows, requests };
  }

  /** The account history for this device. cached: { rows, coverage } of a previous read, or null. With a complete cached copy only
      the manifest and the changed rows travel; otherwise the rows are read page by page (onPage publishes the first ones). */
  async function refresh(client, owner, cached, { onPage = null, timeout, now = Date.now } = {}) {
    const opts = timeout ? { timeout } : {};
    if (cached && cached.coverage?.complete && Array.isArray(cached.rows)) {
      const m = await readManifest(client, owner, opts);
      const d = diff(cached.rows, m.lines);
      const fetched = d.fetch.length ? await readRows(client, owner, d.fetch, opts) : { rows: [], requests: 0 };
      // A row listed by the manifest but gone before its read was removed meanwhile.
      const got = new Set(fetched.rows.map((r) => String(r.id)));
      const removed = [...d.remove, ...d.fetch.filter((id) => !got.has(id))];
      const rows = merge(cached.rows, fetched.rows, removed);
      return { rows, removed, coverage: coverageOf(rows, { complete: true, total: m.total - (d.fetch.length - got.size), checkedAt: now(), mode: "manifest" }), stats: { mode: "manifest", requests: m.requests + fetched.requests, read: fetched.rows.length, removed: removed.length, kept: d.kept } };
    }
    const all = await readAll(client, owner, { ...opts, onPage: onPage ? (rows, total) => onPage(rows, coverageOf(rows, { complete: false, total, mode: "pages" })) : null });
    return { rows: all.rows, removed: [], coverage: coverageOf(all.rows, { complete: true, total: all.total, checkedAt: now(), mode: "pages" }), stats: { mode: "pages", requests: all.requests, read: all.rows.length, removed: 0, kept: 0 } };
  }

  /* ---------- Journal index ---------- */
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  /** Rows sorted once, with what filters read. familyOf(sport) and textOf(row) are the journal's own rules. */
  function buildIndex(rows, { familyOf = () => "", textOf = () => "" } = {}) {
    const entries = [];
    for (const row of rows || []) {
      const t = time(row);
      entries.push({ row, t, family: familyOf(row.sport), day: Number.isFinite(t) ? dayKey(t) : "", hay: null, text: textOf });
    }
    // Sorted on the precomputed time (one date parse per row, not two per comparison), then the id, as order().
    entries.sort((a, b) => (a.t !== b.t ? b.t - a.t : String(a.row.id || "") < String(b.row.id || "") ? 1 : String(a.row.id || "") > String(b.row.id || "") ? -1 : 0));
    return { entries, size: entries.length };
  }
  /** One pass over the index: { since, family, day, q } as the journal filters; returns rows in the journal order. */
  function select(index, { since = -Infinity, family = "all", day = null, q = "" } = {}) {
    const words = norm(q).trim().split(/\s+/).filter(Boolean);
    const out = [];
    for (const e of index?.entries || []) {
      if (!Number.isFinite(e.t) || e.t < since) continue;
      if (family !== "all" && e.family !== family) continue;
      if (day && e.day !== day) continue;
      if (words.length) {
        if (e.hay === null) e.hay = norm(e.text(e.row));
        if (!words.every((w) => e.hay.includes(w))) continue;
      }
      out.push(e.row);
    }
    return out;
  }

  const api = { version: 1, PAGE, MANIFEST_PAGE, CHUNK, MANIFEST_COLUMNS, DAY, order, fingerprint, diff, merge, reconcile, coverageOf, covers, describe, readAll, readManifest, readRows, refresh, buildIndex, select, dayKey };
  root.TitanHistoryWindow = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
