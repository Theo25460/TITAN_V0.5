/* V1.7.7 — planning: the request the phone builds, the reading of the server's answer, and a named state for every failure
   (first of all « no routing service is set up », which is what exists today). */
let mockOwner: string | null = "a";
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: jest.fn(), auth: { getSession: async () => ({ data: { session: mockOwner ? { user: { id: mockOwner }, access_token: `token-${mockOwner}` } : null } }) } } }));
import { buildPlanRequest, loopReading, PLAN_NOT_CONFIGURED, PLAN_STATES, planDuration, planRoute, probePlanner, profileOf, readPlan, sportForProfile, type PlanBody, type PlanFailure } from "../src/lib/routePlanner";

const A = { lat: 48.583912, lon: 7.745534 }, B = { lat: 48.6, lon: 7.8 }, C = { lat: 48.59, lon: 7.77 };
const segs = [Array.from({ length: 40 }, (_, i) => [48.58 + i * 0.001, 7.74 + i * 0.001, 140 + i])];
const good = (over: Record<string, unknown> = {}) => ({
  ok: true, provider: "openrouteservice", attribution: "© openrouteservice.org, © les contributeurs d’OpenStreetMap", profile: "bike", profileNote: null, distanceM: 21400, durationS: 4320, ascentM: 240, descentM: 238,
  segs, surface: [{ key: "asphalt", label: "Asphalte", share: 0.7 }, { key: "unknown", label: "Non renseigné", share: 0.3 }], waytype: null, warnings: ["Revêtement non renseigné dans OpenStreetMap sur 30 % de l’itinéraire."],
  requested: { profile: "bike", loop: { start: [48.58391, 7.74553], distanceM: 20000, seed: 0 }, prefer: { flat: true } }, ...over,
});
const answering = (status: number, body: unknown) => jest.fn(async () => ({ status, json: async () => { if (body === undefined) throw new Error("not json"); return body; } })) as unknown as typeof fetch;
const online = { online: () => true };
beforeEach(() => { mockOwner = "a"; });

test("each sport gets the closest routing profile, and an outing on the plan keeps the chosen sport when it fits", () => {
  expect(profileOf("running")).toEqual({ profile: "run", fits: true });
  expect(profileOf("trail").profile).toBe("hike");
  expect(profileOf("cycling_road").profile).toBe("road");
  expect(profileOf("gravel").profile).toBe("gravel");
  expect(profileOf("mountain_bike").profile).toBe("mtb");
  expect(profileOf("hiking").profile).toBe("hike");
  expect(profileOf("walking").profile).toBe("walk");
  // No road network profile exists for skis, a kayak or roller skates: the screen says so instead of pretending.
  expect(profileOf("kayak").fits).toBe(false);
  expect(profileOf("ski_touring").fits).toBe(false);
  expect(profileOf("roller")).toEqual({ profile: "road", fits: false });
  expect(sportForProfile("hike", "trail")).toBe("trail");
  expect(sportForProfile("road", "trail")).toBe("cycling_road");
  expect(sportForProfile("mtb")).toBe("mountain_bike");
});

test("A → B: start, steps and destination in order, 5 decimals, 2 to 25 points, no missing or doubled point", () => {
  expect(buildPlanRequest({ mode: "ab", profile: "hike", points: [A, C, B] })).toEqual({ ok: true, body: { profile: "hike", points: [[48.58391, 7.74553], [48.59, 7.77], [48.6, 7.8]] } });
  expect(buildPlanRequest({ mode: "ab", profile: "hike", points: [null, B] })).toEqual({ ok: false, error: "Choisis le point de départ." });
  expect(buildPlanRequest({ mode: "ab", profile: "hike", points: [A, null] })).toEqual({ ok: false, error: "Choisis le point d’arrivée." });
  expect(buildPlanRequest({ mode: "ab", profile: "hike", points: [A, null, B] })).toMatchObject({ ok: false, error: expect.stringContaining("étape") });
  expect(buildPlanRequest({ mode: "ab", profile: "hike", points: [A] })).toMatchObject({ ok: false });
  expect(buildPlanRequest({ mode: "ab", profile: "hike", points: [A, { ...A }, B] })).toEqual({ ok: false, error: "Deux points qui se suivent sont au même endroit." });
  expect(buildPlanRequest({ mode: "ab", profile: "hike", points: Array.from({ length: 26 }, (_, i) => ({ lat: 48 + i * 0.01, lon: 7 })) })).toMatchObject({ ok: false, error: expect.stringContaining("25 points") });
  expect(buildPlanRequest({ mode: "ab", profile: "plane" as never, points: [A, B] })).toMatchObject({ ok: false });
});

