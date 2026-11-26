/* V1.6.3 — Contrôle et réconciliation. The official matrix of what each state of a session does in each view, and the controls
   that prove it, shared by the website and the Android app (copied unchanged by mobile/scripts/sync-web-core.mjs). Pure.
   It invents no rule: every cell reads the contract the view already applies.
   - journal and archives: a row is listed in the journal unless archived (js/state.js, mobile/src/data/hooks.ts useLogs);
   - period totals and records: TitanTraining.counted (js/training-store.js) — not archived, not held or refused by the server — then
     TitanProgress.summarize (minutes, km of sessions measured in km) and TitanInsights.records (with TitanTraining.plausible);
   - CSV: the journal rows with their state, the archives with « Archivée », never a refused entry (it has its own copy, V1.6.1);
   - JSON « toutes mes données »: export_own_data reads the server — confirmed rows, archived rows with archived_at, held rows, the
     correction history (trainingRevisions) and the import links (importedActivities). Nothing that is only on a device.
   A restored session is a confirmed one: same id, same canonical reference, revision + 1, no new reward (the server never credits a
   restore). The canonical reference of a session is its client_event_id (8 first characters shown), the same on every device. */
(function (root) {
  "use strict";
  const T = () => root.TitanTraining;
  const P = () => root.TitanProgress;
  const I = () => root.TitanInsights;
  const S = () => root.TitanSyncState;

  const STATES = {
    confirmed: "Confirmée",
    local: "Sur cet appareil",
    stored: "Sur cet appareil",
    sending: "Envoi en cours",
    pending: "En attente d’envoi",
    refused: "Refusée : à corriger",
    held: "En vérification",
    archived: "Archivée",
  };
  const ON_DEVICE = { journal: "journal", totals: true, records: true, csv: "journal", json: false };
  /** journal: where the row is listed; totals / records: counted; csv: which CSV carries it; json: in the server export. */
  const MATRIX = {
    confirmed: { journal: "journal", totals: true, records: true, csv: "journal", json: true },
    local: { ...ON_DEVICE, json: "device" },
    stored: ON_DEVICE,
    sending: ON_DEVICE,
    pending: ON_DEVICE,
    refused: { journal: "journal", totals: false, records: false, csv: null, json: false },
    held: { journal: "journal", totals: false, records: false, csv: "journal", json: true },
    archived: { journal: "archives", totals: false, records: false, csv: "archives", json: true },
  };
  const VIEWS = ["journal", "totals", "records", "csv", "json"];

  /** Sources whose later edits never come back: a replay of an import already received answers « duplicate » (titan_import_core). */
  const SOURCE_LIMITS = {
    garmin: "Garmin",
    health_connect: "Santé Connect",
    archive: "l’historique importé",
  };
  function sourceLimit(source) {
    const name = SOURCE_LIMITS[source];
    return name
      ? `Une modification faite ensuite dans ${name} ne revient pas dans TITAN : un import déjà reçu n’est pas relu. Corrige la séance ici, ta correction reste celle de ton compte.`
      : null;
  }

  const eventId = (log) => String(log?.client_event_id || log?.details?.client_event_id || log?.id || "");
  /** The canonical identity across devices and reloads: the client_event_id the server keeps (else the row id). */
  const canonicalId = (log) => eventId(log);
  const reference = (log) => eventId(log).slice(0, 8);

  const HELD = ["flagged", "pending_review"];
  function stateOf(log, { guest = false } = {}) {
    if (!log) return null;
    if (log.archived_at) return "archived";
    if (log.syncStatus === "error" || String(log.status || "") === "rejected") return "refused";
    if (log.is_suspicious || HELD.includes(String(log.status || ""))) return "held";
    const sync = S()?.stateOf ? S().stateOf({ log, guest }) : log.syncStatus === "confirmed" || !log.syncStatus ? "confirmed" : "stored";
    return MATRIX[sync] ? sync : "confirmed";
  }
  const inView = (log, view, opts) => MATRIX[stateOf(log, opts)]?.[view] || false;

  /** Server rows + this device's provisional entries, one entry per canonical id (the server row wins), as both clients split them. */
  function split(confirmed = [], provisional = []) {
    const seen = new Set();
    const rows = [];
    for (const l of confirmed) {
      const id = canonicalId(l);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push({ ...l, syncStatus: l.syncStatus || "confirmed" });
    }
    for (const l of provisional) {
      const id = canonicalId(l);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push(l);
    }
    const byDate = (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime();
    return { logs: rows.filter((l) => !l.archived_at).sort(byDate), archived: rows.filter((l) => l.archived_at).sort(byDate) };
  }

  const round1 = (n) => Math.round(n * 10) / 10;
  /** Period totals as the progress views compute them (activeLogs → summarize), between two instants. */
  function period(logs, { from = -Infinity, to = Infinity, now = Date.now() } = {}) {
    const list = P().activeLogs(logs, now).filter((l) => {
      const t = new Date(l.date).getTime();
      return t >= from && t < to;
    });
    const s = P().summarize(list);
    return { sessions: s.sessions, minutes: s.minutes, km: round1(s.distance) };
  }

  /** Records as the records views compute them, each pointing at the canonical reference of its session. */
  function records(logs, now = Date.now()) {
    return I()
      .records(logs, "all", now)
      .map((r) => ({ id: r.id, value: r.value, ref: reference(r.log) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  const CSV_HEAD = ["Date", "Sport", "Valeur", "Unité", "Durée (min)", "Ressenti (1–10)", "Note", "État", "Référence"];
  /** The CSV rows of a scope: "journal" (listed, not archived), "archives", or "all" (journal then archives). */
  function csvRows(logs, scope = "journal", { guest = false, label = (sport) => sport } = {}) {
    const keep = (l) => {
      const c = inView(l, "csv", { guest });
      return scope === "all" ? !!c : c === scope;
    };
    return (logs || [])
      .filter(keep)
      .map((l) => [
        l.date,
        label(l.sport),
        l.val,
        l.unit,
        T().duration(l) ?? "",
        l.details?.bio?.rpe ?? "",
        l.details?.note || "",
        STATES[stateOf(l, { guest })],
        reference(l),
      ]);
  }

  /** The figures checked after each mutation. `serverRows` is what export_own_data would return (rows the server holds). */
  function controls(logs, { now = Date.now(), from = -Infinity, to = Infinity, guest = false, serverRows = null } = {}) {
    const list = logs || [];
    const journal = list.filter((l) => inView(l, "journal", { guest }) === "journal");
    const archives = list.filter((l) => inView(l, "journal", { guest }) === "archives");
    const server = serverRows || list.filter((l) => inView(l, "json", { guest }) === true);
    return {
      journal: journal.length,
      archives: archives.length,
      period: period(list, { from, to, now }),
      records: records(list, now),
      csv: { journal: csvRows(list, "journal", { guest }).length, archives: csvRows(list, "archives", { guest }).length },
      json: { trainingLogs: server.length, archived: server.filter((l) => l.archived_at).length },
    };
  }

  /** Every difference between two control sets, as readable lines (the measure: number of gaps after each mutation). */
  function gaps(expected, actual, path = "") {
    if (expected === actual) return [];
    if (typeof expected === "number" && typeof actual === "number" && Math.abs(expected - actual) < 1e-9) return [];
    if (expected && actual && typeof expected === "object" && typeof actual === "object") {
      const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])];
      return keys.flatMap((k) => gaps(expected[k], actual[k], path ? `${path}.${k}` : k));
    }
    return [`${path || "valeur"} : attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`];
  }

  const minuteOf = (d) => {
    const t = new Date(d).getTime();
    return Number.isFinite(t) ? Math.floor(t / 60000) : null;
  };
  const durationOf = (l) => {
    const d = l?.details || {};
    const v = d.duration ?? d.val2;
    return v === null || v === undefined || v === "" ? null : Number(v);
  };
  const FIELDS = [
    { field: "val", label: "Valeur", read: (l) => (l?.val === undefined || l?.val === null ? null : Number(l.val)), unit: (l) => l?.unit || "" },
    { field: "date", label: "Date", read: (l) => minuteOf(l?.date) },
    { field: "duration", label: "Durée", read: durationOf, unit: () => "min" },
    { field: "note", label: "Note", read: (l) => String(l?.details?.note || "") },
    // V1.6.6: the positive elevation of a ride, a run or a hike (details.elevation), corrected like the other measures.
    { field: "elevation", label: "Dénivelé", read: (l) => (l?.details?.elevation === undefined || l?.details?.elevation === null || l?.details?.elevation === "" ? null : Number(l.details.elevation)), unit: () => "m" },
    { field: "archived", label: "Archive", read: (l) => !!l?.archived_at },
  ];
  /** What a correction, an archive or a restore changed between two states of the same session: [{ field, label, before, after }]. */
  function changes(before, after) {
    const out = [];
    for (const f of FIELDS) {
      const a = f.read(before);
      const b = f.read(after);
      if (a === b || (a === null && b === null)) continue;
      out.push({ field: f.field, label: f.label, before: a, after: b, unit: f.unit ? f.unit(after) : "" });
    }
    if (before && after && before.unit !== after.unit) out.push({ field: "unit", label: "Unité", before: before.unit, after: after.unit, unit: "" });
    return out;
  }

  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const fr = (n) => String(Math.round(n * 100) / 100).replace(".", ",");
  const at = (v) => {
    const t = typeof v === "number" ? v * 60000 : Date.parse(v);
    if (!Number.isFinite(t)) return "—";
    return new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  const VALUE_LABEL = { km: "Distance", m: "Distance", mi: "Distance", min: "Durée", h: "Durée", kg: "Volume", reps: "Répétitions" };
  /** One change in words, the same on the website and Android: « Distance : 10,4 → 10 km », « Archivée », « Restaurée ». */
  function changeText(c) {
    if (!c) return "";
    if (c.field === "archived") return c.after ? "Archivée" : "Restaurée";
    if (c.field === "note") return "Note modifiée";
    if (c.field === "date") return `Date : ${at(c.before)} → ${at(c.after)}`;
    if (c.field === "unit") return `Unité : ${c.before || "—"} → ${c.after || "—"}`;
    const shown = (v) => (num(v) === null ? "non renseignée" : fr(num(v)));
    if (c.field === "duration") return `Durée : ${shown(c.before)} → ${shown(c.after)} min`;
    if (c.field === "elevation") return `Dénivelé : ${num(c.before) === null ? "non renseigné" : fr(num(c.before))} → ${num(c.after) === null ? "non renseigné" : fr(num(c.after))} m`;
    return `${VALUE_LABEL[c.unit] || "Valeur"} : ${shown(c.before)} → ${shown(c.after)}${c.unit ? ` ${c.unit}` : ""}`;
  }

  const api = { version: 1, STATES, MATRIX, VIEWS, SOURCE_LIMITS, sourceLimit, canonicalId, reference, stateOf, inView, split, period, records, CSV_HEAD, csvRows, controls, gaps, changes, changeText };
  root.TitanLedger = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
