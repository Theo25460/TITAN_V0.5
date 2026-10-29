/* Session form → server payload. Port of js/app/seance.js build() and titanSanitizeSessionDetails() from the website,
   so a session recorded on Android has exactly the same shape as one recorded on titan-app.fr: same units, same
   val/val1/val2/duration fields, same exercise rows, same bounds. The server recomputes effort and rewards. */
import { Sports, type SportForm } from "./index";
import type { Exercise, SessionDetails, TrainingPayload } from "./types";

export type SetDraft = { weight: string; reps: string; rir: string; seconds: string };
export type ExerciseDraft = { name: string; variant: string; kind: "weighted" | "bodyweight" | "hold"; sets: SetDraft[] };
export type ClimbingDraft = { discipline: "Bloc" | "Voie"; location: "Salle" | "Extérieur"; system: string; belay: string; attempts: string; successes: string; best: string };

export type SessionDraft = {
  sport: string;
  when: "now" | "yesterday" | "other";
  date: string; // YYYY-MM-DD (local)
  time: string; // HH:MM (local)
  distance: string;
  meters: string;
  value: string;
  durH: string;
  durM: string;
  durS: string;
  elevation: string;
  pool: string;
  exercises: ExerciseDraft[];
  climbing: ClimbingDraft;
  rpe: number | null;
  note: string;
  gpx?: { movingMinutes: number | null; elapsedMinutes: number | null; ascent: number; descent: number; points: number } | null;
};

export const GRADE_SYSTEMS = { Bloc: ["Fontainebleau bloc", "V-scale bloc"], Voie: ["Français voie"] } as const;
export const BELAYS = ["Tête", "Moulinette", "Auto-assurage"] as const;
export const RPE_TEXT: Record<number, string> = { 1: "Très facile", 2: "Très facile", 3: "Facile", 4: "Facile", 5: "Modéré", 6: "Modéré", 7: "Difficile", 8: "Difficile", 9: "Très difficile", 10: "Maximal" };
export const COMMON_EXERCISES = ["Développé couché", "Squat", "Soulevé de terre", "Développé militaire", "Rowing barre", "Tractions", "Dips", "Fentes", "Presse à cuisses", "Hip thrust", "Tirage vertical", "Tirage horizontal", "Curl biceps", "Extension triceps", "Élévations latérales", "Leg curl", "Leg extension", "Mollets", "Pompes", "Gainage"];
export const COMMON_MOVES = ["Pompes", "Tractions", "Dips", "Squats", "Fentes", "Gainage (planche)", "Planche latérale", "Burpees", "Relevés de jambes", "Muscle-up", "Pistol squat", "L-sit", "Front lever", "Handstand"];

const pad = (n: number) => String(n).padStart(2, "0");
export const localDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function freshDraft(sport: string, now = new Date()): SessionDraft {
  const form = Sports.formOf(sport);
  return {
    sport,
    when: "now",
    date: localDateKey(now),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    distance: "",
    meters: "",
    value: "",
    durH: "",
    durM: "",
    durS: "",
    elevation: "",
    pool: "25",
    exercises: form === "strength" || form === "bodyweight" ? [emptyExercise(form === "bodyweight" ? "bodyweight" : "weighted")] : [],
    climbing: { discipline: "Bloc", location: "Salle", system: "Fontainebleau bloc", belay: "", attempts: "", successes: "", best: "" },
    rpe: null,
    note: "",
  };
}

export const emptySet = (): SetDraft => ({ weight: "", reps: "", rir: "", seconds: "" });
export const emptyExercise = (kind: ExerciseDraft["kind"] = "weighted"): ExerciseDraft => ({ name: "", variant: "", kind, sets: [emptySet()] });

