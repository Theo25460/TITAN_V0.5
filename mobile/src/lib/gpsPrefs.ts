/* V1.7.7 — what the athlete chose for the live GPS screen, kept per account on this phone: the view (map, figures or both), automatic
   pause, the vibrations, and the secondary figures of each family of sports. Preferences only: nothing here is sent anywhere.
   The base map choice is the one of « Mes parcours » (same key): turning it on tells the tile provider which area is looked at. */
import { GpsEngine, GpsSession, type GpsFamily, type GpsFieldKey } from "../core";
import { ownerKey, readJSON, writeJSON } from "./storage";

export type GpsView = "map" | "dash" | "mixed";
export type GpsPrefs = {
  view: GpsView;
  autoPause: boolean;
  /** One vibration when the followed route is left. */
  offRouteAlert: boolean;
  /** Vibration at each step of a structured session. */
  stepAlerts: boolean;
  /** The secondary figures chosen for a family of sports (at most four); absent: the family's own. */
  fields: Partial<Record<GpsFamily, GpsFieldKey[]>>;
};
export const DEFAULT_GPS_PREFS: GpsPrefs = { view: "dash", autoPause: true, offRouteAlert: true, stepAlerts: true, fields: {} };
export const GPS_VIEWS: { value: GpsView; label: string }[] = [
  { value: "map", label: "Carte" },
  { value: "dash", label: "Compteur" },
  { value: "mixed", label: "Mixte" },
];

const KEY = (owner: string) => ownerKey("gps-prefs", owner);
const BASEMAP_KEY = "titan.basemap.v1";

/** A stored value read back safely: unknown views and fields are dropped, missing choices take their default. */
export function cleanGpsPrefs(raw: unknown): GpsPrefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<GpsPrefs>;
  const fields: GpsPrefs["fields"] = {};
  for (const family of Object.keys(GpsEngine.FAMILIES) as GpsFamily[]) {
    const own = p.fields?.[family];
    if (Array.isArray(own)) {
      const kept = [...new Set(own.filter((k) => k in GpsSession.FIELDS))].slice(0, 4);
      if (kept.length) fields[family] = kept;
    }
  }
  return {
    view: GPS_VIEWS.some((v) => v.value === p.view) ? (p.view as GpsView) : DEFAULT_GPS_PREFS.view,
    autoPause: p.autoPause !== false,
    offRouteAlert: p.offRouteAlert !== false,
    stepAlerts: p.stepAlerts !== false,
    fields,
  };
}

export const loadGpsPrefs = async (owner: string) => cleanGpsPrefs(await readJSON<unknown>(KEY(owner), null));

let chain: Promise<unknown> = Promise.resolve();
/** Changes some choices and returns the whole set. Serialised: two quick taps never lose one of the two changes. */
export function saveGpsPrefs(owner: string, patch: Partial<GpsPrefs>): Promise<GpsPrefs> {
  const run = chain.then(async () => {
    const next = cleanGpsPrefs({ ...(await loadGpsPrefs(owner)), ...patch });
    await writeJSON(KEY(owner), next);
    return next;
  });
  chain = run.catch(() => {});
  return run;
}

/** The secondary figures of a sport: the athlete's own for its family, else the family's. */
export const fieldsFor = (prefs: GpsPrefs, sport: string) => prefs.fields[GpsEngine.familyOf(sport)] ?? null;

export const loadBasemap = () => readJSON<boolean>(BASEMAP_KEY, false);
export const saveBasemap = (on: boolean) => writeJSON(BASEMAP_KEY, on);
