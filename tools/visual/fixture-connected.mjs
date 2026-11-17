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
import { createRequire } from "node:module";

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
    // What a returning player's device already holds: the first-visit guide was read, and the flags of the account are cached (a page
    // that draws before the flag request answers would otherwise leave flagged blocks out, a race the bench must not depend on).
    try {
      localStorage.setItem("titan_first_run_guide_v2", "seen");
      localStorage.setItem("titan_flags_v1:" + fx.owner, JSON.stringify({ at: Date.now(), flags: fx.flags }));
    } catch (_) { /* storage blocked: the app asks the fixture anyway */ }
    const session = { access_token: fx.token, refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: fx.authUser };
    const NOT_FOUND = name => ({ data: null, error: { code: "PGRST202", message: `Could not find the function public.${name} in the schema cache`, details: null, hint: null } });
    const OFFLINE = () => ({ data: null, error: { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" }, count: null, status: 0, statusText: "" });

    /* RPC answers: fx.rpc[name] is the value; { __by: "p_action", cases: {…}, default } picks by an argument (dots walk into it);
       { __rows, __range: { field, from, to } } keeps the rows whose field lies between two arguments. */
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
      if (value && typeof value === "object" && value.__rows) {
        const r = value.__range, from = r && args ? args[r.from] : null, to = r && args ? args[r.to] : null;
        return { data: clone(value.__rows.filter(row => !r || ((from == null || row[r.field] >= from) && (to == null || row[r.field] <= to)))), error: null };
      }
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

    /* Tables. Rows are filtered by eq() and friends on the columns they have. The shared catalogues (fx.offlineTables: shop, creatures,
       talents, news…) answer like the cut network of the other states does, so the copies bundled with the app stay in use. */
    function logs() {
      if (!C.logs) C.logs = fx.history.map(l => ({ ...clone(l), user_id: fx.owner }));
      return C.logs;
    }
    // Production serves the whole sports catalogue; the app bundles a copy of it (TITAN_SPORTS_SNAPSHOT, js/core/sports-catalog.js) that
    // is only merged lazily when the network is cut. Serving that copy as the `sports` table gives pages the catalogue a real visitor has.
    function sports() {
      const rows = (w.TITAN_SPORTS_SNAPSHOT || []).map(([id, label, unit, cat, profile, aliases, sort, fields]) => ({ id, label, name: label, slug: id, unit, category: cat, balance_profile: profile, extra_fields: fields || [], sort_order: sort, is_active: true, xp_multiplier: 1, form_type: unit === "km" ? "gps_full" : "duration", tracking_summary: { aliases: String(aliases || "").split("|").filter(Boolean) } }));
      return rows.length ? rows : null;
    }
    const tables = {
      sports,
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
      if (!known && !fx.offlineTables.includes(table)) w.__unmockedFrom.add(table);
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
          if (!known || !q.rows) out = OFFLINE();
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
    // the app's effort rule (js/core/effort.js): 10 XP a minute at a moderate effort, 8 % more or less per point of feeling around 5
    const xp = Math.round(minutes * 10 * (1 + (rpe - 5) * 0.08));
    details.serverReward = true; // what a confirmed row carries once it is read back from the server
    logs.push({ id, client_event_id: id, sport, category: "training", val, unit, date: at.toISOString(), xp, credits: Math.round(xp / 10), details, revision: 1, archived_at: null, created_at: new Date(at.getTime() + minutes * 60000 + 600000).toISOString() });
  }
  return logs.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function buildConnectedData({ now = new Date(), live = false, flags: withFlags = true } = {}) {
  const set = JSON.parse(readFileSync(new URL("./flags-production.json", import.meta.url), "utf8"));
  const flags = withFlags ? { ...set.flags, ...(live ? { "screens.live": true } : {}) } : {}; // `flags: false` is the server with every flag off
  const iso = (days, hour) => { const d = new Date(now.getTime() + days * DAY); if (hour !== undefined) d.setHours(hour, 12, 0, 0); return d.toISOString(); };
  const day = days => { const d = new Date(now.getTime() + days * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const weekday = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = -weekday, sunday = 6 - weekday;
  const history = buildHistory(now);
  const recent = days => history.filter(l => now - new Date(l.date) < days * DAY);
  const token = [{ alg: "HS256", typ: "JWT" }, { sub: OWNER, aud: "authenticated", role: "authenticated", iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600 }].map(part => Buffer.from(JSON.stringify(part)).toString("base64url")).concat("fixture-signature").join(".");
  const authUser = { id: OWNER, aud: "authenticated", role: "authenticated", email: "camille.r@example.test", email_confirmed_at: iso(-190), created_at: iso(-190), last_sign_in_at: iso(-1), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { username: "Camille R.", full_name: "Camille R." } };

  /* People around the account. Long names are on purpose: they exercise wrapping. */
  const MAX = { id: uid(201), name: "Maximilien de La Rochefoucauld" };
  const friends = [
    { ...MAX, avatar: "keeper", level: 17, week_days: 3, last_active: day(0) },
    { id: uid(202), name: "Inès Belkacem", avatar: "scout", level: 12, week_days: 2, last_active: day(-1) },
    { id: uid(203), name: "Théo Marchand", avatar: "ranger", level: 9, week_days: 1, last_active: day(-2) },
    { id: uid(204), name: "Anne-Sophie Lefèvre-Dumoulin", avatar: "artisan", level: 21, week_days: 4, last_active: day(0) },
    { id: uid(205), name: "Yanis O.", avatar: "navigator", level: 6, week_days: 0, last_active: day(-9) },
    { id: uid(206), name: "Clémence", avatar: "scout", level: null, week_days: null, last_active: null }, // shares no statistics
    { id: uid(207), name: "Baptiste Roussel", avatar: "ranger", level: 15, week_days: 2, last_active: day(-1) },
  ];

  /* Account, profile row and what the app stores in it */
  const LEVEL = 14, XP = 4797, NEXT = 15450, CREDITS = 1260; // level and XP are what the app's own rules give this history
  const schedule = { monday: { sport: "running", minutes: 45, note: "Footing en endurance" }, tuesday: { sport: "muscu_gym", minutes: 60, note: "Jambes et gainage" }, wednesday: { sport: null, minutes: null, note: "" }, thursday: { sport: "bouldering", minutes: 90, note: "Salle avec Maximilien" }, friday: { sport: "muscu_gym", minutes: 60, note: "Haut du corps" }, saturday: { sport: null, minutes: null, note: "" }, sunday: { sport: "running", minutes: 80, note: "Sortie longue" } };
  const user = { id: OWNER, name: "Camille R.", onboardedAt: iso(-188), onboardingComplete: true, weeklyGoalSessions: 4, favoriteSports: ["running", "muscu_gym", "bouldering"], schedule, cadencePauses: [] };
  const privacy = { publicProfile: true, showStats: true, socialPresence: true, friendRankings: true };
  const profile = { id: OWNER, username: "Camille R.", avatar: null, friend_code: "TN-CAM7RX", xp: XP, credits: CREDITS, level: LEVEL, state_version: 37, is_elite: false, elite_ends_at: null, elite_refunded_at: null, is_tester: false, is_suspended: false, streak_count: 9, last_week_id: "", privacy, inventory: {}, appearance: { frame: "frame-guardian", map: "map-mist" }, last_seen_news_version: null, created_at: iso(-190), game_state: { user, history: [] } };
  const weekXp = recent(weekday + 1).reduce((n, l) => n + l.xp, 0), weekCredits = Math.round(weekXp / 10);
  const progression = [{ server_user_id: OWNER, user_id: OWNER, level: LEVEL, xp: XP, credits: CREDITS, is_elite: false, is_tester: false, is_suspended: false, training_total: history.length, training_7d: recent(7).length, training_30d: recent(30).length, last_training_at: history[0].date, week_start: day(monday), weekly_xp_used: weekXp, weekly_credits_used: weekCredits, weekly_xp_cap: 9600, weekly_credit_cap: 960, weekly_xp_remaining: Math.max(0, 9600 - weekXp), weekly_credits_remaining: Math.max(0, 960 - weekCredits), authority: "server_authoritative", rules_version: "v300", checked_at: now.toISOString() }];

  /* Atelier: the catalogue of supabase/release-300.sql (shop_items, cosmetics), with what this account owns and wears */
  const owned = new Set(["frame-standard", "frame-neon", "frame-tide", "frame-sentinel", "frame-guardian", "map-default", "map-mist", "card-default", "card-chalk"]);
  const items = [
    ["cos_frame_standard", "frame-standard", "frame", "default", "Portrait nu", "Le portrait tel quel, sans cadre.", 0, 1],
    ["cos_frame_neon", "frame-neon", "frame", "credits", "Cadre Néon", "Un liseré cyan, net et discret.", 450, 1],
    ["cos_frame_crimson", "frame-crimson", "frame", "credits", "Cadre Braise", "Un anneau cuivré qui rougeoit doucement.", 700, 1],
    ["cos_frame_tide", "frame-tide", "frame", "credits", "Cadre Marée", "Deux bleus qui se croisent comme une ligne d’eau.", 900, 1],
    ["cos_frame_summit", "frame-summit", "frame", "credits", "Cadre Cime", "Un trait de neige sur fond d’ardoise, pour les longues saisons.", 1400, 1],
    ["cos_frame_sentinel", "frame-sentinel", "frame", "rank", "Cadre Sentinelle", "Remis au rang Sentinelle. Ne s’achète pas.", 0, 6],
    ["cos_frame_guardian", "frame-guardian", "frame", "rank", "Cadre Gardien", "Remis au rang Gardien. Ne s’achète pas.", 0, 10],
    ["cos_frame_champion", "frame-champion", "frame", "rank", "Cadre Champion", "Remis au rang Champion. Ne s’achète pas.", 0, 15],
    ["cos_frame_titan", "frame-titan", "frame", "rank", "Cadre Titan", "Remis au rang Titan. Ne s’achète pas.", 0, 25],
    ["cos_frame_legend", "frame-legend", "frame", "rank", "Cadre Légende", "Remis au rang Légende. Ne s’achète pas.", 0, 40],
    ["cos_frame_aegis", "frame-aegis", "frame", "plus", "Cadre Aegis", "Or mat et double filet. Inclus avec TITAN+.", 0, 1],
    ["cos_frame_frost", "frame-frost", "frame", "plus", "Cadre Givre", "Un cristal pâle autour du portrait. Inclus avec TITAN+.", 0, 1],
    ["cos_map_default", "map-default", "map", "default", "Carte d’origine", "Les couleurs de chaque monde, telles que dessinées.", 0, 1],
    ["cos_map_mist", "map-mist", "map", "credits", "Brume", "Une lumière basse et laiteuse sur la carte d’aventure.", 600, 1],
    ["cos_map_night", "map-night", "map", "credits", "Nuit polaire", "La carte sous un ciel froid, balises plus vives.", 1000, 1],
    ["cos_map_aurora", "map-aurora", "map", "plus", "Aurores", "Un voile vert et violet venu de la citadelle. Inclus avec TITAN+.", 0, 1],
    ["cos_card_default", "card-default", "card", "default", "Carte TITAN", "La carte partageable sobre, noir et cyan.", 0, 1],
    ["cos_card_chalk", "card-chalk", "card", "credits", "Craie", "Fond clair et trait de craie, comme un tableau de salle.", 400, 1],
    ["cos_card_ember", "card-ember", "card", "credits", "Braise", "Dégradé cuivre pour les records qui comptent.", 800, 1],
    ["cos_card_obsidian", "card-obsidian", "card", "plus", "Obsidienne", "Noir profond et reflet violet des forges. Inclus avec TITAN+.", 0, 1],
  ].map(([id, cosmetic, slot, unlock, name, description, price, min_level]) => ({ id, cosmetic, slot, unlock, name, description, price, min_level, owned: owned.has(cosmetic), permanent: owned.has(cosmetic) && unlock !== "plus", plus_access: unlock === "plus" }));
  const atelier = { owner: OWNER, credits: CREDITS, level: LEVEL, week_credits: weekCredits, week_credit_cap: 960, plus: { active: false, status: null, renews_at: null, ends_at: null }, appearance: { frame: "frame-guardian", map: "map-mist", card: "card-default" }, items };

  /* Adventure (snapshot v4): the first world finished, the second on its way, the third just opened */
  const sources = n => history.slice(n, n + 3).map(l => l.id);
  const questPlan = (daysDone, effortDone, noted) => ({ version: 1, profile: { days: 11, daysTarget: 2, effortTarget: 40, windowDays: 28, frozen_at: iso(-6) }, items: [{ id: "days", value: daysDone, target: 2, complete: daysDone >= 2 }, { id: "effort", value: effortDone, target: 40, complete: effortDone >= 40 }, { id: "note", value: noted, target: 1, complete: noted >= 1 }] });
  const TARGETS = [1, 2, 2, 2, 3, 2, 3, 3, 3];
  const campaign = (id, chapter, started, evidence, quests, completed = null) => ({ id, tier: "free", chapter, route: id === "marees" ? "journal" : "rhythm", started_at: started, completed_at: completed, target: chapter >= 1 && chapter <= 9 ? TARGETS[chapter - 1] : 0, effort_target: chapter === 9 ? 150 : 0, main_objective: chapter >= 1 && chapter <= 9 ? { version: 1, days: TARGETS[chapter - 1], effort: chapter === 9 ? 150 : 0, frozen_at: started } : null, quests, evidence });
  const rewards = [
    ...[1, 2, 3].map(ch => ({ world: "marees", chapter: ch, earned_at: iso(-34 + ch * 9), source_ids: sources(ch) })),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(ch => ({ world: "aube", chapter: ch, earned_at: iso(-170 + ch * 13), source_ids: sources(20 + ch) })),
  ].sort((a, b) => (a.earned_at < b.earned_at ? 1 : -1));
  const adventure = { version: 4, owner: OWNER, generated_at: now.toISOString(), level: LEVEL, xp: XP, credits: CREDITS, next_level_xp: NEXT, plus: false, avatar: "keeper", selected_world: "marees", revision: 27,
    campaigns: [
      campaign("aube", 10, iso(-176), { days: 0, effort: 0, source_ids: [] }, null, iso(-53)),
      campaign("aurores", 0, null, { days: 0, effort: 0, source_ids: [] }, null),
      campaign("forge", 1, iso(-3), { days: 1, effort: 58, source_ids: sources(0).slice(0, 1) }, questPlan(1, 40, 0)),
      campaign("marees", 4, iso(-6), { days: 1, effort: 62, source_ids: sources(1).slice(0, 1) }, questPlan(2, 40, 1)),
    ],
    quest_rewards: [{ world: "marees", chapter: 4, quest_id: "days", earned_at: iso(-1) }, { world: "marees", chapter: 4, quest_id: "effort", earned_at: iso(-2) }, { world: "marees", chapter: 3, quest_id: "note", earned_at: iso(-9) }, { world: "marees", chapter: 2, quest_id: "days", earned_at: iso(-17) }, { world: "aube", chapter: 9, quest_id: "effort", earned_at: iso(-55) }, { world: "aube", chapter: 7, quest_id: "note", earned_at: iso(-80) }],
    rewards };
  // Secondary encounters (titan_adventure_rpg_snapshot_v1): eighteen milestones a world, answered for the world that is asked.
  let rpgPath = () => []; try { rpgPath = createRequire(import.meta.url)("../../js/core/adventure-rpg.js").path; } catch (_) { /* the bench runs without the app's sources: no narrative choice is recorded */ }
  const rpg = (world, target, earned, days, effort) => ({ version: 1, owner: OWNER, world, active: true, chapter: world === "aube" ? 9 : 4, target, days, effort, familyTitles: world === "aube" ? [{ family: "endurance" }, { family: "strength" }] : [],
    rewards: Array.from({ length: earned }, (_, i) => { const node = rpgPath(world).find(n => n.ordinal === i + 1); return { ordinal: i + 1, earned_at: iso(-150 + i * 9), ...(node && node.kind === "choice" ? { choice: i % 2 } : {}) }; }),
    milestones: Array.from({ length: 18 }, (_, i) => ({ ordinal: i + 1, earned: i < earned, ready: false, effortTarget: (i + 1) * target, daysTarget: Math.ceil((i + 1) / 2) })) });
  const rpgOff = world => ({ version: 1, owner: OWNER, world, active: false, chapter: 0, target: 0, days: 0, effort: 0, familyTitles: [], rewards: [], milestones: [] });
  const journeyAt = iso(-1, 21);
  const journey = { version: 1, owner: OWNER, configVersion: 1, totalSteps: 1386400, goal: 30000000, today: { day: day(0), steps: 6240, sources: ["health_connect"], updatedAt: now.toISOString() },
    discoveries: [
      { id: "d1", steps: 10000, world: "aube", name: "La première trace", story: "La brume se lève sur le sentier, et tes pas y restent.", kind: "milestone", earnedAt: iso(-178) },
      { id: "d2", steps: 30000, world: "aube", name: "Le refuge des cèdres", story: "Une lumière attend au refuge, entretenue par ceux qui passent.", kind: "discovery", earnedAt: iso(-172) },
      { id: "d3", steps: 75000, world: "aube", name: "La source", story: "Le chemin rejoint la source. L’eau y est froide et claire.", kind: "discovery", earnedAt: iso(-160) },
      { id: "d4", steps: 250000, world: "aube", name: "Le belvédère du Veilleur", story: "D’ici, on voit la vallée entière et le fil de tes journées.", kind: "milestone", earnedAt: iso(-131) },
      { id: "d5", steps: 600000, world: "marees", name: "La jetée des passeurs", story: "Les barques attendent la marée. Un passeur te fait signe.", kind: "discovery", earnedAt: iso(-88) },
      { id: "d6", steps: 1000000, world: "marees", name: "Le million de pas", story: "Un million de pas : la côte entière connaît ta foulée.", kind: "legendary", earnedAt: iso(-41) },
      { id: "d7", steps: 1500000, world: "marees", name: "Le phare des courants contraires", story: "Le phare guide ceux qui reviennent, même après une longue pause.", kind: "discovery", earnedAt: null },
      { id: "d8", steps: 2500000, world: "forge", name: "La passerelle de cuivre", story: "La forge s’entend de loin. La passerelle vibre sous les pas.", kind: "milestone", earnedAt: null },
      { id: "d9", steps: 5000000, world: "aurores", name: "Le col des cinq millions", story: "Au col, le ciel change de couleur à chaque heure.", kind: "legendary", earnedAt: null },
    ],
    career: { level: LEVEL, milestones: [
      { id: "c5", level: 5, title: "Premier souvenir", description: "La mémoire de tes premières séances.", earnedAt: iso(-150) },
      { id: "c10", level: 10, title: "Passeuse", description: "Dix niveaux : tu sais revenir après une pause.", earnedAt: iso(-74) },
      { id: "c15", level: 15, title: "Championne des saisons", description: "Le prochain souvenir, au rang Champion.", earnedAt: null },
      { id: "c25", level: 25, title: "Titan", description: "Un souvenir pour celles et ceux qui durent.", earnedAt: null },
    ] } };
  const periodic = { version: 1,
    week: { scope: "week", period_start: day(monday), period_end: day(sunday), kind: "constancy", target: { days: 3 }, progress: { days: Math.min(3, new Set(recent(weekday + 1).map(l => l.date.slice(0, 10))).size) }, complete: false, claimed: false, focus: ["running"] },
    month: { scope: "month", period_start: `${day(0).slice(0, 8)}01`, period_end: `${day(0).slice(0, 8)}30`, kind: "multisport", target: { sports: 2 }, progress: { sports: 2 }, complete: true, claimed: false },
    souvenirs: { weeks: 7, months: 3 } };
  periodic.week.complete = periodic.week.progress.days >= 3;

  /* QG blocks */
  const stepSeed = prng(77);
  const steps = Array.from({ length: 61 }, (_, i) => ({ day: day(-i), steps: i === 0 ? 6240 : Math.round(3800 + stepSeed() * 9400), sources: i % 9 === 4 ? ["garmin"] : ["health_connect"], updatedAt: i === 0 ? now.toISOString() : iso(-i, 22) })).filter((_, i) => i % 13 !== 7);
  const buddy = { status: "active", id: uid(301), role: "inviter", partner: { id: MAX.id, name: MAX.name }, daysLeft: 9, target: 12, myDays: 4, partnerDays: 3, together: 5, nudgedToday: false, nudgesReceived: 2 };
  const season = { current: { id: uid(311), name: "Saison des premiers frimas", rules: "Quatre semaines pour garder le rythme quand les jours raccourcissent. Chaque jour actif compte, quel que soit le sport.", rulesVersion: 2, startsOn: day(-15), endsOn: day(12), state: "running", participants: 1284, joined: true, myMinutes: 612, myDays: 9 },
    archive: [
      { id: uid(312), name: "Saison d’automne", startsOn: day(-44), endsOn: day(-17), rulesVersion: 2, participants: 1037, minutes: 412360, closedAt: iso(-16), mine: { minutes: 1385, days: 17 } },
      { id: uid(313), name: "Saison de la rentrée", startsOn: day(-72), endsOn: day(-45), rulesVersion: 1, participants: 864, minutes: 301275, closedAt: iso(-44), mine: null },
    ] };
  const commonQuest = { id: uid(321), title: "Dix mille minutes ensemble", detail: "Tous les sports comptent, 90 minutes au plus par jour et par personne.", weekStart: day(monday), endsAt: iso(sunday, 23), target: 10000, minutes: 3460, members: 214, joined: true, mine: 95, state: "open" };
  const worldGoal = { id: uid(331), title: "Cap sur l’hiver : un million de minutes", detail: "Tous les sports comptent pareil. Trois paliers à franchir ensemble avant la fin du mois.", startsOn: day(-15), endsOn: day(12), levels: [250000, 600000, 1000000], minutes: 412870, members: 3187, joined: true, mine: 612, level: 1, state: "open" };
  const intents = { mine: { intent: "Sortie longue de 14 km, allure tranquille", visibility: "friends", done: false, cheers: 2 },
    friends: [
      { userId: friends[0].id, name: friends[0].name, intent: "Séance de bloc à la salle, travailler les dévers sans se cramer les doigts", done: false, cheered: true },
      { userId: friends[1].id, name: friends[1].name, intent: "Nager 1 500 m", done: true, cheered: false },
      { userId: friends[3].id, name: friends[3].name, intent: "Repos actif : 30 min de mobilité", done: false, cheered: false },
      { userId: friends[6].id, name: friends[6].name, intent: "Fractionné 6 × 800 m", done: true, cheered: true },
    ] };
  const ranking = { optedIn: true, formula: 1, entries: [
    { rank: 1, name: friends[3].name, score: 100, activeDays: 16, progressPct: 100, me: false },
    { rank: 2, name: friends[0].name, score: 86, activeDays: 12, progressPct: 65, me: false },
    { rank: 3, name: "Camille R.", score: 78, activeDays: 13, progressPct: 45, me: true },
    { rank: 3, name: friends[6].name, score: 78, activeDays: 11, progressPct: 58, me: false },
    { rank: 5, name: friends[1].name, score: 61, activeDays: 9, progressPct: 40, me: false },
    { rank: 6, name: friends[2].name, score: 44, activeDays: 7, progressPct: 22, me: false },
    { rank: 7, name: "Clémence", score: 30, activeDays: 6, progressPct: 0, me: false },
    { rank: 8, name: friends[4].name, score: 5, activeDays: 1, progressPct: 0, me: false },
  ] };

  /* Community */
  const expedition = { id: "hiver-2026", title: "La traversée des premiers givres", story: "Le Gardien du Col tient le passage sous la neige. Chaque minute d’effort de la communauté le fait reculer d’un pas.", guardian: "Le Gardien du Col", status: "active", starts_at: iso(-9), ends_at: iso(12), collective_minutes: 1284600, collective_goal: 2000000, participants: 4172, daily_cap: 90, personal_days: 8, personal_minutes: 480, reward_title: "Passe-givre", me: { joined: true, minutes: 395, days: 6, personal_done: false } };
  const social = { me: { id: OWNER, friend_code: "TN-CAM7RX", findable: true }, friends,
    requests_in: [{ id: uid(401), name: "Élodie Vasseur-Lemaître", avatar: "scout" }, { id: uid(402), name: "Karim B.", avatar: "ranger" }],
    requests_out: [{ id: uid(403), name: "Jeanne" }],
    challenges: [
      { id: uid(411), title: "Novembre sans lâcher : 600 minutes chacun", metric: "effort_minutes", sport: null, target: 600, status: "active", my_status: "joined", ends_at: iso(13), members: [
        { id: OWNER, name: "Camille R.", status: "joined", progress: 395 }, { id: friends[3].id, name: friends[3].name, status: "joined", progress: 512 }, { id: friends[0].id, name: friends[0].name, status: "joined", progress: 340 }, { id: friends[1].id, name: friends[1].name, status: "joined", progress: 205 }, { id: friends[4].id, name: friends[4].name, status: "invited", progress: 0 }] },
      { id: uid(412), title: "Duel du week-end : 30 km à pied", metric: "distance_km", sport: "running", target: 30, status: "active", my_status: "invited", ends_at: iso(5), members: [
        { id: friends[6].id, name: friends[6].name, status: "joined", progress: 11.4 }, { id: OWNER, name: "Camille R.", status: "invited", progress: 0 }] },
      { id: uid(413), title: "Dix jours actifs en octobre", metric: "active_days", sport: null, target: 10, status: "ended", my_status: "joined", ends_at: iso(-17), members: [
        { id: OWNER, name: "Camille R.", status: "joined", progress: 10 }, { id: friends[2].id, name: friends[2].name, status: "joined", progress: 8 }, { id: friends[0].id, name: friends[0].name, status: "joined", progress: 12 }] },
    ],
    expedition,
    moments: [
      { id: uid(421), kind: "record", title: "Record sur 10 km", detail: "49 min 12 s · 4:55 /km", created_at: iso(-1), mine: true, cheers: 4, cheered: false },
      { id: uid(422), kind: "session", title: "Sortie longue en forêt de Rambouillet, sous la pluie du début à la fin", detail: "21,3 km · 2 h 04", created_at: iso(-1), author: { name: friends[3].name, avatar: "artisan" }, mine: false, cheers: 7, cheered: true },
      { id: uid(423), kind: "goal", title: "Objectif atteint : 100 km en octobre", detail: "104,6 km", created_at: iso(-3), author: { name: friends[6].name, avatar: "ranger" }, mine: false, cheers: 3, cheered: false },
      { id: uid(424), kind: "chapter", title: "Chapitre 3 de L’archipel des Marées", created_at: iso(-4), mine: true, cheers: 2, cheered: false },
      { id: uid(425), kind: "milestone", title: "100 séances au journal", created_at: iso(-12), author: { name: MAX.name, avatar: "keeper" }, mine: false, cheers: 12, cheered: true },
      { id: uid(426), kind: "week", title: "Semaine pleine : 5 jours actifs", detail: "6 h 10 d’effort", created_at: iso(-15), author: { name: friends[1].name, avatar: "scout" }, mine: false, cheers: 0, cheered: false },
      { id: uid(427), kind: "expedition", title: "A rejoint La traversée des premiers givres", created_at: iso(-8), author: { name: friends[2].name, avatar: "ranger" }, mine: false, cheers: 1, cheered: false },
    ],
    guild: { minutes: 1840, target: 3000, members: [
      { id: friends[3].id, name: friends[3].name, role: "owner", minutes: 540 }, { id: OWNER, name: "Camille R.", role: "member", minutes: 395 }, { id: MAX.id, name: MAX.name, role: "member", minutes: 340 }, { id: friends[6].id, name: friends[6].name, role: "member", minutes: 310 }, { id: friends[1].id, name: friends[1].name, role: "member", minutes: 205 }, { id: friends[4].id, name: friends[4].name, role: "member", minutes: 50 }] } };
  const guild = { id: uid(431), name: "Les Lève-tôt de la Croix-Rousse", code: "G-LT69X", owner_id: friends[3].id, messages: [
    { id: 1, sender_name: friends[3].name, content: "Objectif de la semaine réglé à 3 000 minutes, on y va tranquillement.", created_at: iso(-2) },
    { id: 2, sender_name: "Camille R.", content: "Sortie longue dimanche matin, départ 8 h au parc de la Tête d’Or pour celles et ceux qui veulent.", created_at: iso(-1) },
    { id: 3, sender_name: MAX.name, content: "J’en suis ! Je ramène le thé.", created_at: iso(-1) },
    { id: 4, sender_name: friends[4].name, content: "Reprise en douceur pour moi, genou encore capricieux.", created_at: iso(0) },
  ] };
  const duels = { mine: [
    { id: uid(441), title: "Duel du dimanche : qui tient 90 minutes ?", endsAt: iso(5), links: [{ id: uid(442), expiresAt: iso(3), used: false }, { id: uid(443), expiresAt: iso(2), used: true }] },
    { id: uid(444), title: "Défi escalade entre collègues", endsAt: iso(11), links: [] },
  ], ended: [{ id: uid(445), title: "Défi d’octobre : 20 km chacun", endedAt: iso(-17) }, { id: uid(446), title: "Semaine sans ascenseur", endedAt: iso(-38) }] };
  const clubs = [
    { id: uid(451), name: "Les Grimpeurs du Vercors — section bloc", description: "Bloc en salle le jeudi soir, falaise dès que le rocher est sec. Tous niveaux, on assure les débutants.", discoverable: true, role: "admin", members: 23, code: "VRCS2026",
      roster: [{ userId: OWNER, name: "Camille R.", role: "admin" }, { userId: MAX.id, name: MAX.name, role: "member" }, { userId: friends[2].id, name: friends[2].name, role: "member" }, { userId: uid(461), name: "Solène Arnaud", role: "member" }, { userId: uid(462), name: "Jean-Baptiste Poquelin", role: "member" }, { userId: uid(463), name: "Lucie M.", role: "member" }],
      trophies: [{ id: uid(471), title: "Saison d’automne menée ensemble", note: "Dix-huit membres sont allés au bout des quatre semaines.", on: day(-16) }, { id: uid(472), title: "Premier anniversaire du club", note: null, on: day(-80) }],
      announcements: [{ id: uid(481), body: "Sortie falaise à Presles samedi si la météo tient : rendez-vous 8 h 30 au parking du haut, covoiturage dans la discussion.", at: iso(-1), mine: true }, { id: uid(482), body: "La salle ferme à 21 h jeudi pour l’ouverture des nouveaux blocs.", at: iso(-4), mine: false }] },
    { id: uid(452), name: "Foulées du mardi soir", description: null, discoverable: false, role: "member", members: 9, code: null, roster: null, trophies: [],
      announcements: [{ id: uid(483), body: "Mardi : 8 × 400 m sur la piste, échauffement à 19 h.", at: iso(-2), mine: false }] },
  ];
  const clubsFound = [
    { id: uid(453), name: "Natation de quartier — bassin Jean-Bouin", description: "Lundi et jeudi soir, lignes par niveau.", members: 31 },
    { id: uid(454), name: "Rando douce du dimanche", description: "Sorties à la journée, 12 à 18 km, sans chrono.", members: 58 },
    { id: uid(455), name: "Vélotaf Lyon", description: null, members: 112 },
  ];
  const factions = { mine: "sentier", joinedAt: iso(-18), canChangeAt: iso(12), factions: [
    { key: "aube", name: "Les Veilleurs de l’Aube", motto: "Tenir la lumière.", emblem: "sunrise", members: 1412, minutes: 96340 },
    { key: "forge", name: "Les Forgerons", motto: "Bâtir l’effort.", emblem: "anvil", members: 1187, minutes: 88215 },
    { key: "sentier", name: "Les Arpenteurs du Sentier", motto: "Aller plus loin.", emblem: "path", members: 1603, minutes: 121870 },
  ] };
  const pantheon = { mine: true, hiddenByTeam: false, profilePublic: true, entries: [
    { name: "Camille R.", kind: "season", label: "A mené Saison d’automne jusqu’au bout", at: iso(-16), me: true, userId: OWNER },
    { name: friends[3].name, kind: "season", label: "A mené Saison d’automne jusqu’au bout", at: iso(-16), me: false, userId: null },
    { name: "Hervé T.", kind: "pioneer", label: "Pionnier de TITAN", at: iso(-21), me: false, userId: null },
    { name: MAX.name, kind: "expedition", label: "A franchi La traversée des brumes avec la communauté", at: iso(-30), me: false, userId: null },
    { name: "Nolwenn Le Guellec", kind: "pioneer", label: "Pionnière de TITAN", at: iso(-52), me: false, userId: null },
    { name: "Sacha", kind: "season", label: "A mené Saison de la rentrée jusqu’au bout", at: iso(-44), me: false, userId: null },
  ] };
  const polls = [
    { id: uid(491), title: "Quelle quête commune la semaine prochaine ?", detail: "Une seule voix par compte, modifiable jusqu’à la clôture.", opensAt: iso(-2), closesAt: iso(4), state: "open", myVote: 2, options: [{ position: 1, label: "Endurance : 12 000 minutes ensemble" }, { position: 2, label: "Régularité : 3 jours actifs chacun" }, { position: 3, label: "Multisport : deux familles de sports dans la semaine" }] },
    { id: uid(492), title: "Quel thème pour la saison d’hiver ?", detail: null, opensAt: iso(-30), closesAt: iso(-21), state: "closed", myVote: 2, options: [{ position: 1, label: "Forêt sous la neige", votes: 318 }, { position: 2, label: "Haute montagne", votes: 742 }, { position: 3, label: "Bord de mer en hiver", votes: 205 }] },
  ];
  const roadmap = [
    { id: uid(501), title: "Synchronisation Strava", detail: "Recevoir ses activités sans les ressaisir.", status: "doing", votes: 1284, mine: true, history: [] },
    { id: uid(502), title: "Plans d’entraînement partagés entre amis", detail: null, status: "planned", votes: 412, mine: false, history: [] },
    { id: uid(503), title: "Duels en équipe, club contre club", detail: "Deux clubs, une semaine, la somme des jours actifs.", status: "study", votes: 356, mine: true, history: [] },
    { id: uid(504), title: "Widget d’écran d’accueil sur Android", detail: null, status: "study", votes: 198, mine: false, history: [] },
    { id: uid(505), title: "Mode sombre automatique selon l’heure", detail: null, status: "wish", votes: 87, mine: false, history: [] },
    { id: uid(506), title: "Export GPX de ses parcours", detail: null, status: "shipped", votes: 640, mine: true, history: [] },
  ];

  /* Profile */
  const titles = [{ id: "automne-2026", title: "Passe-brume", expedition: "La traversée des brumes", ended_at: day(-30) }, { id: "ete-2026", title: "Marcheuse des crêtes", expedition: "L’échappée des hautes crêtes", ended_at: day(-95) }];
  const sourcesRows = [{ source: "health_connect", granted: true, granted_at: iso(-140), imported: 0 }, { source: "garmin", granted: true, granted_at: iso(-96), imported: 14 }];

  /* Coaching: one coach follows this account; the account also follows one athlete (second tab) */
  const COACH = { id: uid(601), name: "Hélène Marchetti — Coach trail & endurance" };
  const linkAthlete = { id: uid(611), athlete_id: OWNER, coach_id: COACH.id, coach_name: COACH.name, athlete_name: "Camille R.", since_date: day(-60), accepted_at: iso(-60), revision: 4, sport: null, share_details: true, share_notes: true };
  const linkCoach = { id: uid(612), athlete_id: MAX.id, coach_id: OWNER, coach_name: "Camille R.", athlete_name: MAX.name, since_date: day(-21), accepted_at: iso(-21), revision: 2, sport: "bouldering", share_details: false, share_notes: false };
  const shared = recent(28).map(l => ({ id: l.id, sport: l.sport, date: l.date, val: l.val, unit: l.unit, details: l.details }));
  const task = (n, status, title, sport, offset, instructions) => ({ id: uid(620 + n), status, title, sport, planned_date: day(offset), created_at: iso(offset - 6), revision: 1, instructions });
  const tasksAthlete = [
    task(1, "proposed", "Sortie longue vallonnée, 1 h 45 en aisance respiratoire", "trail", 5, "Reste en endurance fondamentale : tu dois pouvoir parler. Marche dans les montées raides, relance en haut. Emporte 500 ml d’eau et de quoi manger après une heure."),
    task(2, "accepted", "Fractionné court 10 × 300 m", "running", 2, "Échauffement 20 min, puis 10 × 300 m à allure 5 km, récupération 1 min 15 en trottinant. Retour au calme 10 min."),
    task(3, "completed", "Renforcement jambes et gainage", "muscu_gym", -3, "Squat 4 × 8, fentes bulgares 3 × 10 par jambe, gainage 3 × 45 s."),
    task(4, "declined", "Côtes longues 6 × 3 min", "running", -8, null),
    task(5, "completed", "Footing de récupération 40 min", "running", -10, null),
  ];
  const tasksCoach = [task(11, "proposed", "Séance dévers : 5 blocs à travailler, 4 essais chacun", "bouldering", 3, "Repos complet entre les essais. Arrête si la peau lâche."), task(12, "completed", "Volume facile : 15 blocs en dessous de ton niveau", "bouldering", -6, null)];
  const coachPortal = { __by: "p_action", cases: {
    snapshot: { capacity: 3, seatsUsed: 1, plan: null, invites: [{ id: uid(631), created_at: iso(-2), expires_at: iso(5) }], links: [linkAthlete, linkCoach] },
    sessions: { __by: "p_data.link_id", cases: { [linkAthlete.id]: { revision: linkAthlete.revision, total: shared.length, rows: shared.slice(0, 20) }, [linkCoach.id]: { revision: linkCoach.revision, total: 3, rows: [0, 1, 2].map(i => ({ id: uid(640 + i), sport: "bouldering", date: iso(-2 - i * 4, 19), val: 75 + i * 10, unit: "min", details: { duration: 75 + i * 10 } })) } } },
    assignments: { __by: "p_data.link_id", cases: { [linkAthlete.id]: { revision: linkAthlete.revision, total: tasksAthlete.length, rows: tasksAthlete }, [linkCoach.id]: { revision: linkCoach.revision, total: tasksCoach.length, rows: tasksCoach } } },
  } };
  const messages = { more: true, rows: [
    { id: uid(651), body: "Bravo pour le 10 km de dimanche, belle gestion de course. On garde une semaine légère avant de relancer.", at: iso(-2, 9), mine: false, read: true },
    { id: uid(652), body: "Merci ! Les jambes étaient lourdes sur la fin, mais le souffle allait bien. Je peux déplacer le fractionné à jeudi ? J’ai une réunion tard mercredi.", at: iso(-2, 12), mine: true, read: true },
    { id: uid(653), body: "Oui, jeudi c’est très bien. Pense à dormir, ton check-in de la semaine dernière montrait un sommeil en baisse.", at: iso(-1, 8), mine: false, read: true },
    { id: uid(654), body: "Noté, je me couche plus tôt cette semaine.", at: iso(-1, 20), mine: true, read: false },
  ] };
  const checkins = { rows: [
    { week: day(monday), scores: { fatigue: 3, energy: 4, sleep: 3, motivation: 5 }, note: "Semaine chargée au travail, mais l’envie est là.", shared: true },
    { week: day(monday - 7), scores: { fatigue: 4, energy: 3, sleep: 2, motivation: 4 }, note: null, shared: true },
    { week: day(monday - 14), scores: { fatigue: 2, energy: 4, sleep: 4, motivation: 4 }, note: "Bonne récupération après la sortie longue.", shared: false },
  ] };
  const templates = [{ id: uid(661), title: "Bloc — volume facile", sport: "bouldering", instructions: "15 blocs deux cotations sous le maximum, 2 min de repos." }, { id: uid(662), title: "Bloc — travail de dévers en pyramide (4-5-6-5-4)", sport: "bouldering", instructions: "Pyramide de difficulté, 3 min de repos entre les blocs." }];

  const goals = [
    { id: uid(701), user_id: OWNER, title: "Mes 100 km de novembre", metric: "distance", target: 100, sport: "running", start_date: `${day(0).slice(0, 8)}01`, end_date: `${day(0).slice(0, 8)}30`, archived_at: null, revision: 1, created_at: iso(-17) },
    { id: uid(702), user_id: OWNER, title: "Un mois en mouvement", metric: "days", target: 14, sport: null, start_date: day(-15), end_date: day(12), archived_at: null, revision: 2, created_at: iso(-15) },
    { id: uid(703), user_id: OWNER, title: "Préparer le trail des Crêtes du Vercors (32 km, 1 600 m de dénivelé)", metric: "minutes", target: 1500, sport: "trail", start_date: day(-40), end_date: day(44), archived_at: null, revision: 1, created_at: iso(-40) },
    { id: uid(704), user_id: OWNER, title: "Huit séances de force en octobre", metric: "sessions", target: 8, sport: "muscu_gym", start_date: day(-47), end_date: day(-17), archived_at: null, revision: 1, created_at: iso(-47) },
    { id: uid(705), user_id: OWNER, title: "Reprise après l’été", metric: "sessions", target: 12, sport: null, start_date: day(-110), end_date: day(-82), archived_at: iso(-80), revision: 3, created_at: iso(-110) },
  ];

  const premium = { version: 1, owner: OWNER, available: false, reason: "premium_required" };
  const ok = {}; // a write that the capture never sends, answered so a stray call is not reported as missing
  const rpc = {
    titan_feature_flags_v1: { flags, version: set.version },
    titan_get_progression_snapshot: progression,
    titan_my_verification_requests_v1: { version: 1, open: 0, requests: [] },
    titan_submit_cache_reconciliation: { reportId: null, differences: {} },
    titan_save_profile_state: profile, titan_assign_friend_code: profile.friend_code,
    titan_atelier: atelier,
    titan_adventure_snapshot: adventure,
    titan_adventure_rpg_snapshot_v1: { __by: "p_world", cases: { aube: rpg("aube", 45, 11, 31, 520), marees: rpg("marees", 45, 3, 9, 170), forge: rpgOff("forge"), aurores: rpgOff("aurores") } },
    titan_journey_snapshot_v1: journey,
    titan_periodic_quests_v1: periodic,
    titan_daily_activity_v1: { __rows: steps, __range: { field: "day", from: "p_from", to: "p_to" } },
    titan_buddy_v1: buddy, titan_season_v1: season, titan_common_quest_v1: commonQuest, titan_world_goal_v1: worldGoal, titan_intents_v1: intents, titan_ranking_v1: ranking,
    titan_social_overview: social, titan_get_my_guild: guild, titan_challenge_links_v1: duels,
    titan_club_trophy_sync_v1: 0, titan_club_my_v1: clubs, titan_club_discover_v1: clubsFound,
    // Social lot B: each club's common goal of the week (a total, never a name).
    titan_club_week_v1: { __by: "p_club", cases: {
      [clubs[0].id]: { club: clubs[0].id, weekStart: day(-3), goal: 900, minutes: 640, members: 18, active: 11, canSet: true },
      [clubs[1].id]: { club: clubs[1].id, weekStart: day(-3), goal: null, minutes: 210, members: 9, active: 4, canSet: false } } },
    titan_faction_v1: factions, titan_pantheon_v1: pantheon, titan_polls_v1: polls, titan_roadmap_v1: roadmap,
    titan_public_card_settings: { enabled: true, slug: "kq7rm2xvtb", show: { name: true, level: true, totals: true, sports: true, titles: true } },
    titan_expedition_titles: titles, titan_displayed_title: { key: "exp:automne-2026", label: "Passe-brume" },
    titan_showcase_v1: [{ key: "exp:automne-2026", label: "Passe-brume" }, { key: "chapter:aube:9", label: null }],
    titan_pioneer_v1: { granted: true, cohort: "Fondateurs 2026", grantedAt: iso(-170) },
    titan_sources_v1: sourcesRows, titan_garmin_status_v1: { linked: true, dailies_authorized: true },
    titan_coach_portal: coachPortal,
    titan_coach_messages_v1: { __by: "p_link", cases: { [linkAthlete.id]: messages }, default: { more: false, rows: [] } },
    titan_coach_checkins_v1: { __by: "p_link", cases: { [linkAthlete.id]: checkins }, default: { rows: [checkins.rows[1]] } },
    titan_coach_templates_v1: templates, titan_coach_messages_read_v1: ok,
    // TITAN+ analyses (Progrès): this account has no subscription, and that is what the server tells a free account.
    titan_practice_report: premium, titan_compare_periods: premium, titan_analysis_views: { ...premium, limit: 10, count: 0, views: [] },
  };
  const offlineTables = ["mobs", "bosses", "creatures", "talents", "achievements_config", "global_config", "fun_stats", "shop_items", "news_updates", "content_blocks", "announcements", "avatars", "dynamic_pages"];
  return { owner: OWNER, token, authUser, profile, flags, history, goals, rpc, offlineTables, generatedAt: now.toISOString() };
}
