/* V1.7.7 — planning a route: the request sent to TITAN's own server function (/.netlify/functions/route-plan), the reading of its
   answer and the words for every state. The phone computes no road: without a routing provider set up on the server, or without a
   network, there is no itinerary — and the screen says so, with what works meanwhile. What comes back is an indication: TITAN knows
   neither the state of a path nor the traffic, and never calls a route safe. Pure functions; the network is injected. */
import { GpsEngine, GpsNav, type NavRoute } from "../core";
import { siteFunction } from "../data/api";
import { isOnline } from "./network";

export const PLAN_PROFILES = { road: "Vélo de route", bike: "Vélo", gravel: "Gravel", mtb: "VTT", run: "Course à pied", walk: "Marche", hike: "Randonnée" } as const;
export type PlanProfile = keyof typeof PLAN_PROFILES;
export const PLAN_PROFILE_IDS = Object.keys(PLAN_PROFILES) as PlanProfile[];
export const MAX_PLAN_POINTS = 25;
export const NO_ADDRESS_SEARCH = "Recherche d’adresse non disponible : choisis un point enregistré ou saisis des coordonnées";
export const PLAN_INDICATIVE = "Itinéraire indicatif : TITAN ne connaît ni l’état des chemins, ni la circulation, ni les fermetures. Vérifie sur place et adapte-toi.";

const BY_SPORT: Record<string, PlanProfile> = {
  running: "run", race_walking: "run", trail: "hike", fell_running: "hike", orienteering: "hike",
  walking: "walk", nordic_walk: "walk", rucking: "walk", hiking: "hike", trekking: "hike", snowshoeing: "hike",
  cycling: "bike", velotaf: "bike", handbike: "bike", para_cycling: "bike", cycling_road: "road", gravel: "gravel", cyclocross: "gravel", mountain_bike: "mtb",
  roller: "road", inline_speed_skating: "road", roller_ski: "road",
};
const BY_PROFILE: Record<PlanProfile, string> = { road: "cycling_road", bike: "cycling", gravel: "gravel", mtb: "mountain_bike", run: "running", walk: "walking", hike: "hiking" };
/** The routing profile closest to a sport. Sports on snow or water have none: `fits` is false and the screen says so. */
export function profileOf(sport: string | null | undefined): { profile: PlanProfile; fits: boolean } {
  const known = BY_SPORT[String(sport)];
  if (known) return { profile: known, fits: GpsEngine.familyOf(String(sport)) !== "roll" };
  return { profile: "walk", fits: false };
}
/** The sport an outing on this plan is recorded as: the chosen sport when the profile is still its own, else the profile's sport. */
export const sportForProfile = (profile: PlanProfile, chosen?: string | null): string =>
  chosen && GpsEngine.isGpsSport(chosen) && BY_SPORT[chosen] === profile ? chosen : BY_PROFILE[profile];

export type PlanPoint = { lat: number; lon: number; label?: string };
export type PlanPrefs = { flat?: boolean; quiet?: boolean };
export type PlanInput =
  | { mode: "ab"; profile: PlanProfile; points: (PlanPoint | null)[] }
  | { mode: "loop"; profile: PlanProfile; start: PlanPoint | null; distanceKm: string | number; seed?: number; prefs?: PlanPrefs };
export type PlanBody = { profile: PlanProfile; points?: [number, number][]; loop?: { start: [number, number]; distanceM: number; seed?: number }; prefer?: { flat?: true; quiet?: true; unpaved?: true } };

