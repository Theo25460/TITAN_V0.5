// Simulated signed-in account for the visual capture bench (`capture.mjs --state connected`).
//
// Production answers 21 feature flags ON and a signed-in player sees many server-driven blocks (season, buddy, clubs, duels, ranking,
// common quest, world goal, factions, pantheon, daily intent, consultations, coaching tools…). No real account can be created on
// production from the bench, so this file plays the server inside the page: `installConnected(data)` replaces the Supabase client's
// `auth.getSession`, `rpc` and `from` (and the few raw `fetch` calls to the Supabase host) with answers taken from the e2e journeys'
// fixtures (tests/e2e/*.e2e.mjs). The app then signs itself in through its own start-up path (profile read, history pages, snapshots).
//
//   import { buildConnectedData, installConnected, connectedScript } from "./fixture-connected.mjs";
//   await context.route("**/js/config.js*", async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()) + connectedScript(data) }); });
//   await page.evaluate(installConnected, data); // after the page is ready: idempotent, returns { owner, signedIn, history, unmockedRpc… }
//
// `installConnected` is serialisable: it only reads its argument and the page. Every RPC name without an answer gets PostgREST's
// "function not found" (PGRST202) and is recorded in `window.__unmockedRpc` (a Set); tables without an answer go to `window.__unmockedFrom`.
// The fixture only supplies data. A block that looks wrong with it is a finding, not something to trim here.
import { readFileSync } from "node:fs";

export const OWNER = "7c1f2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DAY = 86400000;

