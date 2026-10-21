/* Every server call of the Android app. Same tables, RPCs and rules as the website (production schema v300):
   rewards, credits, possession and progression are only ever written by SECURITY DEFINER functions on the server. */
import { supabase } from "../lib/supabase";
import type { AdventureSnapshot, Goal, Privacy, Profile, TrainingLog, TrainingPayload } from "../core/types";

const TIMEOUT_MS = 20000;

/** Rejects after the timeout so a stalled request never freezes a screen. */
export async function withTimeout<T>(promise: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Request timed out"), { name: "TimeoutError" })), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function rpc<T>(name: string, params?: Record<string, unknown>, ms?: number): Promise<T> {
  const { data, error } = await withTimeout(supabase.rpc(name, params ?? {}), ms);
  if (error) throw error;
  return data as T;
}

/** Ensures the request runs for the account that asked for it (no cross-account leak after a switch). */
export async function assertOwner(owner: string) {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== owner) throw Object.assign(new Error("AUTH_REQUIRED"), { code: "AUTH_REQUIRED" });
  return data.session;
}

/* ---------- Profile ---------- */
export async function fetchProfile(owner: string): Promise<Profile | null> {
  const { data, error } = await withTimeout(supabase.from("profiles").select("*").eq("id", owner).maybeSingle());
  if (error) throw error;
  if (data && data.id !== owner) throw new Error("PROFILE_MISMATCH");
  return (data as Profile) ?? null;
}

/** Creates the profile row for a brand-new account, exactly like the website's first sync. */
export async function createProfile(name: string): Promise<void> {
  await rpc("titan_save_profile_state", {
    p_state: { user: { name }, meta: {} },
    p_username: name || "Agent",
    p_avatar: null,
    p_inventory: {},
    p_privacy: { publicProfile: false, showStats: false, socialPresence: false, friendRankings: false },
    p_streak_count: 0,
    p_last_week_id: "",
    p_last_seen_news_version: null,
  });
}

/** Preferences live in game_state.user; the server merges only its whitelisted keys and checks the profile version. */
export type Preferences = {
  weeklyGoalSessions?: number;
  cadencePauses?: string[];
  schedule?: Record<string, { sport: string | null; minutes?: number | null; note?: string }>;
  favoriteSports?: string[];
  onboardedAt?: string;
  onboardingComplete?: boolean;
  notifications?: Record<string, unknown>;
  name?: string;
};

export async function savePreferences(profile: Profile, prefs: Preferences, opts: { username?: string; privacy?: Privacy } = {}) {
  return rpc<Record<string, unknown>>("titan_save_profile_state", {
    p_state: { user: prefs, meta: { profileVersion: profile.state_version } },
    p_username: opts.username ?? profile.username ?? "Agent",
    p_avatar: null,
    p_inventory: {},
    p_privacy: opts.privacy ?? profile.privacy ?? {},
    p_streak_count: null,
    p_last_week_id: profile.last_week_id ?? "",
    p_last_seen_news_version: null,
  });
}

/* ---------- Training log ---------- */
export async function fetchAllLogs(owner: string): Promise<TrainingLog[]> {
  const logs: TrainingLog[] = [];
  const pageSize = 500;
  let offset = 0;
  let total: number | null = null;
  for (;;) {
    const result = await withTimeout(
      supabase
        .from("training_logs")
        .select("*", { count: "exact" })
        .eq("user_id", owner)
        .order("date", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + pageSize - 1),
      30000,
    );
    if (result.error) throw result.error;
    const page = (result.data ?? []) as TrainingLog[];
    if (result.count !== null && result.count !== undefined) total = result.count;
    for (const row of page) if (row.user_id && row.user_id !== owner) throw new Error("LOG_OWNER_MISMATCH");
    logs.push(...page);
    offset += page.length;
    if (!page.length && total !== null && offset < total) throw new Error("Historique incomplet. Réessaie la synchronisation.");
    if (!page.length || (total !== null && offset >= total) || (total === null && page.length < pageSize)) break;
  }
  return logs.map((l) => ({ ...l, cat: l.category, client_event_id: l.client_event_id ?? l.details?.client_event_id, syncStatus: "confirmed" as const }));
}

