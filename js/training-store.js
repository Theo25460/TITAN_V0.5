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
  root.TitanTraining = {
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
        !key.startsWith("titan_training_draft_") &&
        key !== "titan_pending_training_logs_v1"
      )
        localStorage.removeItem(key);
    }
    sessionStorage.clear();
  };
  if (!root.indexedDB) return;
  let connection,
    cache = [];
  const owner = () => root.state?.user?.id || "unassigned";
  const open = () =>
    connection ||
    (connection = new Promise((resolve, reject) => {
      const request = indexedDB.open("titan-training", 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("operations"))
          request.result.createObjectStore("operations", { keyPath: "key" });
        if (!request.result.objectStoreNames.contains("history"))
          request.result.createObjectStore("history", { keyPath: "ownerId" });
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
  async function refresh() {
    cache = (await transaction("readonly", (s) => s.getAll())) || [];
    root.dispatchEvent(new CustomEvent("titan:pending-changed"));
    return cache.filter((x) => x.ownerId === owner());
  }
  async function put(item) {
    await transaction("readwrite", (s) => s.put(item));
    await refresh();
    return item;
  }
  async function remove(key) {
    await transaction("readwrite", (s) => s.delete(key));
    await refresh();
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
      if (!found)
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
      const all = await transaction("readonly", (s) => s.getAll());
      for (const item of all.filter((i) => i.ownerId === ownerId))
        await remove(item.key);
      await transaction("readwrite", (s) => s.delete(ownerId), "history");
      localStorage.removeItem(`titan_training_draft_${ownerId}`);
    },
    saveHistory: (ownerId, logs) =>
      transaction("readwrite", (s) => s.put({ ownerId, logs }), "history"),
    readHistory: async (ownerId) =>
      (await transaction("readonly", (s) => s.get(ownerId), "history"))?.logs ||
      [],
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