test("loop: start, distance in metres, preferences only when asked, a seed for another proposal", () => {
  expect(buildPlanRequest({ mode: "loop", profile: "bike", start: A, distanceKm: "12,5" })).toEqual({ ok: true, body: { profile: "bike", loop: { start: [48.58391, 7.74553], distanceM: 12500 } } });
  expect(buildPlanRequest({ mode: "loop", profile: "bike", start: A, distanceKm: 20, seed: 3, prefs: { flat: true, quiet: true } })).toEqual({ ok: true, body: { profile: "bike", loop: { start: [48.58391, 7.74553], distanceM: 20000, seed: 3 }, prefer: { flat: true, quiet: true } } });
  // « chemins » means unpaved ways only for the profiles that take them.
  expect((buildPlanRequest({ mode: "loop", profile: "gravel", start: A, distanceKm: 20, prefs: { quiet: true } }) as { body: PlanBody }).body.prefer).toEqual({ quiet: true, unpaved: true });
  expect((buildPlanRequest({ mode: "loop", profile: "bike", start: A, distanceKm: 20, seed: 100 }) as { body: PlanBody }).body.loop).toEqual({ start: [48.58391, 7.74553], distanceM: 20000 });
  expect(buildPlanRequest({ mode: "loop", profile: "bike", start: null, distanceKm: 20 })).toEqual({ ok: false, error: "Choisis le point de départ de la boucle." });
  for (const bad of ["", "abc", "0", "-4"]) expect(buildPlanRequest({ mode: "loop", profile: "bike", start: A, distanceKm: bad })).toEqual({ ok: false, error: "Indique la distance souhaitée en kilomètres." });
  for (const out of ["0,5", "301"]) expect(buildPlanRequest({ mode: "loop", profile: "bike", start: A, distanceKm: out })).toEqual({ ok: false, error: "La distance d’une boucle va de 1 à 300 km." });
});