const at = (p: PlanPoint): [number, number] => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5];
const valid = (p: PlanPoint | null): p is PlanPoint => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
/** The body of the request, or the sentence that says what is missing. Positions are sent with 5 decimals (about 1 m). */
export function buildPlanRequest(input: PlanInput): { ok: true; body: PlanBody } | { ok: false; error: string } {
  if (!PLAN_PROFILE_IDS.includes(input.profile)) return { ok: false, error: "Choisis un profil." };
  if (input.mode === "ab") {
    if (input.points.length < 2) return { ok: false, error: "Il faut un départ et une arrivée." };
    if (input.points.length > MAX_PLAN_POINTS) return { ok: false, error: `${MAX_PLAN_POINTS} points au plus, départ et arrivée compris.` };
    if (!valid(input.points[0] ?? null)) return { ok: false, error: "Choisis le point de départ." };
    if (!valid(input.points[input.points.length - 1] ?? null)) return { ok: false, error: "Choisis le point d’arrivée." };
    if (!input.points.every(valid)) return { ok: false, error: "Une étape n’a pas de position : choisis-la ou retire-la." };
    const points = (input.points as PlanPoint[]).map(at);
    for (let i = 1; i < points.length; i++) {
      if (GpsEngine.haversine({ lat: points[i - 1]![0], lon: points[i - 1]![1] }, { lat: points[i]![0], lon: points[i]![1] }) < 10) return { ok: false, error: "Deux points qui se suivent sont au même endroit." };
    }
    return { ok: true, body: { profile: input.profile, points } };
  }
  if (!valid(input.start)) return { ok: false, error: "Choisis le point de départ de la boucle." };
  const km = typeof input.distanceKm === "number" ? input.distanceKm : Number(String(input.distanceKm).trim().replace(",", "."));
  if (!Number.isFinite(km) || km <= 0) return { ok: false, error: "Indique la distance souhaitée en kilomètres." };
  if (km < 1 || km > 300) return { ok: false, error: "La distance d’une boucle va de 1 à 300 km." };
  const prefer: NonNullable<PlanBody["prefer"]> = {};
  if (input.prefs?.flat) prefer.flat = true;
  if (input.prefs?.quiet) {
    prefer.quiet = true;
    // « Chemins » only means unpaved ways for the profiles that ride or walk them.
    if (input.profile === "gravel" || input.profile === "mtb" || input.profile === "hike") prefer.unpaved = true;
  }
  const seed = Number.isInteger(input.seed) && (input.seed as number) > 0 ? { seed: input.seed as number } : {};
  return { ok: true, body: { profile: input.profile, loop: { start: at(input.start), distanceM: Math.round(km * 1000), ...seed }, ...(Object.keys(prefer).length ? { prefer } : {}) } };
}

