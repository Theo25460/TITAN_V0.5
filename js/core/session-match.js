/* V1.6.2 — Rapprochement des séances: the same words and rules in the website journal and in the Android app (copied unchanged by
   mobile/scripts/sync-web-core.mjs). Pure. It REUSES the V15 rule (js/core/sport-contracts.js: groups of neighbouring sport ids and
   « half of the shorter effort shared », read from the start and, for an old entry saved « now », from its end) and adds what V15 did
   not say: which two sources were compared, when each one says the effort happened, which fields diverge, and whether the decision is
   certain or must be confirmed by the athlete.

   Verdicts (one pair of entries):
   - « same »       the V15 rule matches and nothing contradicts it: the engine keeps ONE counted session;
   - « ambiguous »  the V15 rule matches but a fact disagrees (overlap below 80 %, duration or distance gap, several candidates):
                    still ONE counted session (no double count by default), shown « À vérifier » until the athlete decides;
   - « distinct »   different group, or less than half of the shorter effort shared: two sessions.
   Thresholds are the server's (private.titan_session_match_reasons, migration 20261130100100): tests/session-match.test.mjs checks
   that both carry the same numbers.

   Who provides each value (POLICY): the counted session is the journal entry. Its values, the athlete's note, felt effort, exercises,
   sport choice and every later correction are the athlete's and are never replaced by an import or by a replayed import. A value the
   counted entry lacks (no distance, no duration) is SHOWN from the other source, labelled with that source; it never enters totals,
   XP or records, which read the counted entry only. */