/** French decimal input: "12,5" → 12.5; blank → null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

export function draftDuration(d: Pick<SessionDraft, "durH" | "durM" | "durS">): number | null {
  const total = (num(d.durH) || 0) * 60 + (num(d.durM) || 0) + (num(d.durS) || 0) / 60;
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

export function performedAt(d: SessionDraft, now = new Date()): Date | null {
  if (d.when === "now") return now;
  if (d.when === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const [hh, mm] = (d.time || "18:00").split(":").map(Number);
    y.setHours(Number.isFinite(hh) ? hh : 18, Number.isFinite(mm) ? mm : 0, 0, 0);
    return y;
  }
  const at = new Date(`${d.date}T${d.time || "12:00"}:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

function exercisesPayload(d: SessionDraft): Exercise[] {
  return d.exercises
    .filter((e) => e.name.trim())
    .map((e) => {
      const kind = e.kind || "weighted";
      const rows = e.sets
        .map((s) => ({ weight: num(s.weight) || 0, reps: num(s.reps), rir: num(s.rir), seconds: num(s.seconds) }))
        .filter((s) => (kind === "hold" ? (s.seconds || 0) > 0 : (s.reps || 0) > 0));
      return {
        name: e.name.trim(),
        variant: e.variant.trim(),
        kind,
        setRows: rows.map((r) => (kind === "hold" ? { weight: r.weight, seconds: r.seconds || 0, rir: null } : { weight: r.weight, reps: r.reps || 0, rir: r.rir })),
      };
    })
    .filter((e) => e.setRows.length);
}

export type BuildResult = { details: SessionDetails; errors: { message: string; field: string | null }[]; unit: string; val: number; at: Date | null; form: SportForm };

/** Same validation and same payload as the website form. */
export function buildSession(d: SessionDraft, now = new Date()): BuildResult {
  const sport = d.sport;
  const form = Sports.formOf(sport);
  const errors: BuildResult["errors"] = [];
  const fail = (message: string, field: string | null = null) => errors.push({ message, field });
  const dur = draftDuration(d);
  const at = performedAt(d, now);
  const data: SessionDetails = { note: d.note.trim(), tags: [], extras: {}, bio: d.rpe ? { rpe: d.rpe } : {} };
  if (!at) fail("Choisis une date valide.", "date");
  else if (at.getTime() > now.getTime() + 60000) fail("La date ne peut pas être dans le futur.", d.when === "other" ? "date" : "time");
  else data.performedAt = at.toISOString();
  if (dur !== null) {
    if (dur > 1440) fail("Une séance dure au maximum 24 h.", "duration");
    data.val2 = Math.round(dur * 100) / 100;
    data.duration = data.val2;
  }
  let unit = Sports.unitOf(sport);
  if (form === "distance") {
    const km = num(d.distance);
    if (!(km !== null && km > 0)) fail("Indique la distance.", "distance");
    else if (km > 300) fail("La distance d’une séance est limitée à 300 km.", "distance");
    data.val1 = km ?? undefined;
    const elev = num(d.elevation);
    if (elev !== null) data.elevation = Math.min(12000, Math.max(0, elev));
    if (d.gpx) {
      data.hasGpx = true;
      data.gpxStats = { movingMinutes: d.gpx.movingMinutes || 0, elapsedMinutes: d.gpx.elapsedMinutes || 0, ascent: d.gpx.ascent || 0, descent: d.gpx.descent || 0, points: d.gpx.points || 0 };
    }
  } else if (form === "swim") {
    const m = num(d.meters);
    if (!(m !== null && m > 0)) fail("Indique la distance nagée.", "meters");
    data.val1 = m ?? undefined;
    (data.extras as Record<string, unknown>).pool = d.pool;
  } else if (form === "strength") {
    data.exercises = exercisesPayload(d);
    if (!data.exercises.length && dur === null) fail("Ajoute au moins une série complète (exercice et répétitions), ou une durée.", "exercises");
    if (!data.exercises.length && dur !== null) {
      data.unitOverride = "min";
      data.val1 = dur;
    }
  } else if (form === "bodyweight") {
    data.exercises = exercisesPayload(d);
    const reps = data.exercises.filter((e) => e.kind !== "hold").reduce((n, e) => n + e.setRows.reduce((a, r) => a + (r.reps || 0), 0), 0);
    if (reps > 0) {
      data.val1 = reps;
      data.unitOverride = "reps";
    } else if (dur !== null) {
      data.val1 = dur;
      data.unitOverride = "min";
    } else fail("Ajoute des répétitions, des maintiens avec une durée, ou une durée.", "exercises");
  } else if (form === "climbing") {
    const c = d.climbing;
    if (dur === null) fail("Indique la durée de la séance.", "duration");
    data.unitOverride = "min";
    data.val1 = dur ?? undefined;
    const extras: Record<string, unknown> = { climbing_discipline: c.discipline, location: c.location, grade_system: c.system };
    if (c.discipline === "Voie" && c.belay) extras.belay = c.belay;
    const attempts = num(c.attempts);
    const successes = num(c.successes);
    if (attempts !== null) extras.attempts = Math.round(attempts);
    if (successes !== null) extras.successful_routes = Math.round(successes);
    if (successes !== null && attempts !== null && successes > attempts) fail("Les réussites ne peuvent pas dépasser les essais.", "climbing.successes");
    if (c.best.trim()) {
      if (!/^(V(B|\d{1,2})|[1-9][abc]?\+?)$/i.test(c.best.trim())) fail(`Cotation « ${c.best.trim()} » non reconnue pour ${c.system}.`, "climbing.best");
      else extras.max_done = c.best.trim();
    }
    data.extras = extras;
  } else {
    if (!["min", "h"].includes(unit)) {
      const v = num(d.value);
      if (!(v !== null && v > 0) && dur === null) fail("Indique une valeur ou une durée.", "value");
      if (v !== null && v > 0) data.val1 = v;
      else {
        data.unitOverride = "min";
        data.val1 = dur ?? undefined;
      }
    } else {
      if (dur === null) fail("Indique la durée de la séance.", "duration");
      data.val1 = dur ?? undefined;
      if (unit === "h" && dur) data.unitOverride = "min";
    }
  }
  unit = data.unitOverride || unit;
  let val = Number(data.val1) || 0;
  if (!val && data.exercises?.length) {
    const vol = data.exercises.reduce((n, e) => n + e.setRows.reduce((a, r) => a + (r.weight || 0) * (r.reps || 0), 0), 0);
    val = vol > 0 ? vol : data.exercises.reduce((n, e) => n + e.setRows.length, 0);
    if (!(vol > 0)) unit = "reps";
  }
  return { details: data, errors, unit, val, at, form };
}

