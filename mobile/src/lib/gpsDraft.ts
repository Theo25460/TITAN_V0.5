import { GpsEngine, GpsSession, type GpsAnalysis } from "../core";
import { freshDraft, gpsDetails, type SessionDraft } from "../core/session";
import { analyseRecording, type Recording } from "./gpsRecorder";
import type { Summary } from "./gpsTrack";

const pad = (n: number) => String(n).padStart(2, "0");
const minutes = (seconds: number) => Math.round((seconds / 60) * 100) / 100;

/** What the session keeps of the recording (`details.gps`): the engine's digest, the laps of the structured session and the goal
    when there were any. Totals only: no position, no label typed by the athlete. */
export function gpsRecordDetails(r: Recording, a: GpsAnalysis): Record<string, unknown> | null {
  const plan = r.plan ? GpsSession.planSummary(r.plan.steps, r.plan.cursor) : null;
  const goal = r.goal ? GpsSession.goalProgress(r.goal, a, { now: a.end ?? undefined }) : null;
  return gpsDetails({
    ...GpsEngine.digest(a),
    ...(plan && plan.total ? { plan: { total: plan.total, done: plan.done, laps: plan.laps.map((l) => ({ k: l.kind, s: l.seconds, m: l.metres, ...(l.manual ? { x: 1 } : {}) })) } } : {}),
    // « Être rentré pour » is reached when the outing ended before the chosen hour.
    ...(r.goal && goal ? { goal: { ...r.goal, reached: r.goal.kind === "return" ? (a.end ?? Infinity) <= r.goal.at : goal.reached } } : {}),
  });
}

/** The form draft for a finished recording: the same fields a GPX import fills, so saving follows the usual,
    idempotent path (client event id, offline queue, server rules). Only totals are sent; the track stays on the phone.
    The duration is the EFFORT time of the engine (`effortS`): time in movement, or movement plus detected stops when the athlete
    turned automatic pause off. Pauses, interruptions and periods without a position are never in it: it is what the server
    reads (`gpx.movingMinutes`) to compute the XP. Callers that still hand over the older totals (`recorder.summary`) get the same
    draft: the recording is read again by the engine. */
export function draftFromRecording(r: Recording, given?: GpsAnalysis | Summary): SessionDraft {
  const a = given && "effortS" in given ? given : analyseRecording(r, Date.now());
  const start = new Date(a.firstFixAt ?? r.startedAt);
  const base = freshDraft(r.sport, start);
  const sec = a.effortS;
  return {
    ...base,
    when: "other",
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    distance: String(a.distanceKm).replace(".", ","),
    durH: sec >= 3600 ? String(Math.floor(sec / 3600)) : "",
    durM: sec > 0 ? String(Math.floor((sec % 3600) / 60)) : "",
    durS: sec % 60 ? String(sec % 60) : "",
    elevation: a.ascentM ? String(a.ascentM) : "",
    gpx: {
      movingMinutes: sec > 0 ? minutes(sec) : null,
      elapsedMinutes: a.elapsedS > 0 ? minutes(a.elapsedS) : null,
      // Null when the altitude is not reliable enough (as for a GPX file without altitude): never a made-up figure.
      ascent: a.ascentM,
      descent: a.descentM,
      points: a.points,
    },
    gps: gpsRecordDetails(r, a),
  };
}