(function (root) {
  "use strict";
  const C = () => root.TitanSportContracts || (typeof require === "function" ? require("./sport-contracts.js") : null);

  const THRESHOLDS = Object.freeze({
    overlap: 0.5, // V15: share at least half of the shorter effort
    clearOverlap: 0.8, // below this share, the match is to be confirmed
    durationGap: 0.25, // relative gap of two known durations that makes a match uncertain
    distanceGap: 0.15, // relative gap of two known distances that makes a match uncertain
    showDurationMin: 3, // smaller duration gaps are not shown as divergences
    showDistanceGap: 0.03,
    showStartMin: 5,
  });

  const SOURCES = {
    manual: "Saisie manuelle",
    gpx: "Fichier GPX",
    gps: "GPS TITAN",
    live: "Séance live",
    health_connect: "Santé Connect",
    garmin: "Garmin",
    archive: "Historique importé",
  };

  const REASONS = {
    partial_overlap: "Les deux enregistrements ne se recouvrent qu’en partie.",
    duration_gap: "Les durées diffèrent nettement.",
    distance_gap: "Les distances diffèrent nettement.",
    several_candidates: "Plusieurs séances du journal correspondent à cet effort.",
  };

  const FILE_RULE = "Même fichier GPX déjà importé : le réimport garde le choix déjà fait.";
  const RULE = "Même famille de sport et au moins la moitié de l’effort le plus court en commun (règle V15).";

  const POLICY = Object.freeze([
    { field: "sport", from: "counted", text: "Le sport choisi dans la séance comptée." },
    { field: "start", from: "counted", text: "L’heure de la séance comptée ; celle de l’autre source est affichée en regard." },
    { field: "duration", from: "counted", fill: true, text: "La durée de la séance comptée ; si elle manque, celle de l’autre source est affichée, sans entrer dans les totaux." },
    { field: "distance", from: "counted", fill: true, text: "La distance de la séance comptée ; si elle manque, celle de l’autre source est affichée, sans entrer dans les totaux." },
    { field: "note", from: "counted", text: "Ta note, ton ressenti et tes corrections sont conservés : aucun import ni réimport ne les remplace." },
  ]);

  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

  /** A distance in kilometres from a value and its unit (km, m, mi); null when unknown. */
  function toKm(val, unit) {
    const v = num(val);
    if (v === null || v <= 0) return null;
    const u = String(unit || "km").toLowerCase();
    if (u === "km") return v;
    if (u === "m") return v / 1000;
    if (u === "mi" || u === "miles") return v * 1.609344;
    return null;
  }

  /** Duration in minutes a journal entry really states (null when unknown, never the 30-minute assumption). */
  function knownMinutes(l) {
    const d = l?.details || {};
    for (const v of [d.duration, d.val2, d.gpxStats?.movingMinutes, l?.unit === "min" ? l.val : null, l?.unit === "h" ? num(l?.val) * 60 : null]) {
      const n = num(v);
      if (n !== null && n > 0) return n;
    }
    return null;
  }

  /** The source of a journal entry. `imports` are the server rows of titan_session_matches_v1 for this account (optional). */
  function sourceOf(l, imports) {
    const id = l?.id;
    const own = (imports || []).find((i) => i && i.status === "imported" && id && i.log_id === id);
    if (own) return own.source;
    const d = l?.details || {};
    if (d.import_source && SOURCES[d.import_source]) return d.import_source;
    if (d.live) return "live";
    if (d.gpxStats?.source === "gpx_import" || d.gpxFingerprint) return "gpx";
    if (d.hasGpx) return "gps";
    return "manual";
  }

  /** The facts of one entry, whatever its origin: a journal row, a server import row, or a draft about to be saved. */
  function facts(x, imports) {
    if (!x) return null;
    if (x.started_at !== undefined && x.source && !x.details) {
      // A server import row (titan_session_matches_v1): what the source said, kept even when the import was linked.
      return {
        kind: "import", id: `${x.source}:${x.external_id || x.ref || ""}`, source: x.source, sport: x.sport,
        start: x.started_at ? new Date(x.started_at).getTime() : NaN, minutes: num(x.duration_minutes), km: num(x.distance_km),
        savedAt: x.imported_at ? new Date(x.imported_at).getTime() : null, note: "", user: false,
      };
    }
    const d = x.details || {};
    const unknown = d.extras?.distance_unknown === true;
    const km = unknown ? null : toKm(x.val, x.unit) ?? num(d.gpxStats?.distanceKm) ?? (num(x.km) !== null ? num(x.km) : null);
    return {
      kind: "log", id: String(x.client_event_id || d.client_event_id || x.id || ""), logId: x.id || null, source: x.source || sourceOf(x, imports),
      sport: x.sport, start: new Date(x.date).getTime(), minutes: knownMinutes(x) ?? num(x.minutes), km,
      savedAt: x.created_at ? new Date(x.created_at).getTime() : null, note: String(d.note || ""), user: true,
      corrected: num(x.revision) > 0, fingerprint: d.gpxFingerprint || null, match: d.match || null, raw: x,
    };
  }

  /** The athlete already said these two entries are two different efforts (decision kept in the entry, Web and Android). */
  function declaredDistinct(a, b) {
    const ids = (f) => [f?.id, f?.logId].filter(Boolean).map(String);
    const said = (f, other) => {
      const list = f?.match?.distinct_from;
      return Array.isArray(list) && ids(other).some((id) => list.map(String).includes(id));
    };
    return said(a, b) || said(b, a);
  }

  /** Compare two entries. `others` is the number of OTHER journal entries the same rule also matches (several_candidates). */
  function compare(aIn, bIn, opts = {}) {
    const a = aIn?.kind ? aIn : facts(aIn, opts.imports);
    const b = bIn?.kind ? bIn : facts(bIn, opts.imports);
    const sc = C();
    const out = { verdict: "distinct", rule: null, reasons: [], sharedMinutes: 0, overlap: 0, divergences: [], a, b };
    if (!a || !b || !Number.isFinite(a.start) || !Number.isFinite(b.start)) return out;
    if (declaredDistinct(a, b)) return { ...out, rule: "Tu as indiqué que ce sont deux séances distinctes.", decided: true };
    if (a.fingerprint && b.fingerprint && a.fingerprint === b.fingerprint)
      return { ...out, verdict: "same", rule: FILE_RULE, sharedMinutes: a.minutes || b.minutes || 0, overlap: 1, divergences: diverge(a, b) };
    if (sc.dedupeGroup(a.sport) !== sc.dedupeGroup(b.sport)) return out;
    if (Math.abs(a.start - b.start) > 86400000) return out;
    const am = a.minutes || 30, bm = b.minutes || 30;
    // V15 reading of the journal entry (start, and end for an old entry saved « now »), applied to the other entry.
    const journal = b.kind === "log" ? b : a, other = journal === b ? a : b;
    const row = journal.raw || { date: new Date(journal.start).toISOString(), details: { duration: journal.minutes }, unit: "min", val: journal.minutes };
    const shared = sc.sharedMinutes({ date: new Date(other.start).toISOString(), minutes: other === a ? am : bm }, row);
    const shorter = Math.min(am, bm);
    out.sharedMinutes = Math.round(shared * 10) / 10;
    out.overlap = shorter > 0 ? Math.min(1, shared / shorter) : 0;
    if (shared < THRESHOLDS.overlap * shorter) return out;
    out.rule = RULE;
    out.divergences = diverge(a, b);
    const reasons = [];
    if (out.overlap < THRESHOLDS.clearOverlap) reasons.push("partial_overlap");
    if (a.minutes && b.minutes && Math.abs(a.minutes - b.minutes) / Math.max(a.minutes, b.minutes) > THRESHOLDS.durationGap) reasons.push("duration_gap");
    if (a.km && b.km && Math.abs(a.km - b.km) / Math.max(a.km, b.km) > THRESHOLDS.distanceGap) reasons.push("distance_gap");
    if (opts.others > 0) reasons.push("several_candidates");
    out.reasons = reasons;
    out.verdict = reasons.length ? "ambiguous" : "same";
    return out;
  }

  const hm = (t) => {
    if (!Number.isFinite(t)) return "—";
    const d = new Date(t);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };
  const dayTime = (t) => {
    if (!Number.isFinite(t)) return "—";
    const d = new Date(t);
    return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} à ${hm(t)}`;
  };
  const km = (v) => (v === null || v === undefined ? "—" : `${(Math.round(v * 100) / 100).toLocaleString("fr-FR")} km`);
  const min = (v) => {
    if (v === null || v === undefined) return "—";
    const m = Math.round(v);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
  };
  const sportLabel = (id) => root.TitanSports?.label?.(id) || root.TitanSportsCatalog?.label?.(id) || String(id || "");

  /** The fields that differ between two entries, in words (distance compared in km whatever the unit each source used). */
  function diverge(a, b) {
    const out = [];
    if (a.sport !== b.sport) out.push({ field: "sport", label: "Sport", a: sportLabel(a.sport), b: sportLabel(b.sport) });
    if (Math.abs(a.start - b.start) >= THRESHOLDS.showStartMin * 60000) out.push({ field: "start", label: "Début", a: dayTime(a.start), b: dayTime(b.start) });
    if (a.minutes && b.minutes && Math.abs(a.minutes - b.minutes) >= THRESHOLDS.showDurationMin) out.push({ field: "duration", label: "Durée", a: min(a.minutes), b: min(b.minutes) });
    if (a.km && b.km && Math.abs(a.km - b.km) / Math.max(a.km, b.km) >= THRESHOLDS.showDistanceGap) out.push({ field: "distance", label: "Distance", a: km(a.km), b: km(b.km) });
    if (!a.km !== !b.km) out.push({ field: "distance", label: "Distance", a: km(a.km), b: km(b.km), missing: true });
    return out;
  }

  /** Best candidate for a new entry among journal entries, with its verdict; null when nothing matches. */
  function classify(candidate, logs, opts = {}) {
    const cand = candidate?.kind ? candidate : facts(candidate, opts.imports);
    if (!cand) return null;
    const pool = (logs || []).filter((l) => l && !l.archived_at && String(l.client_event_id || l.details?.client_event_id || l.id) !== cand.id);
    const hits = [];
    for (const l of pool) {
      const m = compare(cand, facts(l, opts.imports), opts);
      if (m.verdict !== "distinct") hits.push(m);
    }
    if (!hits.length) return null;
    const sameFile = (m) => (m.rule === FILE_RULE ? 1 : 0);
    hits.sort((x, y) => sameFile(y) - sameFile(x) || y.sharedMinutes - x.sharedMinutes);
    const best = hits[0];
    // A GPX file already imported is the same file, whatever else matches.
    if (sameFile(best)) return best;
    return hits.length > 1 ? compare(cand, best.b, { ...opts, others: hits.length - 1 }) : best;
  }

  /** Who provides each value of the single counted entry (see POLICY). */
  function fields(counted, other) {
    const rows = [];
    const put = (field, label, c, o, fmt) => {
      const fill = (c === null || c === undefined || c === "") && o !== null && o !== undefined && o !== "";
      rows.push({ field, label, value: fmt(fill ? o : c), from: fill ? "other" : "counted", other: fmt(o), shownOnly: fill });
    };
    put("start", "Début", counted.start, other.start, dayTime);
    put("duration", "Durée", counted.minutes, other.minutes, min);
    put("distance", "Distance", counted.km, other.km, km);
    if (counted.note) rows.push({ field: "note", label: "Note", value: counted.note, from: "counted", other: "—", shownOnly: false });
    return rows;
  }

  /** A short reference of a GPX analysis: the same file imported again has the same one (replay keeps the earlier choice). */
  function gpxFingerprint(g) {
    if (!g || !g.start) return null;
    const t = new Date(g.start).getTime();
    if (!Number.isFinite(t)) return null;
    return `gpx:${Math.round(t / 1000)}:${Math.round((num(g.distanceKm) || 0) * 1000)}:${num(g.points) || num(g.cleanPoints) || 0}`;
  }

  /**
   * View of one link for the session sheet (Web and Android).
   * @param {object} imp server row of titan_session_matches_v1 (source, external_id, status, log_id, linked_log_id, split_log_id,
   *   sport, started_at, duration_minutes, distance_km, imported_at, needs_review, reasons, decision, decided_at, events)
   * @param {object} log the journal entry this sheet shows
   * @param {object[]} logs the account's journal (to find the other entry of a split)
   */
  function describe(imp, log, logs) {
    const label = SOURCES[imp?.source] || "Source importée";
    const imported = facts(imp);
    if (!imported || !Number.isFinite(imported.start)) {
      return { state: "unknown", title: `${label} : rapprochement ancien`, text: "Cet import date d’avant le détail des sources : réimporte-le pour afficher ses valeurs.", sources: [], rows: [], actions: [], reasons: [], events: [] };
    }
    const events = (imp.events || []).map((e) => ({ text: EVENT[e.action] || e.action, by: e.actor === "user" ? "toi" : "TITAN", at: dayTime(new Date(e.at).getTime()) }));
    const all = logs || [];
    const linkedLog = all.find((l) => l && l.id === (imp.linked_log_id || imp.log_id)) || (log && log.id === (imp.linked_log_id || imp.log_id) ? log : null);
    const journal = linkedLog ? facts(linkedLog) : log ? facts(log) : null;
    const m = journal ? compare(imported, journal) : { divergences: [], reasons: [], overlap: 0 };
    const reasons = (imp.reasons && imp.reasons.length ? imp.reasons : m.reasons || []).map((r) => REASONS[r] || r);
    const sources = [
      journal && { role: "journal", label: SOURCES[journal.source] || "Saisie manuelle", at: dayTime(journal.start), saved: journal.savedAt ? `Enregistrée ${dayTime(journal.savedAt)}` : "", duration: min(journal.minutes), distance: km(journal.km), note: journal.note },
      { role: "import", label, at: dayTime(imported.start), saved: imported.savedAt ? `Importée ${dayTime(imported.savedAt)}` : "", duration: min(imported.minutes), distance: km(imported.km), note: "" },
    ].filter(Boolean);
    const base = { sources, rows: journal ? fields(journal, imported) : [], divergences: m.divergences || [], rule: RULE, overlap: Math.round((m.overlap || 0) * 100), reasons, events, source: imp.source, ref: imp.external_id };
    if (imp.status === "linked") {
      const pending = imp.needs_review && !imp.decision;
      return {
        ...base, state: pending ? "review" : "linked", tone: pending ? "warn" : "ok",
        title: pending ? "À vérifier : même séance ?" : imp.decision === "same" ? "Même séance, confirmée par toi" : `Même séance que ${label}`,
        text: pending
          ? `TITAN a rattaché l’activité ${label} à cette séance, mais un indice ne concorde pas. Elle ne compte qu’une fois tant que tu n’as rien décidé.`
          : `L’activité ${label} a rejoint cette séance au lieu d’en créer une seconde : elle ne compte qu’une fois. Tes valeurs, ta note et tes corrections sont conservées.`,
        actions: pending ? [{ id: "same", label: "Oui, même séance" }, { id: "distinct", label: "Non, deux séances" }] : [{ id: "distinct", label: "Séparer en deux séances" }],
      };
    }
    if (imp.status === "imported" && imp.linked_log_id) {
      return {
        ...base, state: "split", tone: "ok", title: "Deux séances distinctes, choisi par toi",
        text: `L’activité ${label} est une séance à part, comptée séparément. Un nouvel import de la même activité garde ce choix.`,
        actions: [{ id: "same", label: "Annuler : c’était la même séance" }],
      };
    }
    return { ...base, state: "imported", tone: "ok", title: `Importée depuis ${label}`, text: "Cette séance vient de la source connectée ; aucune autre entrée du journal ne lui correspondait à l’import.", actions: [], rows: [] };
  }

  const EVENT = {
    linked: "rattachée automatiquement",
    flagged: "rattachée, à vérifier",
    confirmed: "même séance confirmée",
    split: "séparée en deux séances",
    rejoined: "réunie en une séance",
  };

  /** Totals of a journal (counted sessions only: never archived), to measure a gap before/after a decision. */
  function totals(logs) {
    let sessions = 0, minutes = 0, kmSum = 0;
    for (const l of logs || []) {
      if (!l || l.archived_at) continue;
      sessions++;
      const f = facts(l);
      minutes += f.minutes || 0;
      kmSum += f.km || 0;
    }
    return { sessions, minutes: Math.round(minutes * 10) / 10, km: Math.round(kmSum * 100) / 100 };
  }

  const api = { version: 1, THRESHOLDS, SOURCES, REASONS, POLICY, RULE, toKm, knownMinutes, sourceOf, facts, compare, classify, fields, describe, gpxFingerprint, totals, declaredDistinct };
  root.TitanSessionMatch = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
