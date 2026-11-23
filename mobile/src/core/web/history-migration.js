/* V1.6.4 — Migration de l’historique. Reading a history file into past sessions for the server batch import
   (titan_import_batch_rows_v1), shared by the website and the Android app (copied unchanged by mobile/scripts/sync-web-core.mjs). Pure.
   Two pilot formats:
   - « titan »: the TITAN export itself — the journal CSV of the website and of Android (TitanLedger.CSV_HEAD, « ; », BOM) or the
     trainingLogs of « Exporter toutes mes données » (JSON);
   - « csv »: the documented CSV profile « TITAN historique v1 » (docs/V164_MIGRATION_HISTORIQUE.md), any column order, French or
     English headers, with a column mapping the athlete can change; the activities.csv of a Strava archive is a preset of it.
   Nothing is guessed: a row whose date, duration or sport cannot be read is left out with a reason the athlete can act on, and an
   unknown sport waits for the athlete to classify it. The server stays the authority (history only, journal rules, deduplication). */
(function (root) {
  "use strict";
  const Sp = () => root.TitanSports || (typeof require === "function" ? require("./sports.js") : null);
  const Mt = () => root.TitanSessionMatch || (typeof require === "function" ? require("./session-match.js") : null);
  const Lg = () => root.TitanLedger || (typeof require === "function" ? require("./history-ledger.js") : null);

  const DAY = 86400000;
  const LIMITS = Object.freeze({ historyDays: 30, minMinutes: 1, maxMinutes: 1440, maxKm: 1000, minYear: 1990, noteMax: 500, batchSize: 100, maxRows: 20000, maxBytes: 20 * 1024 * 1024 });

  const FORMATS = Object.freeze({
    titan_csv: "Export TITAN (CSV du journal)",
    titan_json: "Export TITAN (toutes mes données, JSON)",
    csv_profile: "CSV « TITAN historique v1 »",
    strava_csv: "Strava (activities.csv, profil CSV)",
  });

  /** Why a row is left out: the same codes on the server (titan_import_batch_rows_v1) and in the report. */
  const REASONS = Object.freeze({
    unknown_sport: "Sport à classer : choisis le sport TITAN correspondant ou ignore-le.",
    sport_ignored: "Sport que tu as choisi d’ignorer.",
    invalid_date: "Date ou heure illisible.",
    missing_time: "Heure de début absente : TITAN en a besoin pour reconnaître une séance déjà au journal.",
    invalid_duration: "Durée absente ou hors de 1 min à 24 h.",
    invalid_distance: "Distance illisible ou au-delà de 1 000 km.",
    recent: "Séance des 30 derniers jours : ajoute-la via Santé Connect ou à la main (l’historique importé ne donne pas d’XP).",
    future: "Date dans le futur.",
    too_old: "Date avant 1990.",
    archived_in_export: "Séance archivée dans l’export : elle reste hors du journal.",
    duplicate_in_file: "Même identifiant qu’une ligne plus haut dans le fichier.",
    empty: "Ligne vide.",
    server_invalid: "Refusée par le serveur (valeurs hors des règles du journal).",
    server_busy: "Séance du journal en cours de modification : relance l’import pour cette ligne.",
  });
  const OUTCOMES = Object.freeze({ added: "Ajoutée", linked: "Associée à une séance du journal", duplicate: "Déjà importée", skipped: "Ignorée" });

  /** What the TITAN export carries, and what a reimport reproduces (the proof compares exactly these). */
  const FIELDS = Object.freeze([
    { column: "Date", json: "date", reimport: true, to: "date (à la seconde, fuseau de l’export)" },
    { column: "Sport", json: "sport", reimport: true, to: "sport (libellé ou identifiant du catalogue)" },
    { column: "Valeur", json: "val", reimport: true, to: "valeur (km, m, kg, répétitions ou minutes selon l’unité)" },
    { column: "Unité", json: "unit", reimport: true, to: "unité (km et m gardés ; mi converti en km)" },
    { column: "Durée (min)", json: "details.duration", reimport: true, to: "durée, obligatoire" },
    { column: "Ressenti (1–10)", json: "details.bio.rpe", reimport: true, to: "ressenti" },
    { column: "Note", json: "details.note", reimport: true, to: "note (500 caractères au plus)" },
    { column: "État", json: "archived_at", reimport: "read", to: "lue : une ligne « Archivée » n’est pas importée" },
    { column: "Référence", json: "client_event_id", reimport: "provenance", to: "identifiant d’import (la séance recréée a sa propre référence)" },
    { column: null, json: "details.exercises, details.extras, gpxPath, details.match", reimport: false, to: "non exportés par le CSV ; le JSON les a mais l’import ne les relit pas" },
    { column: null, json: "xp, crédits, récompenses", reimport: false, to: "jamais repris : une séance d’historique compte 0 XP (règle serveur)" },
  ]);

  /** Strava activity types (English export) to TITAN sport ids; only ids present in the catalogue are kept. */
  const STRAVA_TYPES = Object.freeze({
    run: "running", "trail run": "trail", "virtual run": "running", walk: "walking", hike: "hiking", ride: "cycling", "virtual ride": "cycling",
    "gravel ride": "gravel", "mountain bike ride": "mountain_bike", "e-bike ride": "cycling", "e-mountain bike ride": "mountain_bike", swim: "swimming",
    "weight training": "muscu_gym", workout: "hiit", crossfit: "crossfit", hiit: "hiit", yoga: "yoga", pilates: "pilates", "rock climbing": "climbing_route",
    rowing: "rowing", "virtual row": "rowing_machine", "alpine ski": "alpine_skiing", "backcountry ski": "alpine_skiing", "nordic ski": "cross_country_skiing",
    snowboard: "snowboard", snowshoe: "snowshoeing", "ice skate": "ice_skating", "inline skate": "roller", skateboard: "skateboarding", kayaking: "kayak",
    canoeing: "kayak", "stand up paddling": "paddle", surfing: "surfing", kitesurf: "kitesurf", windsurf: "windsurf", sail: "sailing", elliptical: "elliptical",
    stairstepper: "stair_climbing", golf: "golf", tennis: "tennis", padel: "padel", squash: "squash", badminton: "badminton", "table tennis": "table_tennis",
    soccer: "football", football: "football", basketball: "basketball", volleyball: "volleyball", handball: "handball", rugby: "rugby", boxing: "boxing",
    dance: "dance", "nordic walk": "nordic_walk",
  });

  /* ---------- text helpers ---------- */
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
  const blank = (v) => v === null || v === undefined || String(v).trim() === "";

  /** RFC 4180 CSV, delimiter detected on the header line (« ; » of the TITAN export, « , », tab), BOM removed. */
  function parseCsv(text) {
    const src = String(text ?? "").replace(/^﻿/, "");
    const firstLine = src.split(/\r?\n/, 1)[0] || "";
    const count = (ch) => { let n = 0, q = false; for (const c of firstLine) { if (c === '"') q = !q; else if (!q && c === ch) n++; } return n; };
    const delim = [";", ",", "\t"].sort((a, b) => count(b) - count(a))[0];
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quoted) {
        if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && src[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    // The TITAN export protects a cell starting with = + - @ by a leading apostrophe (js/session-export.js escapeCell).
    return { delim, rows: rows.map((r) => r.map((x) => (/^'[=+@\-\t\r\n]/.test(x) ? x.slice(1) : x))) };
  }

  /** « 10,5 », « 1 234,5 », « 1,234.5 », « 10.5 » → number; null when unreadable. */
  function parseNumber(raw) {
    if (blank(raw)) return null;
    let s = String(raw).replace(/[\s  ]/g, "");
    if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else s = s.replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /** A duration in minutes: « 1:02:03 », « 1:05 » (h:mm), « 1h02 », « 62 min », « 3723 s », or a plain number in `unit` (min, s, h). */
  function parseDuration(raw, unit = "min") {
    if (blank(raw)) return null;
    const s = norm(raw).replace(",", ".");
    let m = /^(\d+):(\d{1,2}):(\d{1,2})(\.\d+)?$/.exec(s);
    if (m) return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60;
    m = /^(\d+):(\d{1,2})$/.exec(s);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    m = /^(\d+(?:\.\d+)?)\s*h(?:eures?)?\s*(?:(\d{1,2})\s*(?:min|mn|m)?)?\s*(?:(\d{1,2})\s*s)?$/.exec(s);
    if (m) return Number(m[1]) * 60 + Number(m[2] || 0) + Number(m[3] || 0) / 60;
    m = /^(\d+(?:\.\d+)?)\s*(s|sec|secondes?|min|mn|minutes?|h)$/.exec(s);
    if (m) return m[2] === "h" ? Number(m[1]) * 60 : /^s/.test(m[2]) ? Number(m[1]) / 60 : Number(m[1]);
    const n = parseNumber(raw);
    if (n === null) return null;
    return unit === "s" ? n / 60 : unit === "h" ? n * 60 : n;
  }

  const UNIT_WORDS = { km: "km", kms: "km", kilometre: "km", kilometres: "km", kilometer: "km", kilometers: "km", m: "m", metre: "m", metres: "m", meter: "m", meters: "m", mi: "mi", mile: "mi", miles: "mi", kg: "kg", reps: "reps", rep: "reps", repetitions: "reps", min: "min", minutes: "min" };
  const unitWord = (raw) => UNIT_WORDS[norm(raw).replace(/\./g, "")] || null;
  const toKm = (v, unit) => (v === null ? null : unit === "m" ? v / 1000 : unit === "mi" ? v * 1.609344 : unit === "km" ? v : null);
  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

  /* ---------- dates and time zones ---------- */
  const fmtCache = {};
  function wallOf(ms, tz) {
    const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const p = {};
    for (const x of f.formatToParts(new Date(ms))) p[x.type] = Number(x.value);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  }
  /** A wall-clock time of `tz` to an instant. A time skipped by a summer-time change moves forward; a time repeated in autumn takes
      the first occurrence. Returns { ms, dst: null | "gap" | "repeated" }. */
  function zonedToUtc(y, mo, d, h, mi, s, tz) {
    const wall = Date.UTC(y, mo, d, h, mi, s);
    if (!tz || tz === "UTC") return { ms: wall, dst: null };
    try {
      const before = wallOf(wall - DAY / 2, tz) - (wall - DAY / 2);
      const after = wallOf(wall + DAY / 2, tz) - (wall + DAY / 2);
      const valid = [wall - before, wall - after].filter((t, i, all) => all.indexOf(t) === i && wallOf(t, tz) === wall);
      if (valid.length === 2) return { ms: Math.min(...valid), dst: "repeated" };
      if (valid.length === 1) return { ms: valid[0], dst: null };
      return { ms: wall - before, dst: "gap" };
    } catch {
      return { ms: new Date(y, mo, d, h, mi, s).getTime(), dst: null };
    }
  }

  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11, janv: 0, fevr: 1, fev: 1, mars: 2, avr: 3, mai: 4, juin: 5, juil: 6, aout: 7, sept: 8 };
  function parseTime(raw) {
    if (blank(raw)) return null;
    const m = /^(\d{1,2})\s*(?:[:h]\s*(\d{2}))?(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(String(raw).trim());
    if (!m || (m[2] === undefined && !m[4] && !/h/i.test(raw))) return null;
    let h = Number(m[1]);
    if (m[4]) h = (h % 12) + (/^p/i.test(m[4]) ? 12 : 0);
    const mi = Number(m[2] || 0), s = Number(m[3] || 0);
    return h < 24 && mi < 60 && s < 60 ? [h, mi, s] : null;
  }
  /** One date cell (+ optional time cell) to an instant. `zone` is "file" when the text carries its own offset or is UTC by format. */
  function parseDate(raw, timeRaw, { tz = "Europe/Paris", order = "dmy", utc = false, allowDateOnly = false } = {}) {
    if (blank(raw)) return { error: "invalid_date" };
    const s = String(raw).trim();
    // ISO with an offset or Z: exact instant.
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
      const t = Date.parse(s.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
      return Number.isFinite(t) ? { ms: t, zone: "file" } : { error: "invalid_date" };
    }
    // Strava « Nov 1, 2025, 7:42:13 AM » (UTC in the archive).
    let m = /^([A-Za-zéû]{3,5})\.? (\d{1,2}),? (\d{4}),? (\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?)$/i.exec(s);
    if (m) {
      const mo = MONTHS[norm(m[1]).slice(0, 4)] ?? MONTHS[norm(m[1]).slice(0, 3)];
      const t = parseTime(m[4]);
      if (mo === undefined || !t) return { error: "invalid_date" };
      return { ms: Date.UTC(Number(m[3]), mo, Number(m[2]), ...t), zone: "file" };
    }
    let y, mo, d, time = null;
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(s);
    if (m) { y = Number(m[1]); mo = Number(m[2]) - 1; d = Number(m[3]); time = m[4] ? parseTime(m[4]) : null; }
    else {
      m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(.+))?$/.exec(s);
      if (!m) return { error: "invalid_date" };
      const a = Number(m[1]), b = Number(m[2]);
      [d, mo] = order === "mdy" ? [b, a - 1] : [a, b - 1];
      y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
      time = m[4] ? parseTime(m[4]) : null;
    }
    if (!time && !blank(timeRaw)) time = parseTime(timeRaw);
    if (!blank(timeRaw) && !time) return { error: "invalid_date" };
    let dateOnly = false;
    if (!time) { if (!allowDateOnly) return { error: "missing_time" }; time = [12, 0, 0]; dateOnly = true; }
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return { error: "invalid_date" };
    const probe = new Date(Date.UTC(y, mo, d));
    if (probe.getUTCMonth() !== mo) return { error: "invalid_date" };
    if (utc) return { ms: Date.UTC(y, mo, d, ...time), zone: "file" };
    const z = zonedToUtc(y, mo, d, time[0], time[1], time[2], tz);
    return { ms: z.ms, zone: tz, dst: z.dst, dateOnly };
  }

  /* ---------- sports ---------- */
  let labelIndex = null;
  function sportIndex() {
    if (labelIndex) return labelIndex;
    const S = Sp();
    const idx = new Map();
    for (const s of S?.all?.() || []) {
      const conf = S.conf(s.id) || {};
      for (const name of [s.id, s.label, conf.label, conf.name, ...(S.aliasesOf?.(s.id) || [])]) {
        const k = norm(name);
        if (k && !idx.has(k)) idx.set(k, s.id);
      }
    }
    labelIndex = idx;
    return idx;
  }
  /** A sport cell to a TITAN sport id: the athlete's own choice first, then the catalogue (id, label, alias), then Strava types. */
  function resolveSport(raw, sportMap = {}) {
    const key = String(raw ?? "").trim();
    if (!key) return { id: null };
    if (Object.prototype.hasOwnProperty.call(sportMap, key)) return sportMap[key] === "skip" ? { id: null, ignored: true } : { id: sportMap[key], chosen: true };
    const S = Sp();
    if (S?.conf?.(key)) return { id: key };
    const k = norm(key);
    const strava = STRAVA_TYPES[k];
    if (strava && S?.conf?.(strava)) return { id: strava };
    const byLabel = sportIndex().get(k);
    return { id: byLabel || null };
  }

  /* ---------- column mapping of the CSV profile ---------- */
  const COLUMNS = Object.freeze({
    id: ["identifiant", "id", "activity id", "reference", "référence"],
    date: ["date", "jour", "activity date", "start date", "date de debut", "debut", "start time"],
    time: ["heure", "heure de debut", "time"],
    sport: ["sport", "activite", "activity type", "type", "discipline"],
    duration: ["duree", "duree (min)", "duree (s)", "duree (h)", "duration", "moving time", "temps", "elapsed time"],
    distance: ["distance", "distance (km)", "distance (m)", "distance (mi)", "distance km", "distance m", "distance mi"],
    unit: ["unite", "unit"],
    rpe: ["ressenti", "ressenti (1-10)", "ressenti (1–10)", "rpe", "perceived exertion"],
    note: ["note", "notes", "commentaire", "description", "activity description"],
  });
  const hintUnit = (head) => (/\(\s*m\s*\)|\bm$|metres|meters/.test(head) ? "m" : /\(\s*mi\s*\)|\bmi$|miles/.test(head) ? "mi" : "km");
  const hintDuration = (head) => (/\(\s*s\s*\)|seconde|moving time|elapsed time/.test(head) ? "s" : /\(\s*h\s*\)|heures/.test(head) ? "h" : "min");

  /** Which format a file is in, from its name and first bytes. */
  function detect(text, name = "") {
    const src = String(text ?? "").replace(/^﻿/, "").trimStart();
    if (src.startsWith("{") || src.startsWith("[")) return "titan_json";
    const head = parseCsv(src.split(/\r?\n/, 1)[0]).rows[0]?.map(norm) || [];
    const titan = (Lg()?.CSV_HEAD || []).map(norm);
    if (titan.length && titan.every((h) => head.includes(h))) return "titan_csv";
    if (head.includes("activity id") && head.includes("activity type")) return "strava_csv";
    return "csv_profile";
  }

  /** The column mapping of a header line ({ field: index }, -1 when absent) and the units its headers say. */
  function guessMapping(headRow, format = "csv_profile") {
    const head = headRow.map(norm);
    const find = (names) => head.findIndex((h) => names.includes(h));
    const map = {};
    for (const [field, names] of Object.entries(COLUMNS)) map[field] = find(names);
    if (format === "strava_csv") {
      const moving = head.indexOf("moving time"), elapsed = head.indexOf("elapsed time");
      const first = head.indexOf("distance"), last = head.lastIndexOf("distance");
      return { ...map, date: head.indexOf("activity date"), time: -1, sport: head.indexOf("activity type"), duration: moving >= 0 ? moving : elapsed, fallbackDuration: elapsed,
        durationUnit: "s", distance: last > first ? last : first, distanceUnit: last > first ? "m" : "km", unit: -1, id: head.indexOf("activity id"), utc: true };
    }
    if (format === "titan_csv") {
      const col = (name) => head.indexOf(norm(name));
      return { id: col("Référence"), date: col("Date"), time: -1, sport: col("Sport"), duration: col("Durée (min)"), durationUnit: "min", value: col("Valeur"), unit: col("Unité"),
        distance: -1, distanceUnit: "km", rpe: col("Ressenti (1–10)"), note: col("Note"), state: col("État") };
    }
    map.durationUnit = map.duration >= 0 ? hintDuration(head[map.duration]) : "min";
    map.distanceUnit = map.distance >= 0 ? hintUnit(head[map.distance]) : "km";
    return map;
  }

  const safeId = (s) => String(s).replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 100);

  /* ---------- one row to one item ---------- */
  function buildItem(src, ctx) {
    const { now, sportMap } = ctx;
    if (src.state && norm(src.state) === norm("Archivée")) return { reason: "archived_in_export" };
    const sp = resolveSport(src.sport, sportMap);
    if (!sp.id) return { reason: sp.ignored ? "sport_ignored" : "unknown_sport", sportRaw: String(src.sport ?? "").trim() || "?" };
    const when = src.ms !== undefined ? { ms: src.ms, zone: "file" } : parseDate(src.date, src.time, ctx);
    if (when.error) return { reason: when.error, sport: sp.id };
    if (when.ms > now + 10 * 60000) return { reason: "future", sport: sp.id };
    if (when.ms < Date.UTC(LIMITS.minYear, 0, 1)) return { reason: "too_old", sport: sp.id };
    const S = Sp();
    const sportUnit = S?.unitOf?.(sp.id) || "min";
    // Value and unit (TITAN export), or a distance column (CSV profile).
    let unit = src.unit ? unitWord(src.unit) : null;
    let value = src.value !== undefined ? parseNumber(src.value) : null;
    let km = null;
    if (src.distance !== undefined && !blank(src.distance)) {
      const dUnit = (src.distanceUnit && unitWord(src.distanceUnit)) || ctx.distanceUnit || "km";
      const v = parseNumber(src.distance);
      if (v === null || v < 0) return { reason: "invalid_distance", sport: sp.id };
      km = v > 0 ? toKm(v, dUnit) : null;
      if (km === null && v > 0) return { reason: "invalid_distance", sport: sp.id };
    } else if (value !== null && ["km", "m", "mi"].includes(unit)) km = toKm(value, unit);
    if (km !== null && km > LIMITS.maxKm) return { reason: "invalid_distance", sport: sp.id };
    let minutes = parseDuration(src.duration, src.durationUnit || "min");
    if ((minutes === null || minutes <= 0) && src.fallbackDuration !== undefined) minutes = parseDuration(src.fallbackDuration, src.durationUnit || "min");
    if ((minutes === null || minutes <= 0) && unit === "min" && value !== null) minutes = value;
    if (minutes === null || minutes < LIMITS.minMinutes || minutes > LIMITS.maxMinutes) return { reason: "invalid_duration", sport: sp.id };
    if (now - when.ms < LIMITS.historyDays * DAY) return { reason: "recent", sport: sp.id };
    const item = { id: "", sport: sp.id, startedAt: new Date(when.ms).toISOString(), minutes: round(minutes, 1), km: null };
    if (km !== null && km > 0 && ["km", "m"].includes(sportUnit)) item.km = round(km, 3);
    // A sport measured in kg or repetitions keeps its value (TITAN export); minutes and distances are carried by minutes and km.
    if (value !== null && value > 0 && (unit === "kg" || unit === "reps") && unit === sportUnit) { item.value = round(value, 2); item.unit = unit; }
    const rpe = parseNumber(src.rpe);
    if (rpe !== null && Number.isInteger(rpe) && rpe >= 1 && rpe <= 10) item.rpe = rpe;
    const note = String(src.note ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
    if (note) item.note = note.slice(0, LIMITS.noteMax);
    return { item, sport: sp.id, dst: when.dst || null, chosen: !!sp.chosen };
  }

  function rowsFromJson(text) {
    let data;
    try { data = JSON.parse(String(text).replace(/^﻿/, "")); } catch { throw new Error("Ce fichier JSON est illisible."); }
    const list = Array.isArray(data) ? data : data?.trainingLogs || data?.data?.trainingLogs;
    if (!Array.isArray(list)) throw new Error("Ce JSON ne contient pas de séances (trainingLogs) d’un export TITAN.");
    return list.map((l) => {
      const d = l?.details || {};
      const ms = Date.parse(l?.date);
      const ref = String(l?.client_event_id || d.client_event_id || l?.id || "").slice(0, 8);
      return {
        ref, ms: Number.isFinite(ms) ? ms : undefined, date: l?.date, sport: l?.sport, value: l?.val, unit: l?.unit,
        duration: d.duration ?? d.val2 ?? (l?.unit === "min" ? l?.val : ""), durationUnit: "min", rpe: d.bio?.rpe, note: d.note,
        state: l?.archived_at ? "Archivée" : "",
      };
    });
  }

  /** Read a whole file. Returns the rows in file order (row = line number in the file, header = line 1) and the sports to classify. */
  function parse(text, { format = null, name = "", mapping = null, tz = "Europe/Paris", order = null, allowDateOnly = false, sportMap = {}, distanceUnit = null, now = Date.now() } = {}) {
    const fmt = format || detect(text, name);
    let sources = [], head = [], map = null, lineOf = (i) => i + 2;
    if (fmt === "titan_json") {
      sources = rowsFromJson(text);
      lineOf = (i) => i + 1;
    } else {
      const csv = parseCsv(text);
      head = csv.rows[0] || [];
      map = { ...guessMapping(head, fmt), ...(mapping || {}) };
      if (map.date < 0 || map.sport < 0 || map.duration < 0 && map.value < 0) {
        const missing = [map.date < 0 && "date", map.sport < 0 && "sport", map.duration < 0 && "durée"].filter(Boolean).join(", ");
        const e = new Error(`Colonnes à indiquer : ${missing}.`);
        e.code = "MAPPING_REQUIRED";
        e.head = head;
        e.mapping = map;
        throw e;
      }
      const at = (r, i) => (i !== undefined && i >= 0 ? r[i] : undefined);
      const body = csv.rows.slice(1);
      // Day/month order: a first number above 12 anywhere proves « jour/mois », a second one above 12 proves « mois/jour ».
      let auto = order;
      if (!auto) {
        auto = "dmy";
        for (const r of body.slice(0, 2000)) {
          const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]/.exec(String(at(r, map.date) || "").trim());
          if (m && Number(m[1]) > 12) { auto = "dmy"; break; }
          if (m && Number(m[2]) > 12) { auto = "mdy"; break; }
        }
      }
      order = auto;
      sources = body.map((r) => (r.every((x) => !String(x).trim()) ? null : {
        ref: at(r, map.id), date: at(r, map.date), time: at(r, map.time), sport: at(r, map.sport), duration: at(r, map.duration),
        fallbackDuration: map.fallbackDuration >= 0 ? at(r, map.fallbackDuration) : undefined, durationUnit: map.durationUnit,
        value: at(r, map.value), unit: at(r, map.unit), distance: map.distance >= 0 ? at(r, map.distance) : undefined,
        distanceUnit: map.distance >= 0 && map.unit >= 0 && fmt !== "titan_csv" ? at(r, map.unit) : map.distanceUnit,
        rpe: at(r, map.rpe), note: at(r, map.note), state: at(r, map.state),
      }));
    }
    if (sources.length > LIMITS.maxRows) throw new Error(`Ce fichier a ${sources.length} lignes : TITAN en importe ${LIMITS.maxRows} au plus par lot. Découpe-le en plusieurs fichiers.`);
    const ctx = { now, sportMap, tz, order: order || "dmy", utc: !!map?.utc, allowDateOnly, distanceUnit };
    const seen = new Set();
    const unknownSports = {};
    const rows = sources.map((src, i) => {
      const row = lineOf(i);
      if (!src) return { row, status: "skip", reason: "empty" };
      const r = buildItem(src, ctx);
      if (!r.item) {
        if (r.reason === "unknown_sport") unknownSports[r.sportRaw] = (unknownSports[r.sportRaw] || 0) + 1;
        return { row, status: "skip", reason: r.reason, sport: r.sport || null, sportRaw: r.sportRaw };
      }
      const it = r.item;
      const t = Math.floor(Date.parse(it.startedAt) / 1000);
      const ref = safeId(src.ref ?? "");
      it.id = fmt === "titan_csv" || fmt === "titan_json" ? `titan-${ref || "x"}-${t}`
        : fmt === "strava_csv" ? `strava-${ref || `${t}-${it.sport}`}`
        : `csv-${ref || `${t}-${it.sport}`}`;
      if (seen.has(it.id)) return { row, status: "skip", reason: "duplicate_in_file", sport: it.sport };
      seen.add(it.id);
      return { row, status: "ready", item: it, dst: r.dst };
    });
    return { format: fmt, head, mapping: map, order: ctx.order, tz, rows, unknownSports, total: rows.length };
  }

  /* ---------- preview against the journal ---------- */
  /** What the server will most likely do with each ready row, from the journal this device holds and the rows above it in the file
      (same V15 rule as titan_import_core, js/core/session-match.js). « add », « link » (counted once) or « review » (counted once,
      flagged « À vérifier »). Skipped rows keep their reason. */
  function preview(parsed, logs = [], { imports = [] } = {}) {
    const M = Mt();
    const C = root.TitanSportContracts || (typeof require === "function" ? require("./sport-contracts.js") : null);
    const buckets = new Map();
    const keyOf = (sport, ms) => `${C.dedupeGroup(sport)}|${Math.floor(ms / DAY)}`;
    const put = (f) => {
      if (!Number.isFinite(f.start)) return;
      const k = keyOf(f.sport, f.start);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(f);
    };
    for (const l of logs || []) if (l && !l.archived_at) put(M.facts(l, imports));
    const counts = { add: 0, link: 0, review: 0, skip: 0, total: parsed.rows.length };
    const reasons = {};
    const out = parsed.rows.map((r) => {
      if (r.status !== "ready") {
        counts.skip++;
        reasons[r.reason] = (reasons[r.reason] || 0) + 1;
        return { ...r, plan: "skip" };
      }
      const it = r.item;
      const start = Date.parse(it.startedAt);
      const cand = { kind: "import", id: `archive:${it.id}`, source: "archive", sport: it.sport, start, minutes: it.minutes, km: it.km, savedAt: null, note: "", user: false };
      const day = Math.floor(start / DAY);
      const hits = [];
      for (const d of [day - 1, day, day + 1]) for (const f of buckets.get(`${C.dedupeGroup(it.sport)}|${d}`) || []) {
        const m = M.compare(cand, f);
        if (m.verdict !== "distinct") hits.push(m);
      }
      let plan = "add", match = null;
      if (hits.length) {
        hits.sort((x, y) => y.sharedMinutes - x.sharedMinutes);
        match = hits.length > 1 ? M.compare(cand, hits[0].b, { others: hits.length - 1 }) : hits[0];
        plan = match.verdict === "same" ? "link" : "review";
      }
      counts[plan]++;
      if (plan === "add") {
        // The session the server will create: a later row of the file on the same effort is linked to it.
        const pseudo = { id: `file:${r.row}`, client_event_id: `file:${r.row}`, sport: it.sport, date: it.startedAt, unit: "min", val: it.minutes,
          details: { duration: it.minutes }, created_at: new Date(start + 2 * DAY).toISOString() };
        put(M.facts(pseudo));
      }
      return { ...r, plan, with: match?.b?.raw ? { id: match.b.logId, date: match.b.raw.date, sport: match.b.sport, inFile: String(match.b.id).startsWith("file:") } : null, reasons: match?.reasons || [] };
    });
    return { counts, reasons, rows: out };
  }

  /* ---------- batches ---------- */
  /** Same file, same identity on every device: FNV-1a 64-bit of the text (normalised line ends, BOM removed). */
  function fileHash(text) {
    const s = String(text ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
      h2 ^= h2 >>> 15;
    }
    return h1.toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  }

  /** What is sent for each row: the item, or the reason it is left out (so the server report explains every line). */
  function payload(r) {
    if (r.status === "ready") return { row: r.row, ...r.item };
    return { row: r.row, skip: r.reason };
  }
  /** The rows still to send after `nextRow` (rows are sent in file order; the server returns the next row it expects). */
  function chunks(parsed, nextRow = 0, size = LIMITS.batchSize) {
    const rest = parsed.rows.filter((r) => r.row >= nextRow).map(payload);
    return Array.from({ length: Math.ceil(rest.length / size) }, (_, i) => rest.slice(i * size, i * size + size));
  }

  /** The measure of a batch: share of lines imported or explained, duplicates, time to the final report. */
  function measure(batch) {
    const c = batch?.counts || {};
    const total = Number(batch?.total_rows) || 0;
    const explained = (c.added || 0) + (c.linked || 0) + (c.duplicate || 0) + (c.skipped || 0);
    const start = Date.parse(batch?.created_at), end = Date.parse(batch?.finished_at);
    return {
      total, explained, rate: total ? Math.round((explained / total) * 1000) / 10 : 0,
      duplicates: (c.linked || 0) + (c.duplicate || 0), review: c.review || 0,
      seconds: Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 1000) : null,
    };
  }

  /** The effects of withdrawing a batch (server preview), in words. */
  function withdrawText(p) {
    if (!p) return [];
    const n = (k) => Number(p[k]) || 0;
    const out = [];
    if (n("remove")) out.push(`${n("remove")} séance${n("remove") > 1 ? "s" : ""} ajoutée${n("remove") > 1 ? "s" : ""} par ce lot retirée${n("remove") > 1 ? "s" : ""} du journal.`);
    if (n("detach")) out.push(`${n("detach")} lien${n("detach") > 1 ? "s" : ""} vers des séances déjà au journal défait${n("detach") > 1 ? "s" : ""} : ces séances restent telles quelles.`);
    if (n("kept_corrected")) out.push(`${n("kept_corrected")} séance${n("kept_corrected") > 1 ? "s" : ""} que tu as corrigée${n("kept_corrected") > 1 ? "s" : ""} ou archivée${n("kept_corrected") > 1 ? "s" : ""} depuis l’import : gardée${n("kept_corrected") > 1 ? "s" : ""}.`);
    if (n("kept_linked")) out.push(`${n("kept_linked")} séance${n("kept_linked") > 1 ? "s" : ""} à laquelle une autre source s’est rattachée : gardée${n("kept_linked") > 1 ? "s" : ""}.`);
    if (n("kept_split")) out.push(`${n("kept_split")} séance${n("kept_split") > 1 ? "s" : ""} que tu as séparée${n("kept_split") > 1 ? "s" : ""} : gardée${n("kept_split") > 1 ? "s" : ""}.`);
    if (n("gone")) out.push(`${n("gone")} séance${n("gone") > 1 ? "s" : ""} déjà supprimée${n("gone") > 1 ? "s" : ""}.`);
    if (!out.length) out.push("Ce lot n’a rien ajouté à ton journal : le retirer ne change aucune séance.");
    return out;
  }

  /** The profile CSV of rows (documented columns), used for test files and the athlete's own template. */
  const PROFILE_HEAD = ["identifiant", "date", "heure", "sport", "durée", "distance", "unité", "ressenti", "note"];
  function profileCsv(list) {
    const cell = (v) => { const t = String(v ?? ""); return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    return [PROFILE_HEAD, ...list.map((r) => [r.id, r.date, r.time, r.sport, r.duration, r.distance, r.unit, r.rpe, r.note])].map((r) => r.map(cell).join(";")).join("\r\n");
  }

  const api = { version: 1, LIMITS, FORMATS, REASONS, OUTCOMES, FIELDS, STRAVA_TYPES, COLUMNS, PROFILE_HEAD, norm, parseCsv, parseNumber, parseDuration, parseTime, parseDate, zonedToUtc, resolveSport, detect, guessMapping, parse, preview, fileHash, payload, chunks, measure, withdrawText, profileCsv };
  root.TitanMigration = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
