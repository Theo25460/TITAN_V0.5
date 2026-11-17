/* AUD-43: read the activities.csv of a Strava data export (Settings › My account › Download or delete your account) and turn it into
   past sessions for titan_import_history_v1. Pure parsing: nothing is guessed — an unknown type, a session of the last 30 days
   (those come from Health Connect or are entered by hand) or an unreadable row is left out and counted as such. */
import { Sports } from "../core";

export type HistoryItem = { id: string; sport: string; startedAt: string; minutes: number; km: number | null };
export type ParsedHistory = { items: HistoryItem[]; recent: number; unknown: number; invalid: number; types: Record<string, number> };

/** Strava activity types (English export) to TITAN sport ids; only ids present in the catalogue are kept at runtime. */
const STRAVA_TYPES: Record<string, string> = {
  run: "running", "trail run": "trail", "virtual run": "running", walk: "walking", hike: "hiking", ride: "cycling", "virtual ride": "cycling",
  "gravel ride": "gravel", "mountain bike ride": "mountain_bike", "e-bike ride": "cycling", "e-mountain bike ride": "mountain_bike", swim: "swimming",
  "weight training": "muscu_gym", workout: "hiit", crossfit: "crossfit", hiit: "hiit", yoga: "yoga", pilates: "pilates", "rock climbing": "climbing_route",
  rowing: "rowing", "virtual row": "rowing_machine", "alpine ski": "alpine_skiing", "backcountry ski": "alpine_skiing", "nordic ski": "cross_country_skiing",
  snowboard: "snowboard", snowshoe: "snowshoeing", "ice skate": "ice_skating", "inline skate": "roller", skateboard: "skateboarding", kayaking: "kayak",
  canoeing: "kayak", "stand up paddling": "paddle", surfing: "surfing", kitesurf: "kitesurf", windsurf: "windsurf", sail: "sailing", elliptical: "elliptical",
  stairstepper: "stair_climbing", golf: "golf", tennis: "tennis", padel: "padel", squash: "squash", badminton: "badminton", "table tennis": "table_tennis",
  soccer: "football", football: "football", basketball: "basketball", volleyball: "volleyball", handball: "handball", rugby: "rugby", boxing: "boxing",
  dance: "dance", "nordic walk": "nordic_walk",
};

/** RFC 4180 CSV (quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** « Nov 1, 2025, 7:42:13 AM » (Strava, UTC) or any ISO date. */
export function parseStravaDate(raw: string): Date | null {
  const s = raw.trim();
  const m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AP]M)?$/i.exec(s);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month === undefined) return null;
    let h = Number(m[4]) % 12;
    if (m[7]?.toUpperCase() === "PM") h += 12;
    if (!m[7]) h = Number(m[4]);
    return new Date(Date.UTC(Number(m[3]), month, Number(m[2]), h, Number(m[5]), Number(m[6] ?? 0)));
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

export function parseStravaActivities(csv: string, now = Date.now()): ParsedHistory {
  const rows = parseCsv(csv);
  const out: ParsedHistory = { items: [], recent: 0, unknown: 0, invalid: 0, types: {} };
  if (rows.length < 2) return out;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const iId = col("activity id"), iDate = col("activity date"), iType = col("activity type"), iElapsed = col("elapsed time"), iMoving = col("moving time"), iDist = col("distance");
  if (iDate < 0 || iType < 0 || iElapsed < 0) throw new Error("Ce fichier ne ressemble pas à activities.csv d’un export Strava.");
  for (const r of rows.slice(1)) {
    const type = (r[iType] ?? "").trim();
    const mapped = STRAVA_TYPES[type.toLowerCase()];
    const sport = mapped && Sports.conf(mapped) ? mapped : null;
    out.types[type || "?"] = (out.types[type || "?"] ?? 0) + 1;
    if (!sport) { out.unknown++; continue; }
    const date = parseStravaDate(r[iDate] ?? "");
    const seconds = Number(((iMoving >= 0 && Number(r[iMoving]) > 0 ? r[iMoving] : r[iElapsed]) ?? "").replace(",", "."));
    const km = iDist >= 0 ? Number((r[iDist] ?? "").replace(",", ".")) : NaN;
    if (!date || !Number.isFinite(seconds) || seconds < 60 || seconds > 86400) { out.invalid++; continue; }
    if (now - date.getTime() < 30 * 86_400_000) { out.recent++; continue; }
    const rawId = (iId >= 0 ? r[iId] : "").trim();
    const id = `strava-${rawId && /^[0-9A-Za-z_-]{1,100}$/.test(rawId) ? rawId : `${date.getTime()}-${sport}`}`;
    out.items.push({ id, sport, startedAt: date.toISOString(), minutes: Math.round((seconds / 60) * 10) / 10, km: Number.isFinite(km) && km > 0 && km <= 1000 && Sports.unitOf(sport) === "km" ? Math.round(km * 100) / 100 : null });
  }
  return out;
}

export const chunk = <T,>(list: T[], size = 50): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
