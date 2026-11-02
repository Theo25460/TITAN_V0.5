import { freshDraft, type SessionDraft } from "../core/session";
import type { Recording } from "./gpsRecorder";
import type { Summary } from "./gpsTrack";

const pad = (n: number) => String(n).padStart(2, "0");

/** The form draft for a finished recording: the same fields a GPX import fills, so saving follows the usual,
    idempotent path (client event id, offline queue, server rules). Only totals are sent; the track stays on the phone. */
export function draftFromRecording(r: Recording, s: Summary): SessionDraft {
  const start = new Date(s.start ?? r.startedAt);
  const base = freshDraft(r.sport, start);
  const sec = s.activeSeconds;
  return {
    ...base,
    when: "other",
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    distance: String(s.distanceKm).replace(".", ","),
    durH: sec >= 3600 ? String(Math.floor(sec / 3600)) : "",
    durM: String(Math.floor((sec % 3600) / 60)),
    durS: sec % 60 ? String(sec % 60) : "",
    elevation: s.ascent ? String(s.ascent) : "",
    gpx: {
      movingMinutes: s.movingSeconds ? Math.round((s.movingSeconds / 60) * 10) / 10 : null,
      elapsedMinutes: s.start && s.end ? Math.round(((s.end - s.start) / 60000) * 10) / 10 : null,
      ascent: s.ascent ?? 0,
      descent: 0,
      points: s.points,
    },
  };
}