/* ---------- Port of titanSanitizeSessionDetails (js/titan_features.js) ---------- */
// Website limits: 180 characters, 600 with TITAN+ (titan_features.js NOTE_LIMIT_STD / NOTE_LIMIT_ELITE).
export const noteLimit = (plus = false) => (plus ? 600 : 180);
const toNumber = (value: unknown, fallback = 0) => {
  const n = parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};
const optionalInt = (value: unknown, max: number) => {
  if (value === null || value === undefined || value === "" || !Number.isFinite(parseInt(String(value), 10))) return null;
  return Math.max(0, Math.min(parseInt(String(value), 10), max));
};

export function sanitizeExercises(exercises: unknown): Exercise[] {
  if (!Array.isArray(exercises)) return [];
  return exercises
    .slice(0, 80)
    .map((ex: Exercise) => {
      const setRows = Array.isArray(ex?.setRows)
        ? ex.setRows.slice(0, 30).map((set) => {
            const seconds = optionalInt(set?.seconds, 3600);
            const row: { weight: number; reps: number; rir: number | null; seconds?: number } = {
              weight: Math.max(0, Math.min(toNumber(set?.weight, 0), 1000)),
              reps: seconds ? 1 : Math.max(1, Math.min(parseInt(String(set?.reps || 0), 10) || 1, 500)),
              rir: optionalInt(set?.rir, 10),
            };
            if (seconds) row.seconds = seconds;
            return row;
          })
        : [];
      const sets = setRows.length || Math.max(0, Math.min(parseInt(String(ex?.sets || 0), 10) || 0, 100));
      const totalReps = setRows.length ? setRows.reduce((sum, s) => sum + s.reps, 0) : Math.max(0, Math.min(parseInt(String(ex?.totalReps || 0), 10) || 0, 50000));
      const volume = setRows.length ? setRows.reduce((sum, s) => sum + s.weight * s.reps, 0) : Math.max(0, Math.min(toNumber(ex?.volume, 0), 10000000));
      const kind = ["weighted", "bodyweight", "hold"].includes(String(ex?.kind)) ? (ex.kind as Exercise["kind"]) : "weighted";
      const clean: Exercise = {
        name: String(ex?.name || "").replace(/\s+/g, " ").trim().slice(0, 80),
        variant: String(ex?.variant || "").replace(/\s+/g, " ").trim().slice(0, 60),
        kind,
        weight: setRows.length ? Math.max(...setRows.map((s) => s.weight)) : Math.max(0, Math.min(toNumber(ex?.weight, 0), 1000)),
        sets,
        reps: setRows.length ? setRows[0].reps : Math.max(0, Math.min(parseInt(String(ex?.reps || 0), 10) || 0, 500)),
        rir: optionalInt((ex as { rir?: unknown })?.rir, 10),
        totalReps,
        volume,
        setRows,
        notes: String(ex?.notes || "").replace(/\s+/g, " ").trim().slice(0, 180),
      } as Exercise;
      if (kind === "hold") clean.holdSeconds = setRows.reduce((sum, s) => sum + (s.seconds || 0), 0);
      return clean;
    })
    .filter((ex) => ex.name && (ex.sets || 0) > 0 && (ex.reps || 0) > 0);
}

