/* Durable operations, immutable payloads and measured sports data. */
(function (root) {
  "use strict";
  const DAY = 86400000;
  const number = (v) =>
    v === null || v === undefined || v === ""
      ? null
      : Number.isFinite(Number(v))
        ? Number(v)
        : null;
  function duration(log) {
    const d = log?.details || {};
    for (const v of [
      d.duration,
      d.val2,
      d.gpxStats?.movingMinutes,
      log?.unit === "min" ? log.val : null,
      log?.unit === "h" ? number(log.val) * 60 : null,
    ]) {
      const n = number(v);
      if (n !== null && n > 0) return n;
    }
    return null;
  }
  function load(log) {
    const r = number(log?.details?.bio?.rpe),
      m = duration(log);
    return r >= 1 && r <= 10 && m !== null ? m * r : null;
  }
  const dateKey = (d) => {
    const t = new Date(d);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  function summarize(logs, days = 30, sport = "all", now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days + 1);
    const selected = logs.filter(
      (l) =>
        !l.archived_at &&
        new Date(l.date) >= start &&
        new Date(l.date) <= now &&
        (sport === "all" || l.sport === sport),
    );
    const counts = Object.create(null),
      buckets = new Map();
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1))
      buckets.set(dateKey(d), { date: dateKey(d), minutes: 0, sessions: 0 });
    let minutes = 0,
      measured = 0,
      distance = 0,
      distanceMeasured = 0;
    for (const l of selected) {
      counts[l.sport] = (counts[l.sport] || 0) + 1;
      const m = duration(l);
      if (m !== null) {
        minutes += m;
        measured++;
      }
      if (l.unit === "km" && number(l.val) !== null) {
        distance += number(l.val);
        distanceMeasured++;
      }
      const b = buckets.get(dateKey(l.date));
      if (b) {
        b.sessions++;
        b.minutes += m || 0;
      }
    }
    return {
      sessions: selected.length,
      minutes,
      measured,
      distance,
      distanceMeasured,
      counts,
      buckets: [...buckets.values()],
      selected,
      dominant:
        Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || null,
    };
  }
  function chartBuckets(buckets, maxBars = 31) {
    const size = Math.max(1, Math.ceil(buckets.length / maxBars)),
      result = [];
    for (let i = 0; i < buckets.length; i += size) {
      const group = buckets.slice(i, i + size);
      result.push({
        date: group[0].date,
        endDate: group.at(-1).date,
        minutes: group.reduce((n, b) => n + b.minutes, 0),
        sessions: group.reduce((n, b) => n + b.sessions, 0),
      });
    }
    return result;
  }
  async function paginate(client, userId, pageSize = 500) {
    const logs = [];
    let offset = 0,
      total = null;
    for (;;) {
      const result = await client
        .from("training_logs")
        .select("*", { count: "exact" })
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (result.error) throw result.error;
      const page = result.data || [];
      if (result.count !== null && result.count !== undefined)
        total = result.count;
      logs.push(...page);
      offset += page.length;
      if (!page.length && total !== null && offset < total)
        throw new Error("Historique incomplet. Réessaie la synchronisation.");
      if (
        !page.length ||
        (total !== null && offset >= total) ||
        (total === null && page.length < pageSize)
      )
        break;
    }
    return { logs, total: total ?? logs.length };
  }
  /* Bounds shared by the website and the Android app, aligned on the server trigger (titan_validate_training_log) so that a
     session the server would refuse is refused in the form, with a message, instead of failing later in the offline queue. */
  const BOUNDS = { maxKm: 1000, kmWithoutDuration: 300, maxKmh: 120, maxMeters: 300000, maxMinutes: 1440, maxElevation: 12000, maxExercises: 30 };
  /** Issues of the measured part of a session: [{ code, field, message }]. Empty means plausible, not true. */
  function measureIssues({ km = null, minutes = null, meters = null, exercises = null } = {}) {
    const out = [];
    const add = (code, field, message) => out.push({ code, field, message });
    const k = number(km), m = number(minutes), w = number(meters);
    if (m !== null && (m <= 0 || m > BOUNDS.maxMinutes)) add("DURATION_RANGE", "duration", "Une séance dure entre 1 minute et 24 h.");
    if (k !== null) {
      if (k <= 0) add("DISTANCE_ZERO", "distance", "Indique la distance.");
      else if (k > BOUNDS.maxKm) add("DISTANCE_RANGE", "distance", `La distance d’une séance est limitée à ${BOUNDS.maxKm} km.`);
      else if (k > BOUNDS.kmWithoutDuration && m === null) add("ULTRA_NEEDS_DURATION", "duration", `Au-delà de ${BOUNDS.kmWithoutDuration} km, indique aussi la durée.`);
      else if (m !== null && m > 0 && k / (m / 60) > BOUNDS.maxKmh) add("SPEED_IMPLAUSIBLE", "distance", "Cette vitesse moyenne semble irréaliste : vérifie la distance et la durée.");
    }
    if (w !== null && (w <= 0 || w > BOUNDS.maxMeters)) add("METERS_RANGE", "meters", "La distance nagée va de 1 m à 300 km.");
    if (Array.isArray(exercises) && exercises.length > BOUNDS.maxExercises) add("EXERCISES_RANGE", "exercises", `Une séance compte au plus ${BOUNDS.maxExercises} exercices.`);
    return out;
  }
  /** A session statistics may count: in the journal (not archived), not held or refused by the server's checks. The same rule
      as career, endurance and the month report, now shared by records, progress, weekly summaries and the Android app. */
  const EXCLUDED_STATUS = ["rejected", "flagged", "pending_review"];
  function counted(log) {
    if (!log || log.archived_at || log.is_suspicious) return false;
    if (EXCLUDED_STATUS.includes(String(log.status || ""))) return false;
    return log.syncStatus !== "error";
  }
  /** A measured value a record or a trend may use: within the server's bounds and at a plausible average speed. Older sessions
      edited before the edit form checked speed (a marathon corrected to 1 minute) stay in the journal but feed no record. */
  function plausible(log) {
    const m = duration(log);
    if (m !== null && m > BOUNDS.maxMinutes) return false;
    if (log?.unit === "km") {
      const km = number(log.val);
      if (km === null || km <= 0 || km > BOUNDS.maxKm) return false;
      if (m !== null && km / (m / 60) > BOUNDS.maxKmh) return false;
    }
    if (log?.unit === "m" && number(log.val) !== null && number(log.val) > BOUNDS.maxMeters) return false;
    return true;
  }
  root.TitanTraining = {
    BOUNDS,
    measureIssues,
    counted,
    plausible,
    number,
    duration,
    load,
    dateKey,
    summarize,
    paginate,
    chartBuckets,
  };
  if (typeof module !== "undefined") module.exports = root.TitanTraining;
  root.titanSafeClearCache = () => {
    for (const key of Object.keys(localStorage)) {
      if (
        !key.startsWith("titan_profile_edits_v2_") &&
        !key.startsWith("titan_profile_control_v2_") &&
        !key.startsWith("titan_training_draft_") &&
        !key.startsWith("titan_seance_draft_") &&
        !key.startsWith("titan_seance_timer_") &&
        !key.startsWith("titan_onboarding_draft_v1:") &&
        key !== "titan_pending_training_logs_v1" &&
        key !== "titan_guest_device_id_v1" &&
        key !== "titan_guest_imported_v1"
      )
        localStorage.removeItem(key);
    }
    sessionStorage.clear();
  };
  // Drafts kept by titanSafeClearCache: legacy key, then the session draft/timer of js/app/seance.js.
  root.titanForgetOwnerDrafts = (ownerId) => {
    root.titanInvalidateProfileWrites?.(ownerId);
    try { for (const key of Object.keys(localStorage)) {
      if (key !== `titan_profile_control_v2_${ownerId}` && !key.startsWith(`titan_profile_edits_v2_${ownerId}_`)) continue;
      try { localStorage.removeItem(key); } catch { /* keep the remaining owner erasure paths running */ }
    } } catch { /* unavailable storage must not stop IndexedDB erasure */ }
    for (const key of [`titan_training_draft_${ownerId}`, `titan_seance_draft_v3:${ownerId}`, `titan_seance_timer_v3:${ownerId}`, `titan_onboarding_draft_v1:${ownerId}`]) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Blocked storage must not stop the queue and history purge that follows.
      }
    }
    // The legacy pending-session blob is kept by titanSafeClearCache until migrate() moves it to IndexedDB: drop this
    // owner's entries from it so a later migration cannot bring a deleted account's sessions back. Unreadable content is left alone.
    try {
      const raw = localStorage.getItem("titan_pending_training_logs_v1");
      const old = raw ? JSON.parse(raw) : null;
      if (Array.isArray(old)) {
        const kept = old.filter((item) => item && (item.ownerId || "unassigned") !== ownerId);
        if (kept.length === 0) localStorage.removeItem("titan_pending_training_logs_v1");
        else if (kept.length !== old.length) localStorage.setItem("titan_pending_training_logs_v1", JSON.stringify(kept));
      }
    } catch {
      // Same rule: storage or content problems never stop the purge.
    }
  };
  /* V1.6.6: what this page holds of each account's history (js/core/history-window.js coverageOf), for the views that must not
     present a partial copy as a complete total. Kept per owner, so a coverage never crosses accounts. */
  const coverages = new Map();
  root.titanHistoryCoverageOf = (ownerId) => coverages.get(String(ownerId)) || null;
  root.titanSetHistoryCoverage = (ownerId, coverage) => {
    if (coverage) coverages.set(String(ownerId), coverage);
    else coverages.delete(String(ownerId));
    if (String(ownerId) === String(root.state?.user?.id)) root.titanHistoryCoverage = coverage || null;
  };
  if (!root.indexedDB) return;
  let connection,
    cache = [];
  const owner = () => root.state?.user?.id || "unassigned";
  const open = () =>
    connection ||
    (connection = new Promise((resolve, reject) => {
      const request = indexedDB.open("titan-training", 3);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("operations"))
          request.result.createObjectStore("operations", { keyPath: "key" });
        if (!request.result.objectStoreNames.contains("history"))
          request.result.createObjectStore("history", { keyPath: "ownerId" });
        // V1.6.6: an account history is kept in blocks of CHUNK_ROWS sessions, key « owner:n ».
        if (!request.result.objectStoreNames.contains("historyChunks"))
          request.result.createObjectStore("historyChunks", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  async function transaction(mode, run, store = "operations") {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = run(tx.objectStore(store));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("STORAGE_ABORT"));
    });
  }
  async function refresh(notifyOwner) {
    cache = (await transaction("readonly", (s) => s.getAll())) || [];
    if (notifyOwner === undefined || (owner() === notifyOwner && !root.titanAccountTransition?.active)) {
      root.dispatchEvent(new CustomEvent("titan:pending-changed"));
    }
    return cache.filter((x) => x.ownerId === owner());
  }
  async function writeForOwner(ownerId, store, write) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store === "history" ? ["history"] : ["history", store], "readwrite");
      const receipt = tx.objectStore("history").get(ownerId);
      receipt.onsuccess = () => {
        if (!receipt.result?.erased) write(tx.objectStore(store));
      };
      tx.oncomplete = () => {
        if (receipt.result?.erased) reject(Object.assign(new Error("Compte supprimé sur cet appareil."), { code: "TRAINING_OWNER_ERASED" }));
        else resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("STORAGE_ABORT"));
    });
  }
  /* V1.6.6 — the account copy in blocks. Rows are sorted by id, so a correction, an archive or a confirmation changes one block and
     only that block is written again (the whole copy was rewritten each time: 345 ms of main thread on 10 000 sessions). The head
     record (store « history », key ownerId) holds the number of blocks and the coverage; a discovery account keeps its single
     record (saveGuestSession). A block is written again when one of its rows changed what the server can change. */
  const CHUNK_ROWS = 500;
  const written = new Map();
  const byId = (a, b) => (String(a?.id) < String(b?.id) ? -1 : String(a?.id) > String(b?.id) ? 1 : 0);
  const rowSig = (r) => `${r?.id}~${r?.revision ?? ""}~${r?.syncStatus ?? ""}~${r?.archived_at ?? ""}~${r?.status ?? ""}~${r?.is_suspicious ? 1 : 0}~${r?.date ?? ""}~${r?.val ?? ""}~${r?.xp ?? ""}`;
  const chunkKeys = (ownerId, n) => Array.from({ length: Math.max(0, Number(n) || 0) }, (_, i) => `${ownerId}:${i}`);
  async function saveChunked(ownerId, logs, coverage) {
    if (String(ownerId).startsWith("guest_")) return writeForOwner(ownerId, "history", (s) => s.put({ ownerId, logs, coverage }));
    const rows = [...(logs || [])].sort(byId);
    const blocks = [];
    for (let i = 0; i < rows.length; i += CHUNK_ROWS) blocks.push(rows.slice(i, i + CHUNK_ROWS));
    const sigs = blocks.map((b) => b.map(rowSig).join("|"));
    const before = written.get(ownerId) || null;
    const db = await open();
    let wrote = 0;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["history", "historyChunks"], "readwrite");
      const head = tx.objectStore("history").get(ownerId);
      head.onsuccess = () => {
        if (head.result?.erased) return;
        const chunks = tx.objectStore("historyChunks");
        const known = head.result?.chunked ? before : null;
        blocks.forEach((b, i) => {
          if (known && known[i] === sigs[i]) return;
          chunks.put({ key: `${ownerId}:${i}`, ownerId, i, rows: b });
          wrote++;
        });
        const had = Math.max(Number(head.result?.chunks) || 0, known?.length || 0);
        for (let i = blocks.length; i < had; i++) chunks.delete(`${ownerId}:${i}`);
        tx.objectStore("history").put({ ownerId, chunked: true, chunks: blocks.length, count: rows.length, coverage, savedAt: Date.now() });
      };
      tx.oncomplete = () => {
        if (head.result?.erased) reject(Object.assign(new Error("Compte supprimé sur cet appareil."), { code: "TRAINING_OWNER_ERASED" }));
        else { written.set(ownerId, sigs); resolve(); }
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("STORAGE_ABORT"));
    });
    root.titanHistoryWriteStats = { blocks: blocks.length, wrote };
  }
  async function readEntry(ownerId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["history", "historyChunks"], "readonly");
      const head = tx.objectStore("history").get(ownerId);
      let blocks = null;
      head.onsuccess = () => {
        if (!head.result?.chunked) return;
        blocks = [];
        const store = tx.objectStore("historyChunks");
        for (const key of chunkKeys(ownerId, head.result.chunks)) {
          const one = store.get(key);
          one.onsuccess = () => { if (one.result) blocks.push(one.result); };
        }
      };
      tx.oncomplete = () => {
        const e = head.result;
        if (!e || e.erased) return resolve(null);
        if (!e.chunked) return resolve(Array.isArray(e.logs) ? { logs: e.logs, coverage: e.coverage, legacy: true } : null);
        // A missing block (storage cleared halfway) makes the copy partial, never silently complete.
        const parts = (blocks || []).filter((b) => b.i < e.chunks).sort((a, b) => a.i - b.i);
        const logs = parts.flatMap((b) => b.rows || []);
        const whole = parts.length === e.chunks;
        if (whole) written.set(ownerId, parts.map((b) => (b.rows || []).map(rowSig).join("|")));
        resolve({ logs, coverage: whole ? e.coverage : e.coverage && { ...e.coverage, complete: false, count: logs.length } });
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("STORAGE_ABORT"));
    });
  }
  async function put(item) {
    await writeForOwner(item.ownerId, "operations", (s) => s.put(item));
    await refresh(item.ownerId);
    return item;
  }
  async function remove(key, ownerId) {
    await transaction("readwrite", (s) => s.delete(key));
    await refresh(ownerId);
  }
  async function saveGuestSession(ownerId, log) {
    if (!String(ownerId).startsWith("guest_") || ownerId !== owner())
      throw new Error("Session locale non autorisée.");
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["history", "operations"], "readwrite"),
        history = tx.objectStore("history");
      const request = history.get(ownerId);
      request.onsuccess = () => {
        const logs = request.result?.logs || [];
        history.put({
          ownerId,
          logs: [...logs.filter((l) => l.id !== log.id), log],
        });
        tx.objectStore("operations").delete(
          `${ownerId}:${log.client_event_id || log.details?.client_event_id || log.id}`,
        );
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("STORAGE_ABORT"));
    });
    await refresh();
    return log;
  }
  async function migrate() {
    const raw = localStorage.getItem("titan_pending_training_logs_v1");
    if (!raw) return refresh();
    const old = JSON.parse(raw);
    if (!Array.isArray(old)) throw new Error("LEGACY_QUEUE_INVALID");
    for (const item of old) {
      const id = item.payload?.details?.client_event_id || crypto.randomUUID();
      const ownerId = item.ownerId || "unassigned";
      const key = `${ownerId}:${item.key || id}`;
      const found = await transaction("readonly", (s) => s.get(key));
      if (!found) {
        try {
          await put({
            ...item,
            key,
            ownerId,
            status: "pending",
            payload: {
              ...item.payload,
              details: { ...item.payload.details, client_event_id: id },
            },
          });
        } catch (error) {
          if (error?.code !== "TRAINING_OWNER_ERASED") throw error;
        }
      }
    }
    localStorage.removeItem("titan_pending_training_logs_v1");
    return refresh();
  }
  root.TitanQueue = {
    refresh,
    put,
    remove,
    migrate,
    deleteOwner: async (ownerId) => {
      root.titanForgetOwnerDrafts(ownerId);
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["history", "historyChunks", "operations"], "readwrite");
        // Keep only the owner marker so older asynchronous writes cannot restore erased records.
        const head = tx.objectStore("history").get(ownerId);
        head.onsuccess = () => {
          for (const key of chunkKeys(ownerId, head.result?.chunks)) tx.objectStore("historyChunks").delete(key);
          tx.objectStore("history").put({ ownerId, erased: true });
        };
        written.delete(ownerId);
        const request = tx.objectStore("operations").openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (cursor.value.ownerId === ownerId) cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("STORAGE_ABORT"));
      });
      await refresh(ownerId);
    },
    /* V1.6.6: the copy keeps its coverage (js/core/history-window.js): complete or not, from which date, checked when. A write
       without one keeps the coverage this page holds for the owner (a correction does not change what the device covers). */
    saveHistory: (ownerId, logs, coverage) =>
      saveChunked(ownerId, logs, coverage === undefined ? root.titanHistoryCoverageOf?.(ownerId) ?? null : coverage),
    readHistory: async (ownerId) => (await readEntry(ownerId))?.logs || [],
    /** { logs, coverage } of the owner's copy, or null. A copy saved before V1.6.6 has no coverage: those were only ever written
        after a complete read, so it is a complete copy whose check date is unknown (the next refresh verifies it). */
    readHistoryEntry: async (ownerId) => {
      const e = await readEntry(ownerId);
      if (!e) return null;
      const coverage = e.coverage || (e.legacy && e.logs.length ? { complete: true, count: e.logs.length, total: null, oldest: null, newest: null, checkedAt: null, mode: "legacy" } : null);
      return { logs: e.logs, coverage };
    },
    list: () => cache.filter((x) => x.ownerId === owner()),
  };
  root.TitanQueue.saveGuestSession = saveGuestSession;
  root.titanGetPendingTrainingLogs = () => root.TitanQueue.list();
  root.titanExportPending = async () => {
    const entries = await refresh();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(entries, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "titan-seances-en-attente.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
})(typeof window !== "undefined" ? window : globalThis);
