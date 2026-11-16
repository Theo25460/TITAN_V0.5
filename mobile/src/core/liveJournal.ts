/* Bounded copy of the TITAN LIVE journal kept in a session's details (details.live). Pure, no web module needed, so the
   session builder can use it. The server re-verifies everything: this only keeps the payload small and well-formed. */
export type LiveJournal = {
  v: 1;
  seed: string;
  voie: string;
  sport: string;
  intent: "atteindre" | "depasser" | "explorer";
  immersion: string;
  goal: { kind: "time" | "distance" | "beats"; value: number } | null;
  activeMin: number;
  beats: number;
  beatsByKind: Record<string, number>;
  restsRespected: number;
  gps: { distanceM: number; elevationM: number; newPlaces: number };
  missions: { id: string; at: number; declared: boolean }[];
  events: string[];
  fields: Record<string, number>;
  interrupted: number;
  recovery: boolean;
};

const INTENTS = new Set(["atteindre", "depasser", "explorer"]);
const n = (v: unknown, max: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x * 10) / 10)) : 0;
};
const word = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : null);

export function sanitizeLiveJournal(raw: unknown): LiveJournal | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  const voie = word(j.voie, /^[a-z]{3,16}$/);
  const sport = word(j.sport, /^[a-z0-9_]{2,48}$/);
  if (Number(j.v) !== 1 || !voie || !sport) return null;
  const goalRaw = j.goal as { kind?: unknown; value?: unknown } | null;
  const goal = goalRaw && ["time", "distance", "beats"].includes(String(goalRaw.kind)) && Number(goalRaw.value) > 0
    ? { kind: goalRaw.kind as "time" | "distance" | "beats", value: n(goalRaw.value, 100000) } : null;
  const beatsByKind: Record<string, number> = {};
  for (const [k, v] of Object.entries((j.beatsByKind as Record<string, unknown>) || {}).slice(0, 12)) if (/^[a-z]{1,16}$/.test(k)) beatsByKind[k] = n(v, 1000);
  const fields: Record<string, number> = {};
  for (const [k, v] of Object.entries((j.fields as Record<string, unknown>) || {}).slice(0, 24)) if (/^[A-Za-z_]{2,24}$/.test(k) && Number.isFinite(Number(v))) fields[k] = n(v, 100000);
  const missions = (Array.isArray(j.missions) ? j.missions : []).slice(0, 3)
    .map((m) => m as { id?: unknown; at?: unknown; declared?: unknown })
    .filter((m) => typeof m.id === "string" && /^[a-z]+\.[a-z_]{2,32}$/.test(m.id))
    .map((m) => ({ id: m.id as string, at: n(m.at, 86400), declared: m.declared === true }));
  const gps = (j.gps as Record<string, unknown>) || {};
  return {
    v: 1, seed: String(j.seed || "").slice(0, 64), voie, sport,
    intent: INTENTS.has(String(j.intent)) ? (j.intent as LiveJournal["intent"]) : "atteindre",
    immersion: word(j.immersion, /^[a-z]{3,16}$/) || "notifications", goal,
    activeMin: n(j.activeMin, 1440), beats: n(j.beats, 1000), beatsByKind, restsRespected: n(j.restsRespected, 1000),
    gps: { distanceM: n(gps.distanceM, 400000), elevationM: n(gps.elevationM, 12000), newPlaces: n(gps.newPlaces, 1000) },
    missions, events: (Array.isArray(j.events) ? j.events : []).filter((e): e is string => typeof e === "string" && /^[a-z_]{2,24}$/.test(e)).slice(0, 12),
    fields, interrupted: n(j.interrupted, 100), recovery: j.recovery === true,
  };
}