export type PlanShare = { key: string; label: string; share: number };
export type PlanResult = {
  provider: string; attribution: string; profile: PlanProfile; profileNote: string | null; distanceM: number; durationS: number | null; ascentM: number | null; descentM: number | null;
  surface: PlanShare[] | null; waytype: PlanShare[] | null; warnings: string[]; requested: Record<string, unknown> | null;
};
export type PlanFailure = "ROUTING_NOT_CONFIGURED" | "OFFLINE" | "AUTH_REQUIRED" | "BAD_REQUEST" | "RATE_LIMITED" | "NO_ROUTE" | "QUOTA_EXCEEDED" | "UPSTREAM_UNAVAILABLE" | "UNKNOWN";
export type PlanAnswer = { ok: true; plan: PlanResult; route: NavRoute } | { ok: false; code: PlanFailure };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
/** Shares as fractions of the route (0 to 1), largest first. The provider may answer fractions or percentages. */
function shares(v: unknown): PlanShare[] | null {
  if (!Array.isArray(v)) return null;
  const rows = v.flatMap((raw): PlanShare[] => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const share = num(r.share);
    return share === null || share === 0 ? [] : [{ key: String(r.key ?? r.label ?? ""), label: str(r.label, 40) ?? String(r.key ?? "Autre"), share }];
  });
  if (!rows.length) return null;
  const total = rows.reduce((n, r) => n + r.share, 0);
  const scale = total > 1.5 ? 100 : 1;
  return rows.map((r) => ({ ...r, share: Math.min(1, r.share / scale) })).sort((a, b) => b.share - a.share);
}
/** Reads a successful answer into a route to preview, follow or save. Null when the line is unusable (never a made-up one). */
export function readPlan(body: Record<string, unknown>, fallbackProfile: PlanProfile): { plan: PlanResult; route: NavRoute } | null {
  const segs = (Array.isArray(body.segs) ? body.segs : []).map((s) => (Array.isArray(s) ? s : []).flatMap((p) =>
    Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number" ? [{ lat: p[0], lon: p[1], ele: typeof p[2] === "number" && Number.isFinite(p[2]) ? p[2] : null }] : []));
  const route = GpsNav.makeRoute(segs, { origin: "planned" });
  if (!route || route.distanceM < 50) return null;
  const profile = PLAN_PROFILE_IDS.includes(body.profile as PlanProfile) ? (body.profile as PlanProfile) : fallbackProfile;
  return {
    route,
    plan: {
      provider: str(body.provider, 60) ?? "fournisseur d’itinéraires", attribution: str(body.attribution, 200) ?? "", profile, profileNote: str(body.profileNote, 300),
      distanceM: num(body.distanceM) ?? route.distanceM, durationS: num(body.durationS), ascentM: num(body.ascentM), descentM: num(body.descentM),
      surface: shares(body.surface), waytype: shares(body.waytype),
      warnings: (Array.isArray(body.warnings) ? body.warnings : []).flatMap((w) => (str(w, 300) ? [str(w, 300)!] : [])).slice(0, 8),
      requested: body.requested && typeof body.requested === "object" ? (body.requested as Record<string, unknown>) : null,
    },
  };
}

const CODES: readonly PlanFailure[] = ["ROUTING_NOT_CONFIGURED", "AUTH_REQUIRED", "BAD_REQUEST", "RATE_LIMITED", "NO_ROUTE", "QUOTA_EXCEEDED", "UPSTREAM_UNAVAILABLE"];
function failureOf(status: number, body: Record<string, unknown> | null): PlanFailure {
  const code = CODES.find((c) => c === body?.code);
  if (code) return code;
  // The function itself is not on the server yet (404): the same thing, for the athlete, as a provider that is not set up.
  if (status === 404) return "ROUTING_NOT_CONFIGURED";
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 422) return "NO_ROUTE";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_UNAVAILABLE";
  return "UNKNOWN";
}
export type PlanDeps = { fetch?: typeof fetch; online?: () => boolean };
/** Asks the server for an itinerary. Never throws and never waits for ever (25 s): each failure is a state the screen explains. */
export async function planRoute(owner: string, body: PlanBody, deps: PlanDeps = {}): Promise<PlanAnswer> {
  if (!(deps.online ?? isOnline)()) return { ok: false, code: "OFFLINE" };
  let answer: { status: number; body: Record<string, unknown> | null };
  try {
    answer = await siteFunction(owner, "route-plan", body, deps.fetch);
  } catch (e) {
    return { ok: false, code: /AUTH_REQUIRED/.test(String((e as Error)?.message)) ? "AUTH_REQUIRED" : "OFFLINE" };
  }
  if (answer.body?.ok === true && answer.status >= 200 && answer.status < 300) {
    const read = readPlan(answer.body, body.profile);
    return read ? { ok: true, ...read } : { ok: false, code: "UNKNOWN" };
  }
  return { ok: false, code: failureOf(answer.status, answer.body) };
}
/** Before the athlete fills the form: is planning known to be unavailable? One request without any position (the server refuses it,
    saying why). "unavailable": no provider is set up. "offline": no network. "unknown": nothing certain, the form is shown. */
export async function probePlanner(owner: string, deps: PlanDeps = {}): Promise<"unavailable" | "offline" | "unknown"> {
  if (!(deps.online ?? isOnline)()) return "offline";
  try {
    const answer = await siteFunction(owner, "route-plan", { profile: "walk" }, deps.fetch, 10000);
    return failureOf(answer.status, answer.body) === "ROUTING_NOT_CONFIGURED" ? "unavailable" : "unknown";
  } catch {
    return "unknown";
  }
}

/** What the screen says for each failure. */
export const PLAN_STATES: Record<PlanFailure, { title: string; text: string; retry: boolean }> = {
  ROUTING_NOT_CONFIGURED: { title: "La planification n’est pas encore disponible", text: "Aucun service d’itinéraire n’est configuré sur le serveur TITAN.", retry: false },
  OFFLINE: { title: "Pas de connexion", text: "Le calcul d’itinéraire demande une connexion. Tes parcours enregistrés restent utilisables.", retry: true },
  AUTH_REQUIRED: { title: "Session expirée", text: "Reconnecte-toi pour calculer un itinéraire.", retry: false },
  BAD_REQUEST: { title: "Demande refusée", text: "Le serveur n’a pas accepté ces points ou ce profil. Vérifie les positions, puis réessaie.", retry: false },
  RATE_LIMITED: { title: "Trop de calculs", text: "Beaucoup de calculs en peu de temps. Patiente une minute, puis réessaie.", retry: true },
  NO_ROUTE: { title: "Aucun itinéraire trouvé", text: "Le service n’a pas trouvé de chemin entre ces points avec ce profil. Rapproche les points d’une route ou d’un chemin, change de profil ou, pour une boucle, change la distance.", retry: false },
  QUOTA_EXCEEDED: { title: "Quota atteint", text: "Le nombre de calculs possibles pour aujourd’hui est atteint. Réessaie demain ; l’import d’un GPX et tes parcours enregistrés restent disponibles.", retry: false },
  UPSTREAM_UNAVAILABLE: { title: "Service d’itinéraire indisponible", text: "Le service d’itinéraire ne répond pas pour le moment. Réessaie dans quelques minutes.", retry: true },
  UNKNOWN: { title: "Calcul impossible", text: "Le calcul n’a pas abouti, ou sa réponse n’était pas lisible. Réessaie dans un instant.", retry: true },
};
/** The full explanation shown while no routing provider exists: what is needed, and what works without it. */
export const PLAN_NOT_CONFIGURED = {
  needs: [
    "Calculer un itinéraire demande un service de routage : un compte chez un fournisseur d’itinéraires, configuré sur le serveur TITAN (voir docs/V177_CARTES_ET_ROUTAGE.md).",
    "Ce n’est pas un réglage de ton téléphone : une mise à jour du serveur l’activera, sans rien à installer.",
  ],
  meanwhile: [
    "Importer un GPX créé dans n’importe quel planificateur, puis le suivre.",
    "Suivre un parcours déjà enregistré dans Mes parcours.",
    "Pendant une sortie GPS, revenir par le même chemin.",
  ],
} as const;

const km = (m: number) => `${(m / 1000).toFixed(m < 100000 ? 1 : 0).replace(".", ",")} km`;
/** For a loop: what was asked against what was obtained. A preference is stated as such — it is not a guarantee. */
export function loopReading(plan: Pick<PlanResult, "distanceM" | "ascentM" | "requested">, body: PlanBody): { distance: string; relief: string | null } | null {
  if (!body.loop) return null;
  const asked = num(plan.requested?.distanceM) ?? body.loop.distanceM;
  const gap = asked > 0 ? Math.round(((plan.distanceM - asked) / asked) * 100) : 0;
  const distance = `Distance demandée : ${km(asked)} · obtenue : ${km(plan.distanceM)}${gap ? ` (${gap > 0 ? "+" : "−"}${Math.abs(gap)} %)` : ""}`;
  const ceiling = num(plan.requested?.maxAscentM) ?? num(plan.requested?.ascentMaxM);
  let relief: string | null = null;
  if (ceiling !== null) relief = plan.ascentM === null ? `D+ souhaité : ${Math.round(ceiling)} m au plus · D+ obtenu : non fourni (préférence, pas garantie)` : `D+ souhaité : ${Math.round(ceiling)} m au plus · obtenu : ${Math.round(plan.ascentM)} m (préférence, pas garantie)`;
  else if (body.prefer?.flat) relief = plan.ascentM === null ? "Tu as demandé plutôt plat : le dénivelé obtenu n’est pas fourni (préférence, pas garantie)" : `Tu as demandé plutôt plat · D+ obtenu : ${Math.round(plan.ascentM)} m (préférence, pas garantie)`;
  return { distance, relief };
}
/** « 1 h 12 », « 48 min ». */
export const planDuration = (s: number) => { const m = Math.max(1, Math.round(s / 60)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`; };