/* ---------- The page side ---------- */
export function installConnected(fx) {
  const w = window;
  const client = w.titanClient || (typeof w.initTitanSupabaseClient === "function" ? w.initTitanSupabaseClient() : null);
  const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  if (!w.__connected && client) {
    const C = (w.__connected = { fx, rpcCalls: [], fromCalls: [], logs: null });
    w.__unmockedRpc = new Set();
    w.__unmockedFrom = new Set();
    const session = { access_token: fx.token, refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: fx.authUser };
    const NOT_FOUND = name => ({ data: null, error: { code: "PGRST202", message: `Could not find the function public.${name} in the schema cache`, details: null, hint: null } });
    const OFFLINE = () => ({ data: null, error: { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" }, count: null, status: 0, statusText: "" });

    /* RPC answers: fx.rpc[name] is the value; { __by: "p_action", cases: {…}, default } picks by an argument (dots walk into it). */
    function answer(name, args) {
      C.rpcCalls.push([name, args || {}]);
      if (!Object.prototype.hasOwnProperty.call(fx.rpc, name)) { w.__unmockedRpc.add(name); return NOT_FOUND(name); }
      let value = fx.rpc[name];
      while (value && typeof value === "object" && value.__by) {
        const key = String(value.__by.split(".").reduce((o, k) => (o == null ? o : o[k]), args || {}));
        if (value.cases && Object.prototype.hasOwnProperty.call(value.cases, key)) value = value.cases[key];
        else if ("default" in value) value = value.default;
        else { w.__unmockedRpc.add(`${name}(${value.__by}=${key})`); return NOT_FOUND(name); }
      }
      if (value && typeof value === "object" && value.__error) return { data: null, error: clone(value.__error) };
      return { data: clone(value), error: null };
    }
    function chain(out, pick) {
      // PostgREST builders are thenables with chained modifiers; `single()` and `maybeSingle()` unwrap a one-row answer.
      const one = () => chain({ ...out, data: Array.isArray(out.data) ? (out.data[0] ?? null) : out.data });
      const p = Promise.resolve(out);
      for (const m of ["setHeader", "abortSignal", "throwOnError", "returns", "select", "order", "limit", "range", "eq", "overrideTypes"]) p[m] = () => p;
      p.single = pick ? () => p : one; p.maybeSingle = pick ? () => p : one;
      return p;
    }
    client.rpc = (name, args) => chain(answer(name, args));

    /* Tables. `rows` may filter on eq(); catalogues the bench never had answer like the cut network does, so the bundled copies stay. */
    function logs() {
      if (!C.logs) C.logs = fx.history.map(l => ({ ...clone(l), user_id: fx.owner }));
      return C.logs;
    }
    const tables = {
      profiles: () => [clone(fx.profile)],
      training_logs: logs,
      sport_goals: () => clone(fx.goals),
      user_achievements: () => clone(fx.userAchievements || []),
      shop_history: () => clone(fx.shopHistory || []),
      social_challenges: () => [],
      analytics_events: () => [],
    };
    client.from = table => {
      C.fromCalls.push(table);
      const known = Object.prototype.hasOwnProperty.call(tables, table);
      if (!known) w.__unmockedFrom.add(table);
      const q = { rows: known ? tables[table]() : null, filters: [], range: null, limit: null, one: false, write: false, head: false };
      const b = {
        select(_cols, opts) { if (opts && opts.head) q.head = true; return b; },
        eq(col, val) { q.filters.push(r => !(col in r) || String(r[col]) === String(val)); return b; },
        neq(col, val) { q.filters.push(r => !(col in r) || String(r[col]) !== String(val)); return b; },
        in(col, vals) { q.filters.push(r => !(col in r) || vals.map(String).includes(String(r[col]))); return b; },
        is(col, val) { q.filters.push(r => !(col in r) || (val === null ? r[col] == null : r[col] === val)); return b; },
        gte(col, val) { q.filters.push(r => !(col in r) || String(r[col]) >= String(val)); return b; },
        lte(col, val) { q.filters.push(r => !(col in r) || String(r[col]) <= String(val)); return b; },
        gt(col, val) { q.filters.push(r => !(col in r) || String(r[col]) > String(val)); return b; },
        lt(col, val) { q.filters.push(r => !(col in r) || String(r[col]) < String(val)); return b; },
        order(col, opts) { if (q.rows && q.rows.length && col in q.rows[0]) { const dir = opts && opts.ascending === false ? -1 : 1; q.rows = q.rows.slice().sort((x, y) => (String(x[col]) < String(y[col]) ? -dir : String(x[col]) > String(y[col]) ? dir : 0)); } return b; },
        range(from, to) { q.range = [from, to]; return b; },
        limit(n) { q.limit = n; return b; },
        single() { q.one = true; return b; },
        maybeSingle() { q.one = true; return b; },
        insert() { q.write = true; return b; }, upsert() { q.write = true; return b; }, update() { q.write = true; return b; }, delete() { q.write = true; return b; },
        then(resolve, reject) {
          let out;
          if (!known) out = OFFLINE();
          else if (q.write) out = { data: q.one ? null : [], error: null, count: null, status: 201, statusText: "Created" };
          else {
            let rows = q.rows.filter(r => q.filters.every(f => f(r)));
            const count = rows.length;
            if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
            if (q.limit != null) rows = rows.slice(0, q.limit);
            out = { data: q.head ? null : q.one ? (rows[0] ?? null) : rows, error: null, count, status: 200, statusText: "OK" };
          }
          return Promise.resolve(out).then(resolve, reject);
        },
      };
      for (const m of ["or", "not", "filter", "match", "like", "ilike", "contains", "containedBy", "overlaps", "textSearch", "abortSignal", "returns", "throwOnError", "setHeader", "csv", "explain", "rollback", "overrideTypes"]) b[m] = () => b;
      b.catch = fn => b.then(undefined, fn); b.finally = fn => b.then(v => (fn(), v), e => { fn(); throw e; });
      return b;
    };

    /* Session. The SDK keeps its other methods; only what would reach the network is answered here. */
    client.auth.getSession = async () => ({ data: { session }, error: null });
    client.auth.getUser = async () => ({ data: { user: session.user }, error: null });
    client.auth.refreshSession = async () => ({ data: { session, user: session.user }, error: null });
    client.auth.onAuthStateChange = cb => { setTimeout(() => { try { cb("INITIAL_SESSION", session); } catch (_) { /* a listener of the page */ } }, 0); return { data: { subscription: { id: "fixture", unsubscribe() {} } } }; };
    client.channel = () => { const ch = { on: () => ch, subscribe: () => ch, unsubscribe: async () => "ok", send: async () => "ok", track: async () => "ok" }; return ch; };
    client.removeChannel = async () => "ok"; client.removeAllChannels = async () => [];
    if (client.functions) client.functions.invoke = async name => { w.__unmockedRpc.add(`functions.invoke(${name})`); return { data: null, error: { message: "Failed to send a request to the Edge Function" } }; };

    /* A few modules post to PostgREST with fetch (adventure snapshot, coach portal, session submit): same answers, as HTTP. */
    const nativeFetch = w.fetch.bind(w);
    let supabaseHost = ""; try { supabaseHost = new URL(w.TITAN_SUPABASE_URL).host; } catch (_) { /* no server configured */ }
    w.fetch = async (input, init) => {
      let url; try { url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href); } catch (_) { return nativeFetch(input, init); }
      if (!supabaseHost || url.host !== supabaseHost) return nativeFetch(input, init);
      const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
      const rpcName = /^\/rest\/v1\/rpc\/([a-zA-Z0-9_]+)$/.exec(url.pathname);
      if (rpcName) {
        let args = {}; try { args = JSON.parse((init && init.body) || "{}"); } catch (_) { /* no body */ }
        const out = answer(rpcName[1], args);
        return out.error ? json(out.error, out.error.code === "PGRST202" ? 404 : 400) : json(out.data);
      }
      const table = /^\/rest\/v1\/([a-zA-Z0-9_]+)$/.exec(url.pathname);
      if (table) { const out = await client.from(table[1]); if (out.error) throw new TypeError("Failed to fetch"); return json(out.data ?? [], 200, { "content-range": `0-${Math.max(0, (out.count || 1) - 1)}/${out.count || 0}` }); }
      if (url.pathname === "/auth/v1/user") return json(session.user);
      w.__unmockedRpc.add(`fetch ${url.pathname}`);
      throw new TypeError("Failed to fetch");
    };
  }

  /* After the page is ready: when the app did not sign itself in (the install came too late for its start-up), do it by hand
     the way the e2e journeys do, then let every block read again. */
  const state = w.state;
  const out = { installed: Boolean(w.__connected), owner: state?.user?.id || null, signedIn: false, forced: false };
  if (w.__connected && state?.user) {
    if (state.user.id !== fx.owner) {
      out.forced = true;
      Object.assign(state.user, clone(fx.profile.game_state.user), { id: fx.owner, name: fx.profile.username, level: fx.profile.level, xp: fx.profile.xp, credits: fx.profile.credits, friend_code: fx.profile.friend_code, privacy: clone(fx.profile.privacy) });
      state.history = fx.history.map(l => ({ ...clone(l), user_id: fx.owner, cat: l.category, syncStatus: "confirmed" }));
      state.archivedHistory = [];
      w.titanCloudHistoryLoadedAt = Date.now();
      w.dispatchEvent(new CustomEvent("titan:account-changed"));
      w.dispatchEvent(new CustomEvent("titan:history-updated"));
    }
    out.owner = state.user.id; out.signedIn = state.user.id === fx.owner; out.name = state.user.name;
    out.history = Array.isArray(state.history) ? state.history.length : 0;
    out.flags = w.titanFlags ? Object.keys(fx.flags).filter(k => w.titanFlags.enabled(k, false)).length : null;
  }
  out.unmockedRpc = [...(w.__unmockedRpc || [])].sort();
  out.unmockedFrom = [...(w.__unmockedFrom || [])].sort();
  return out;
}

/** The text appended to the served js/config.js: the client exists by then and nothing has asked it anything yet. */
export const connectedScript = data => `\n;(${installConnected.toString()})(${JSON.stringify(data)});\n`;

/* ---------- The data (built in Node, dates relative to the day of the capture) ---------- */
function prng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** About 120 sessions over six months in eight sports, shaped like the rows of training_logs (details as the session form writes them). */
export function buildHistory(now, count = 120) {
  const rnd = prng(20261117), pick = list => list[Math.floor(rnd() * list.length)], between = (a, b) => a + rnd() * (b - a);
  const round = (v, step) => Math.round(v / step) * step;
  // weights: a runner who lifts twice a week, climbs, rides at the weekend, and swims or stretches now and then
  const plan = [["running", 30], ["muscu_gym", 24], ["bouldering", 14], ["cycling", 12], ["swimming", 8], ["yoga", 8], ["trail", 8], ["hiking", 6]];
  const total = plan.reduce((n, p) => n + p[1], 0);
  const sportAt = () => { let r = rnd() * total; for (const [id, weight] of plan) { if ((r -= weight) < 0) return id; } return "running"; };
  const lifts = [["Squat", "barre", 60, 95], ["Développé couché", "barre", 40, 62.5], ["Soulevé de terre", "barre", 80, 120], ["Tirage vertical", "poulie", 40, 60], ["Développé militaire", "haltères", 14, 22], ["Rowing barre", "barre", 40, 60], ["Fentes bulgares", "haltères", 12, 20], ["Curl biceps", "haltères", 8, 14], ["Presse à cuisses", "machine", 100, 180]];
  const notes = { running: ["Footing tranquille le long des quais.", "Fractionné 8 × 400 m, dernières répétitions dures.", "Sortie longue, bonnes sensations jusqu’au bout.", "", "", "Reprise après deux jours de repos.", "Allure tempo sur la partie plate."], muscu_gym: ["Séance jambes, squat en progression.", "Haut du corps, épaules un peu raides.", "", "Full body rapide entre midi et deux."], bouldering: ["Salle de bloc avec Maximilien, deux 6b enchaînés.", "Travail de dévers, peau entamée.", ""], cycling: ["Boucle du dimanche par les collines.", "Vélotaf aller-retour.", ""], swimming: ["Éducatifs crawl puis 10 × 100 m.", ""], yoga: ["Mobilité hanches et dos.", ""], trail: ["Sentier des crêtes, terrain gras.", "Montée sèche puis descente technique."], hiking: ["Randonnée en famille, pique-nique au sommet.", "Lac d’altitude, départ tôt."] };
  const logs = [];
  const span = 182; // days
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor((i * span) / count + between(0, 1.2));
    const at = new Date(now.getTime() - daysAgo * DAY); at.setHours(pick([7, 7, 12, 18, 18, 19, 10]), pick([0, 10, 15, 30, 40, 45]), 0, 0);
    if (at > now) at.setTime(now.getTime() - 2 * 3600000);
    const sport = i === 0 ? "running" : sportAt(), rpe = Math.min(9, Math.max(2, Math.round(between(3, 8.4))));
    const id = uid(100000 + i), details = { note: pick(notes[sport]), tags: [], extras: {}, bio: { rpe }, exercises: [], elevation: 0, performedAt: at.toISOString(), client_event_id: id, schemaVersion: 2, timezone: "Europe/Paris" };
    let val, unit, minutes;
    if (sport === "running") { val = round(between(5, 16), 0.1); minutes = Math.round(val * between(5.1, 6.2)); unit = "km"; details.elevation = Math.round(between(10, 140)); }
    else if (sport === "trail") { val = round(between(9, 24), 0.1); minutes = Math.round(val * between(7, 9.5)); unit = "km"; details.elevation = Math.round(between(350, 1250)); }
    else if (sport === "cycling") { val = round(between(18, 86), 0.5); minutes = Math.round((val / between(21, 27)) * 60); unit = "km"; details.elevation = Math.round(between(120, 1100)); }
    else if (sport === "hiking") { val = round(between(8, 19), 0.5); minutes = Math.round(val * between(15, 21)); unit = "km"; details.elevation = Math.round(between(300, 1100)); }
    else if (sport === "swimming") { val = round(between(1200, 2800), 50); minutes = Math.round(val / between(38, 46)); unit = "m"; details.extras.pool = "25"; }
    else if (sport === "bouldering") { minutes = Math.round(between(60, 120)); val = minutes; unit = "min"; const tries = Math.round(between(14, 34)); Object.assign(details.extras, { climbing_discipline: "Bloc", location: "Salle", grade_system: "Fontainebleau", attempts: tries, successful_routes: Math.round(tries * between(0.4, 0.75)), max_done: pick(["6a", "6a+", "6b", "6b", "6b+", "6c"]) }); }
    else if (sport === "yoga") { minutes = Math.round(between(25, 60)); val = minutes; unit = "min"; }
    else { // muscu_gym
      minutes = Math.round(between(45, 85)); unit = "kg";
      const chosen = lifts.slice().sort(() => rnd() - 0.5).slice(0, 3 + Math.floor(rnd() * 3));
      details.exercises = chosen.map(([name, variant, lo, hi]) => {
        const progress = 1 - daysAgo / (span * 1.6), weight = round(lo + (hi - lo) * progress * between(0.85, 1), 2.5), sets = 3 + Math.floor(rnd() * 2), reps = pick([5, 6, 8, 8, 10, 12]);
        const setRows = Array.from({ length: sets }, (_, k) => ({ weight, reps: Math.max(3, reps - (k === sets - 1 && rnd() < 0.4 ? 1 : 0)), rir: pick([1, 2, 2, 3]) }));
        const totalReps = setRows.reduce((n, r) => n + r.reps, 0);
        return { name, variant, kind: "weighted", weight, sets, reps, rir: null, totalReps, volume: weight * totalReps, setRows, notes: "" };
      });
      val = details.exercises.reduce((n, e) => n + e.volume, 0);
    }
    details.val1 = unit === "kg" ? 0 : val; details.val2 = minutes; details.duration = minutes;
    const xp = Math.round(minutes * 10 * (rpe >= 7 ? 1.25 : rpe <= 3 ? 0.8 : 1));
    logs.push({ id, client_event_id: id, sport, category: "training", val, unit, date: at.toISOString(), xp, credits: Math.round(xp / 10), details, revision: 1, archived_at: null, created_at: new Date(at.getTime() + minutes * 60000 + 600000).toISOString() });
  }
  return logs.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function buildConnectedData({ now = new Date(), live = false } = {}) {
  const set = JSON.parse(readFileSync(new URL("./flags-production.json", import.meta.url), "utf8"));
  const flags = { ...set.flags, ...(live ? { "screens.live": true } : {}) };
  const iso = days => new Date(now.getTime() + days * DAY).toISOString();
  const day = days => iso(days).slice(0, 10);
  const history = buildHistory(now);
  const token = [{ alg: "HS256", typ: "JWT" }, { sub: OWNER, aud: "authenticated", role: "authenticated", iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600 }].map(part => Buffer.from(JSON.stringify(part)).toString("base64url")).concat("fixture-signature").join(".");
  const authUser = { id: OWNER, aud: "authenticated", role: "authenticated", email: "camille.r@example.test", email_confirmed_at: iso(-190), created_at: iso(-190), last_sign_in_at: iso(-1), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { username: "Camille R.", full_name: "Camille R." } };
  const user = { id: OWNER, name: "Camille R.", onboardedAt: iso(-188), onboardingComplete: true, weeklyGoalSessions: 4 };
  const profile = { id: OWNER, username: "Camille R.", avatar: null, friend_code: "TN-CAM7RX", xp: 1840, credits: 1260, level: 14, state_version: 37, is_elite: false, elite_ends_at: null, elite_refunded_at: null, is_tester: false, is_suspended: false, streak_count: 9, last_week_id: "", privacy: { publicProfile: true, showStats: true, socialPresence: true, friendRankings: true }, inventory: {}, appearance: null, last_seen_news_version: null, created_at: iso(-190), game_state: { user, history: [] } };
  const rpc = {
    titan_feature_flags_v1: { flags, version: set.version },
  };
  return { owner: OWNER, token, authUser, profile, flags, history, goals: [], rpc, generatedAt: now.toISOString() };
}
