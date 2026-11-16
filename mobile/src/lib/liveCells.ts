/* "Lever le brouillard": places never crossed before. Positions are reduced to coarse cells (~550 m) that stay on this
   phone, per account; only the *count* of new cells of a session enters its journal. Nothing precise ever leaves. */
import type { Track } from "./gpsTrack";
import { ownerKey, readJSON, writeJSON } from "./storage";

const STEP = 0.005; // degrees of latitude ≈ 550 m
const MAX_CELLS = 20000;

export const cellOf = (lat: number, lon: number) => {
  const la = Math.floor(lat / STEP);
  const lonStep = STEP / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return `${la}:${Math.floor(lon / lonStep)}`;
};

export function cellsOf(track: Track): Set<string> {
  const out = new Set<string>();
  for (const seg of track.segs) for (const f of seg) out.add(cellOf(f.lat, f.lon));
  return out;
}

const key = (owner: string) => ownerKey("live-cells", owner);

export async function knownCells(owner: string): Promise<Set<string>> {
  return new Set(await readJSON<string[]>(key(owner), []));
}

/** Count new cells against what was known when the session started; persist the union once the session is kept. */
export function newCellCount(known: Set<string>, track: Track) {
  let n = 0;
  for (const c of cellsOf(track)) if (!known.has(c)) n++;
  return n;
}

export async function rememberCells(owner: string, track: Track) {
  const known = await knownCells(owner);
  for (const c of cellsOf(track)) known.add(c);
  await writeJSON(key(owner), [...known].slice(-MAX_CELLS));
}