test("the request goes to TITAN's server function with the account's token; the answer becomes a planned route to preview, follow or save", async () => {
  const network = answering(200, good());
  const body: PlanBody = { profile: "bike", loop: { start: [48.58391, 7.74553], distanceM: 20000 }, prefer: { flat: true } };
  const answer = await planRoute("a", body, { fetch: network, ...online });
  const [url, init] = (network as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://titan-app.fr/.netlify/functions/route-plan");
  expect(init.method).toBe("POST");
  expect(init.headers).toMatchObject({ Authorization: "Bearer token-a" });
  expect(JSON.parse(String(init.body))).toEqual(body);
  if (!answer.ok) throw new Error("expected a plan");
  expect(answer.plan).toMatchObject({ provider: "openrouteservice", profile: "bike", distanceM: 21400, durationS: 4320, ascentM: 240, descentM: 238, waytype: null, warnings: [expect.stringContaining("30 %")] });
  expect(answer.plan.surface).toEqual([{ key: "asphalt", label: "Asphalte", share: 0.7 }, { key: "unknown", label: "Non renseigné", share: 0.3 }]);
  expect(answer.route).toMatchObject({ origin: "planned", points: 40, ascentM: 39 });
  expect(answer.route.segs[0]![0]).toEqual({ lat: 48.58, lon: 7.74, ele: 140 });
});

test("a missing figure stays missing; shares given as percentages are read; an unusable line is a failure, never an invented route", () => {
  const read = readPlan(good({ durationS: null, ascentM: null, descentM: null, surface: null, waytype: [{ key: "path", label: "Sentier", share: 25 }, { key: "road", label: "Route", share: 75 }], segs: [segs[0]!.map((p) => [p[0], p[1], null])] }), "run")!;
  expect(read.plan).toMatchObject({ durationS: null, ascentM: null, descentM: null, surface: null, waytype: [{ key: "road", label: "Route", share: 0.75 }, { key: "path", label: "Sentier", share: 0.25 }] });
  expect(read.route.ascentM).toBeNull();
  expect(readPlan(good({ segs: [] }), "run")).toBeNull();
  expect(readPlan(good({ segs: [[[48.58, 7.74, null]]] }), "run")).toBeNull();
  expect(readPlan(good({ segs: "x" }), "run")).toBeNull();
});

test("every failure is a named state: not configured (503 or a function not deployed), no route, limits, an outage, no network", async () => {
  const body: PlanBody = { profile: "walk", points: [[48.58, 7.74], [48.6, 7.8]] };
  const cases: [number, unknown, PlanFailure][] = [
    [503, { ok: false, code: "ROUTING_NOT_CONFIGURED" }, "ROUTING_NOT_CONFIGURED"],
    [404, undefined, "ROUTING_NOT_CONFIGURED"],
    [401, { ok: false, code: "AUTH_REQUIRED" }, "AUTH_REQUIRED"],
    [400, { ok: false, code: "BAD_REQUEST" }, "BAD_REQUEST"],
    [429, { ok: false, code: "RATE_LIMITED" }, "RATE_LIMITED"],
    [422, { ok: false, code: "NO_ROUTE" }, "NO_ROUTE"],
    [503, { ok: false, code: "QUOTA_EXCEEDED" }, "QUOTA_EXCEEDED"],
    [502, { ok: false, code: "UPSTREAM_UNAVAILABLE" }, "UPSTREAM_UNAVAILABLE"],
    [503, { ok: false, code: "SERVICE_UNAVAILABLE" }, "UPSTREAM_UNAVAILABLE"],
    [500, undefined, "UPSTREAM_UNAVAILABLE"],
    [200, { ok: true, segs: [] }, "UNKNOWN"],
    [418, { ok: false }, "UNKNOWN"],
  ];
  for (const [status, answer, code] of cases) expect(await planRoute("a", body, { fetch: answering(status, answer), ...online })).toEqual({ ok: false, code });
  const down = jest.fn(async () => { throw new TypeError("Network request failed"); }) as unknown as typeof fetch;
  expect(await planRoute("a", body, { fetch: down, ...online })).toEqual({ ok: false, code: "OFFLINE" });
  const cut = jest.fn(async () => { throw Object.assign(new Error("Aborted"), { name: "AbortError" }); }) as unknown as typeof fetch;
  expect(await planRoute("a", body, { fetch: cut, ...online })).toEqual({ ok: false, code: "UPSTREAM_UNAVAILABLE" });
  // Without a network nothing is even tried.
  const never = answering(200, good());
  expect(await planRoute("a", body, { fetch: never, online: () => false })).toEqual({ ok: false, code: "OFFLINE" });
  expect(never).not.toHaveBeenCalled();
  mockOwner = null;
  expect(await planRoute("a", body, { fetch: never, ...online })).toEqual({ ok: false, code: "AUTH_REQUIRED" });
  expect(never).not.toHaveBeenCalled();
  for (const state of Object.values(PLAN_STATES)) expect(`${state.title} ${state.text}`).not.toMatch(/sûr/i);
  expect(PLAN_STATES.OFFLINE.text).toBe("Le calcul d’itinéraire demande une connexion. Tes parcours enregistrés restent utilisables.");
  expect(PLAN_NOT_CONFIGURED.needs.join(" ")).not.toMatch(/docs\/|\.md\b/); // no internal file path shown to the athlete
  expect(PLAN_NOT_CONFIGURED.meanwhile).toHaveLength(3);
});

test("before the form: one request without any position tells whether a routing service exists at all", async () => {
  const none = answering(503, { ok: false, code: "ROUTING_NOT_CONFIGURED" });
  expect(await probePlanner("a", { fetch: none, ...online })).toBe("unavailable");
  expect(JSON.parse(String(((none as unknown as jest.Mock).mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ profile: "walk" });
  expect(await probePlanner("a", { fetch: answering(404, undefined), ...online })).toBe("unavailable");
  expect(await probePlanner("a", { fetch: answering(400, { ok: false, code: "BAD_REQUEST" }), ...online })).toBe("unknown");
  expect(await probePlanner("a", { fetch: none, online: () => false })).toBe("offline");
  expect(await probePlanner("a", { fetch: jest.fn(async () => { throw new Error("Network request failed"); }) as unknown as typeof fetch, ...online })).toBe("unknown");
});

test("a loop says what was asked and what came back; a preference is stated as a preference, not a guarantee", () => {
  const body: PlanBody = { profile: "bike", loop: { start: [48.58391, 7.74553], distanceM: 20000 }, prefer: { flat: true } };
  const plan = readPlan(good(), "bike")!.plan;
  expect(loopReading(plan, body)).toEqual({ distance: "Distance demandée : 20,0 km · obtenue : 21,4 km (+7 %)", relief: "Tu as demandé plutôt plat · D+ obtenu : 240 m (préférence, pas garantie)" });
  expect(loopReading({ ...plan, distanceM: 18000, ascentM: null }, body)).toEqual({ distance: "Distance demandée : 20,0 km · obtenue : 18,0 km (−10 %)", relief: "Tu as demandé plutôt plat : le dénivelé obtenu n’est pas fourni (préférence, pas garantie)" });
  expect(loopReading(plan, { profile: "bike", loop: body.loop })!.relief).toBeNull();
  expect(loopReading(plan, { profile: "bike", points: [[48.5, 7.7], [48.6, 7.8]] })).toBeNull();
  expect(planDuration(4320)).toBe("1 h 12");
  expect(planDuration(2880)).toBe("48 min");
});
