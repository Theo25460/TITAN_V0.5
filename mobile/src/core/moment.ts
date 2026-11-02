/* The "moment" after a session, same rules as the website (js/app/moment.js): what was done, the records it set. */
import { Format, Insights, Progress, Sports, Training, type RecordEntry } from ".";
import type { TrainingLog } from "./types";

const idOf = (l: TrainingLog) => l.client_event_id || (l.details?.client_event_id as string | undefined) || l.id;

/** Up to five measured facts of the session, in the order the website shows them. */
export function sessionMetrics(log: TrainingLog): [string, string][] {
  const d = log.details || {};
  const out: [string, string][] = [];
  const minutes = Training.duration(log);
  if (log.unit === "km") {
    out.push(["Distance", Format.distance(Number(log.val))]);
    if (minutes) {
      out.push(["Durée", Format.clock(minutes)]);
      out.push(Sports.paceMode(log.sport) === "pace" ? ["Allure", Format.pace(Number(log.val), minutes)] : ["Vitesse", Format.speed(Number(log.val), minutes)]);
    }
    const gpx = d.gpxStats as { ascent?: number } | undefined;
    const elev = Number(d.elevation || gpx?.ascent);
    if (elev > 0) out.push(["Dénivelé", `+${Format.number(elev)} m`]);
  } else if (log.unit === "m") {
    out.push(["Distance", `${Format.number(Number(log.val))} m`]);
    if (minutes) {
      out.push(["Durée", Format.clock(minutes)]);
      const sec = Math.round((minutes * 60) / (Number(log.val) / 100));
      out.push(["Allure", `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} /100 m`]);
    }
  } else if (Array.isArray(d.exercises) && d.exercises.length) {
    const ex = d.exercises as { setRows?: unknown[]; sets?: number; volume?: number; totalReps?: number }[];
    const sets = ex.reduce((n, e) => n + (e.setRows?.length || Number(e.sets) || 0), 0);
    const volume = ex.reduce((n, e) => n + (Number(e.volume) || 0), 0);
    const reps = ex.reduce((n, e) => n + (Number(e.totalReps) || 0), 0);
    out.push(["Exercices", Format.number(ex.length)]);
    out.push(["Séries", Format.number(sets)]);
    if (volume > 0) out.push(["Volume", Format.weight(volume)]);
    else if (reps > 0) out.push(["Répétitions", Format.number(reps)]);
    if (minutes) out.push(["Durée", Format.duration(minutes)]);
  } else {
    if (minutes) out.push(["Durée", Format.duration(minutes)]);
    else out.push(["Valeur", `${Format.number(Number(log.val))} ${log.unit || ""}`.trim()]);
    const x = (d.extras || {}) as { max_done?: string; successful_routes?: number; attempts?: number };
    if (x.max_done) out.push(["Meilleure", x.max_done]);
    if (x.successful_routes !== undefined && Number.isFinite(Number(x.successful_routes))) out.push(["Réussites", x.attempts ? `${x.successful_routes}/${x.attempts}` : String(x.successful_routes)]);
  }
  const rpe = Number((d.bio as { rpe?: number } | undefined)?.rpe);
  if (rpe >= 1 && rpe <= 10) out.push(["Ressenti", `${rpe}/10`]);
  return out.slice(0, 5);
}

/** Records this very session set (or first reference marks for strength, climbing and timed efforts). */
export function sessionRecords(logs: TrainingLog[], log: TrainingLog, now = Date.now()): RecordEntry[] {
  const t = new Date(log.date).getTime();
  if (!Number.isFinite(t)) return [];
  return Progress.newRecords(logs, t, t + 1, now + 1000)
    .filter((r) => idOf(r.log) === idOf(log))
    .sort((a, b) => Number(a.kind === "duration") - Number(b.kind === "duration"))
    .slice(0, 3);
}

export const recordText = (r: RecordEntry, value: number | string = r.value) => Format.recordValue(r.unit, Number(value));

/** Sessions that hold one of the athlete's current records (one pass of the website's record rules). */
export function recordHolders(logs: TrainingLog[], now = Date.now()): Set<string> {
  const ids = new Set<string>();
  for (const r of Insights.records(Progress.activeLogs(logs, now), "all", now)) if (r.kind !== "duration") ids.add(r.log.id);
  return ids;
}