export type SubmitReceipt = {
  log_id: string;
  xp: number;
  credits: number;
  credits_after: number;
  xp_after: number;
  level_after: number;
  level_bonus: number;
  leveled_up: number;
  requested_xp: number;
  requested_credits: number;
  weekly_xp_remaining: number;
  weekly_credits_remaining: number;
  server_version: string;
};

/** Idempotent: the server keeps a receipt per client_event_id and replays it for an identical retry. */
export async function submitSession(payload: TrainingPayload): Promise<SubmitReceipt> {
  const data = await rpc<SubmitReceipt[] | SubmitReceipt>("titan_submit_training_session", {
    p_sport: payload.sport,
    p_category: payload.category,
    p_val: payload.val,
    p_unit: payload.unit,
    p_details: payload.details,
    p_date: payload.date,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.log_id) throw new Error("SERVER_AUTHORITY_REQUIRED");
  return row;
}

export type SessionPatch = { val?: number; date?: string; note?: string; duration?: number | null; exercises?: unknown[]; extras?: Record<string, unknown>; archived?: boolean };

export async function updateSession(log: TrainingLog, patch: SessionPatch): Promise<TrainingLog> {
  const data = await rpc<TrainingLog>("titan_update_training_session", { p_id: log.id, p_revision: log.revision || 1, p_patch: patch });
  return { ...data, cat: data.category, syncStatus: "confirmed" };
}

/* ---------- Goals ---------- */
export async function fetchGoals(owner: string): Promise<Goal[]> {
  const { data, error } = await withTimeout(supabase.from("sport_goals").select("*").eq("user_id", owner).order("id").limit(500));
  if (error) throw error;
  return (data ?? []) as Goal[];
}

export type GoalFields = Pick<Goal, "title" | "metric" | "sport" | "target" | "start_date" | "end_date"> & { archived_at?: string | null };

export async function saveGoal(owner: string, fields: Partial<GoalFields>, old?: Goal | null): Promise<Goal> {
  const q = old
    ? supabase.from("sport_goals").update(fields).eq("id", old.id).eq("user_id", owner).eq("revision", old.revision)
    : supabase.from("sport_goals").insert({ ...fields, user_id: owner });
  const { data, error } = await withTimeout(q.select().single());
  if (error) {
    if (error.code === "PGRST116") throw Object.assign(new Error("Cet objectif a changé sur un autre appareil. Actualise puis réessaie."), { code: "CONFLICT" });
    if (String(error.message).includes("GOAL_LIMIT")) throw new Error("Tu as déjà 50 objectifs actifs.");
    throw error;
  }
  if (!data || data.user_id !== owner) throw new Error("La réponse de l’objectif n’a pas pu être vérifiée.");
  return data as Goal;
}

/* ---------- Adventure ---------- */
export const fetchAdventure = () => rpc<AdventureSnapshot>("titan_adventure_snapshot", {}, 15000);

export function adventureAction(snapshot: AdventureSnapshot, action: "start" | "claim" | "avatar" | "select", params: { world?: string; route?: string; avatar?: string; chapter?: number }, timezone: string) {
  return rpc<AdventureSnapshot>("titan_adventure_action", {
    p_action: action,
    p_world: params.world ?? null,
    p_route: params.route ?? "rhythm",
    p_avatar: params.avatar ?? null,
    p_revision: snapshot.revision,
    p_chapter: params.chapter ?? null,
    p_timezone: timezone,
  });
}

/* ---------- Atelier (cosmetics only, bought with credits earned by training) ---------- */
export type AtelierItem = { id: string; cosmetic: string; slot: "frame" | "map" | "card"; unlock: string; name: string; description: string | null; price: number; min_level: number; owned: boolean };
export type Atelier = { credits: number; level: number; week_credits: number; week_credit_cap: number; plus: { active: boolean }; appearance: Record<string, string>; items: AtelierItem[] };
export const fetchAtelier = () => rpc<Atelier>("titan_atelier");
export async function purchaseItem(itemId: string) {
  const data = await rpc<{ item_id: string; cost: number; credits_after: number }[]>("titan_purchase_shop_item", { p_item_id: itemId });
  return Array.isArray(data) ? data[0] : data;
}
export const setAppearance = (slot: string, item: string | null) => rpc<Record<string, string>>("titan_set_appearance", { p_slot: slot, p_item: item });

/* ---------- Community ---------- */
export type Friend = { id: string; name: string; avatar: string; level: number | null; week_days: number | null; last_active: string | null };
export type Moment = { id: string; kind: string; title: string; detail: string | null; sport: string | null; created_at: string; mine: boolean; visibility: string; author: { id: string; name: string; avatar: string }; cheers: number; cheered: boolean };
export type Challenge = { id: string; title: string; metric: "effort_minutes" | "active_days" | "distance_km" | "sessions"; sport: string | null; target: number; starts_at: string; ends_at: string; mine: boolean; my_status: "joined" | "invited"; status: "active" | "ended"; members: { id: string; name: string; status: string; progress: number | null }[] };
export type GuildWeek = { guild_id: string; week_start: string; target: number; minutes: number; members: { id: string; name: string; role: string; minutes: number; days: number }[] } | null;
export type SocialOverview = {
  me: { id: string; friend_code: string; findable: boolean };
  friends: Friend[];
  requests_in: { id: string; name: string; avatar: string; at: string }[];
  requests_out: { id: string; name: string; at: string }[];
  moments: Moment[];
  challenges: Challenge[];
  expedition: unknown;
  guild: GuildWeek;
};
export const fetchSocial = () => rpc<SocialOverview>("titan_social_overview");
export const friendRequest = (code: string) => rpc<{ status: string }>("titan_social_request", { p_code: code });
export const friendRespond = (user: string, accept: boolean) => rpc<{ status: string }>("titan_social_respond", { p_user: user, p_accept: accept });
export const friendRemove = (user: string) => rpc("titan_social_remove", { p_user: user });
export const blockUser = (user: string) => rpc("titan_block_user", { p_blocked_id: user, p_reason: "android" });
export const momentCheer = (id: string) => rpc("titan_moment_cheer", { p_id: id });
export const momentDelete = (id: string) => rpc("titan_moment_delete", { p_id: id });
export const momentShare = (p: { kind: string; title: string; detail?: string | null; sport?: string | null; logId?: string | null; visibility?: "friends" | "private" }) =>
  rpc("titan_moment_share", { p_kind: p.kind, p_title: p.title, p_detail: p.detail ?? null, p_sport: p.sport ?? null, p_log_id: p.logId ?? null, p_visibility: p.visibility ?? "friends" });
export const challengeCreate = (p: { title: string; metric: Challenge["metric"]; sport: string | null; target: number; days: number; invitees: string[] }) =>
  rpc<{ id: string; invited: number }>("titan_challenge_create", { p_title: p.title, p_metric: p.metric, p_sport: p.sport, p_target: p.target, p_days: p.days, p_invitees: p.invitees });
export const challengeRespond = (id: string, action: "join" | "decline" | "leave") => rpc("titan_challenge_respond", { p_id: id, p_action: action });
export const expeditionJoin = (id: string) => rpc("titan_expedition_join", { p_id: id });
export const fetchGuild = () => rpc<Record<string, unknown> | null>("titan_get_my_guild");
export const guildCreate = (name: string, motto: string) => rpc("titan_create_guild", { p_name: name, p_motto: motto });
export const guildJoin = (code: string) => rpc("titan_join_guild", { p_code: code });
export const guildLeave = () => rpc("titan_leave_guild");
export const guildSend = (content: string) => rpc("titan_send_guild_message", { p_content: content });

/* ---------- Public card ---------- */
export type CardSettings = { enabled: boolean; slug: string | null; show: Record<string, boolean> } & Record<string, unknown>;
export const fetchCardSettings = () => rpc<CardSettings>("titan_public_card_settings");
export const saveCard = (enabled: boolean, show: Record<string, boolean>, newLink = false) => rpc<CardSettings>("titan_public_card_save", { p_enabled: enabled, p_show: show, p_new_link: newLink });

/* ---------- Account ---------- */
export const exportOwnData = () => rpc<Record<string, unknown>>("export_own_data", {}, 30000);
export const deleteOwnAccount = () => rpc("delete_own_account", {}, 30000);