function sanitizeExtras(extras: unknown, sport: string): Record<string, unknown> {
  const raw = (extras && typeof extras === "object" ? extras : {}) as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  if (Sports.formOf(sport) === "climbing") {
    const selections: Record<string, string[]> = { climbing_discipline: ["Bloc", "Voie"], belay: [...BELAYS], location: ["Salle", "Extérieur"], grade_system: ["Français voie", "Fontainebleau bloc", "V-scale bloc"] };
    for (const [key, options] of Object.entries(selections)) if (options.includes(String(raw[key]))) clean[key] = raw[key];
    for (const key of ["attempts", "successful_routes"]) {
      const n = parseInt(String(raw[key]), 10);
      if (Number.isFinite(n)) clean[key] = Math.max(0, Math.min(n, 500));
    }
    for (const key of ["max_done", "max_tried"]) {
      const grade = String(raw[key] || "").trim().slice(0, 6);
      if (/^(V(B|\d{1,2})|[1-9][abc]?\+?)$/i.test(grade)) clean[key] = grade;
    }
  }
  if (Sports.formOf(sport) === "swim" && ["25", "50", "open"].includes(String(raw.pool))) clean.pool = String(raw.pool);
  return clean;
}

export function sanitizeDetails(details: SessionDetails, sport: string, now = Date.now(), plus = false): SessionDetails {
  const out: SessionDetails = { ...details };
  out.val1 = Math.max(0, Math.min(toNumber(details.val1, 0), 1000000));
  out.val2 = Math.max(0, Math.min(toNumber(details.val2, 0), 2880));
  out.elevation = Math.max(0, Math.min(toNumber(details.elevation, 0), 12000));
  out.exercises = sanitizeExercises(details.exercises);
  const at = new Date(details.performedAt || "");
  out.performedAt = Number.isFinite(at.getTime()) && at.getTime() <= now + 60000 ? at.toISOString() : "";
  out.note = String(details.note || "").replace(/\s+/g, " ").trim().slice(0, noteLimit(plus));
  out.tags = [];
  out.extras = sanitizeExtras(details.extras, sport);
  if (details.gpxStats) {
    const clamp = (v: unknown, max: number) => Math.max(0, Math.min(toNumber(v, 0), max));
    out.gpxStats = {
      movingMinutes: clamp(details.gpxStats.movingMinutes, 1440),
      elapsedMinutes: clamp(details.gpxStats.elapsedMinutes, 1440),
      ascent: clamp(details.gpxStats.ascent, 12000),
      descent: clamp(details.gpxStats.descent, 12000),
      points: Math.min(parseInt(String(details.gpxStats.points || 0), 10) || 0, plus ? 900 : 320),
    };
  }
  return out;
}

/** Final payload, identical to window.logActivity on the website. */
export function toPayload(build: BuildResult, sport: string, clientEventId: string, timezone: string, plus = false, now = Date.now()): TrainingPayload {
  const details = sanitizeDetails(build.details, sport, now, plus);
  const weighted = (details.exercises || []).reduce((n, e) => n + (Number(e.volume) || 0), 0);
  const reps = (details.exercises || []).reduce((n, e) => n + (Number(e.totalReps) || 0), 0);
  const value = Number(details.val1) || (weighted > 0 ? weighted : reps);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Renseigne une valeur supérieure à zéro.");
  details.client_event_id = clientEventId;
  details.schemaVersion = 2;
  details.timezone = timezone;
  if (build.details.unitOverride) details.unitOverride = build.details.unitOverride;
  if (!details.unitOverride && details.exercises?.length && !details.exercises.some((e) => Number(e.volume) > 0)) details.unitOverride = "reps";
  const conf = Sports.conf(sport);
  const date = details.performedAt || new Date(now).toISOString();
  return { sport, category: conf?.cat || "training", val: value, unit: details.unitOverride || conf?.unit || "", date, details };
}
