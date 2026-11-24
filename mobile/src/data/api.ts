/* Every server call of the Android app. Same tables, RPCs and rules as the website (production schema v300):
   rewards, credits, possession and progression are only ever written by SECURITY DEFINER functions on the server. */
import { supabase } from "../lib/supabase";
import type { AdventureSnapshot, Goal, Privacy, Profile, TrainingLog, TrainingPayload } from "../core/types";

import { listProfileCopies, preferenceBase, preferenceSignature, protectPreferences, removeProfileCopy } from "./profileCopies";
import { isOnline } from "../lib/network";
import { toAppError } from "../lib/errors";

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

/** Public feature flags, readable before any sign-in (titan_feature_flags_v1 answers visitors too). Unknown = off. */
export async function fetchPublicFlags(): Promise<Record<string, boolean>> {
  try {
    const r = await rpc<{ flags?: Record<string, boolean> }>("titan_feature_flags_v1", {}, 6000);
    return r?.flags ?? {};
  } catch {
    return {};
  }
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
export async function createProfile(owner: string, name: string): Promise<void> {
  await ownerRpc(owner, "titan_save_profile_state", {
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

// Reserve synchronously: a second intent must not be mistaken for an unchanged profile.
const preferenceFlights = new Map<string, Promise<Profile>>();
export function savePreferences(profile: Profile, prefs: Preferences, opts: { username?: string; privacy?: Privacy } = {}): Promise<Profile> {
  const edit = JSON.parse(JSON.stringify({ prefs, ...opts }));
  const previous = preferenceFlights.get(profile.id);
  const sending = Promise.resolve().then(async () => {
    const session = await assertOwner(profile.id);
    const uncertain = !!previous || (await listProfileCopies(profile.id)).length > 0;
    const base = preferenceBase(profile, edit);
    if (!uncertain && preferenceSignature(base) === preferenceSignature(edit)) return profile;
    const copy = await protectPreferences(profile.id, edit, uncertain ? null : base);
    if (previous) throw new Error("PROFILE_SAVE_IN_PROGRESS");
    if (!Number.isInteger(profile.state_version)) throw new Error("PROFILE_READ_REQUIRED");
    if (!isOnline()) throw new Error("Network offline; preferences preserved");
    await assertOwner(profile.id);
    const { data, error } = await withTimeout(supabase.rpc("titan_save_profile_state", {
      p_state: { user: edit.prefs, meta: { profileVersion: profile.state_version } },
      p_username: edit.username ?? profile.username ?? "Agent",
      p_avatar: null, p_inventory: {},
      p_privacy: edit.privacy ?? profile.privacy ?? {},
      p_streak_count: null, p_last_week_id: profile.last_week_id ?? "", p_last_seen_news_version: null,
    }).setHeader("Authorization", `Bearer ${session.access_token}`));
    if (error) throw error;
    if (!data || data.id !== profile.id || !Number.isInteger(data.state_version)) throw new Error("PROFILE_RECEIPT_INVALID");
    await assertOwner(profile.id);
    await removeProfileCopy(profile.id, copy.key);
    return { ...profile, ...data } as Profile;
  }).finally(() => { if (preferenceFlights.get(profile.id) === sending) preferenceFlights.delete(profile.id); });
  if (!previous) preferenceFlights.set(profile.id, sending);
  return sending;
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
  /* Since migration 20261020000000_reward_holds (not yet in production): a high-risk session's reward waits 24 h at most. */
  reward_held?: boolean;
  held_xp?: number;
  held_credits?: number;
  release_at?: string;
};

/** Idempotent: the server keeps a receipt per client_event_id and replays it for an identical retry. */
export async function submitSession(owner: string, payload: TrainingPayload): Promise<SubmitReceipt> {
  const data = await ownerRpc<SubmitReceipt[] | SubmitReceipt>(owner, "titan_submit_training_session", {
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
export const fetchAdventure = (owner: string) => ownerRpc<AdventureSnapshot>(owner, "titan_adventure_snapshot", {}, undefined, 15000);

export function adventureAction(snapshot: AdventureSnapshot, action: "start" | "claim" | "avatar" | "select", params: { world?: string; route?: string; avatar?: string; chapter?: number }, timezone: string) {
  return ownerRpc<AdventureSnapshot>(snapshot.owner, "titan_adventure_action", {
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
export const fetchAtelier = (owner: string) => ownerRpc<Atelier>(owner, "titan_atelier", {});
export async function purchaseItem(owner: string, itemId: string) {
  const data = await ownerRpc<{ item_id: string; cost: number; credits_after: number }[]>(owner, "titan_purchase_shop_item", { p_item_id: itemId });
  return Array.isArray(data) ? data[0] : data;
}
export const setAppearance = (owner: string, slot: string, item: string | null) => ownerRpc<Record<string, string>>(owner, "titan_set_appearance", { p_slot: slot, p_item: item });

/* ---------- Community ---------- */
export type Friend = { id: string; name: string; avatar: string; level: number | null; week_days: number | null; last_active: string | null };
export type Moment = { id: string; kind: string; title: string; detail: string | null; sport: string | null; created_at: string; mine: boolean; visibility: string; author: { id: string; name: string; avatar: string }; cheers: number; cheered: boolean };
export type Challenge = { id: string; title: string; metric: "effort_minutes" | "active_days" | "distance_km" | "sessions"; sport: string | null; target: number; starts_at: string; ends_at: string; mine: boolean; my_status: "joined" | "invited"; status: "active" | "ended"; members: { id: string | null; name: string; status: string; progress: number | null }[] };
export type GuildWeek = { guild_id: string; week_start: string; target: number; minutes: number; members: { id: string; name: string; role: string; minutes: number; days: number }[] } | null;
export type SocialOverview = {
  me: { id: string; friend_code: string; findable: boolean };
  friends: Friend[];
  requests_in: { id: string; name: string; avatar: string; at: string }[];
  requests_out: { id: string; name: string; at: string; expires_at?: string }[];
  moments: Moment[];
  challenges: Challenge[];
  expedition: unknown;
  guild: GuildWeek;
};
export const fetchSocial = (owner: string) => ownerRpc<SocialOverview>(owner, "titan_social_overview", {});
export const friendRequest = (code: string) => rpc<{ status: string }>("titan_social_request", { p_code: code });
export const friendRespond = (user: string, accept: boolean) => rpc<{ status: string }>("titan_social_respond", { p_user: user, p_accept: accept });
export const friendRemove = (user: string) => rpc("titan_social_remove", { p_user: user });
export const blockUser = (user: string) => rpc("titan_block_user", { p_blocked_id: user, p_reason: "android" });
/* Social lot A: personal invitation links (one use, 7 days, revocable) and one's own blocks. */
export type FriendLinkPreview = { valid: boolean; expiresAt?: string; own?: boolean; friends?: boolean; inviter?: { name: string; avatar: string } };
export const friendLinkCreate = (owner: string) => ownerRpc<{ id: string; token: string; expiresAt: string }>(owner, "titan_friend_link_create_v1", {});
export const friendLinkPreview = (owner: string, token: string) => ownerRpc<FriendLinkPreview>(owner, "titan_friend_link_preview_v1", { p_token: token });
export const friendLinkAccept = (owner: string, token: string) => ownerRpc<{ status: "friends"; id: string; name: string; spent: boolean }>(owner, "titan_friend_link_accept_v1", { p_token: token });
export type BlockedAccount = { id: string; name: string; at: string };
export const fetchBlocks = (owner: string) => ownerRpc<BlockedAccount[]>(owner, "titan_blocks_v1", {});
export const unblockUser = (owner: string, user: string) => ownerRpc<boolean>(owner, "titan_unblock_user", { p_blocked_id: user });
export const momentCheer = (id: string) => rpc("titan_moment_cheer", { p_id: id });
export const momentDelete = (id: string) => rpc("titan_moment_delete", { p_id: id });
export const momentShare = (p: { kind: string; title: string; detail?: string | null; sport?: string | null; logId?: string | null; visibility?: "friends" | "private" }) =>
  rpc("titan_moment_share", { p_kind: p.kind, p_title: p.title, p_detail: p.detail ?? null, p_sport: p.sport ?? null, p_log_id: p.logId ?? null, p_visibility: p.visibility ?? "friends" });
export const challengeCreate = (p: { title: string; metric: Challenge["metric"]; sport: string | null; target: number; days: number; invitees: string[] }) =>
  rpc<{ id: string; invited: number }>("titan_challenge_create", { p_title: p.title, p_metric: p.metric, p_sport: p.sport, p_target: p.target, p_days: p.days, p_invitees: p.invitees });
/** AUD-22: a challenge open to anyone holding its one-use link (no friend needed), and a fresh link for an existing own challenge. */
export const challengeOpenCreate = (p: { title: string; metric: Challenge["metric"]; sport: string | null; target: number; days: number }) =>
  rpc<{ id: string; token: string; expiresAt: string }>("titan_challenge_open_create_v1", { p_title: p.title, p_metric: p.metric, p_sport: p.sport, p_target: p.target, p_days: p.days });
export const challengeLinkCreate = (id: string) => rpc<{ id: string; token: string; expiresAt: string }>("titan_challenge_link_create_v1", { p_challenge: id });
export const challengeRespond = (id: string, action: "join" | "decline" | "leave") => rpc("titan_challenge_respond", { p_id: id, p_action: action });
/* Social lot C: La Grande Cordée (a cooperative mode of the friends' challenge). The server counts longueurs, summit and title. */
export type CordeeList = { cordees: import("../core/cordee").CordeeState[]; titles: string[] };
export const fetchCordees = (owner: string) => ownerRpc<CordeeList>(owner, "titan_cordees_v1", {});
export const cordeeCreate = (owner: string, p: { route: string; pace: string; days: number; invitees: string[] }) =>
  ownerRpc<{ id: string; invited: number }>(owner, "titan_cordee_create_v1", { p_route: p.route, p_pace: p.pace, p_days: p.days, p_invitees: p.invitees });
/** Social lot D: what happened in one's circle since a moment (the server clamps it to 1 hour .. 30 days). */
/** V1.9.1 — the athlete's side of the coach follow-up (titan_coach_followup_v1, behind screens.coach_followup). */
export const coachFollowup = <T = unknown>(owner: string, action: string, data: Record<string, unknown> = {}) =>
  ownerRpc<T>(owner, "titan_coach_followup_v1", { p_action: action, p_data: data });
/** V1.9.2 — Retour sur la séance: the athlete's feedback (all, or one session's), answer, « compris ». Behind screens.coach_feedback. */
export const coachFeedback = <T = unknown>(owner: string, action: string, data: Record<string, unknown> = {}) =>
  ownerRpc<T>(owner, "titan_coach_feedback_v1", { p_action: action, p_data: data });
/** Answer a proposal through the existing portal (accepted / declined), as the website does. */
export const coachAnswer = (owner: string, id: string, revision: number, status: "accepted" | "declined") =>
  ownerRpc<unknown>(owner, "titan_coach_portal", { p_action: "assignment_status", p_data: { id, revision, status } });
export const fetchSocialDigest = (owner: string, since: string | null) => ownerRpc<import("../core/cordee").SocialDigest>(owner, "titan_social_digest_v1", { p_since: since });
export const wearTitle = (owner: string, key: string | null) => ownerRpc<{ key: string | null; label: string | null }>(owner, "titan_set_displayed_title", { p_key: key });
export const expeditionJoin = (id: string) => rpc("titan_expedition_join", { p_id: id });
type DuoFriend = { id: string; name: string };
type DuoPair = { id: string; role: "inviter" | "invitee"; partner: DuoFriend };
/** Social lot B: the frozen outcome of the last Duo that reached its end (14 days), the partner named only while still a friend. */
export type DuoLast = { id: string; endsOn: string; target: number; reached: boolean; myDays: number; together: number; partner: DuoFriend | null } | null;
export type DuoState = { status: "none"; friends: DuoFriend[]; last?: DuoLast }
  | (DuoPair & { status: "pending" })
  | (DuoPair & { status: "active"; daysLeft: number; target: number; myDays: number; partnerDays: number; together: number; nudgedToday: boolean; nudgesReceived: number });

export async function fetchDuo(owner: string): Promise<DuoState | null> {
  try {
    const flags = await ownerRpc<{ flags?: Record<string, boolean> }>(owner, "titan_feature_flags_v1", {});
    if (flags?.flags?.["screens.buddy"] !== true) return null;
    const state = await ownerRpc<DuoState>(owner, "titan_buddy_v1", {});
    if (state?.status === "none" || state?.status === "pending" || state?.status === "active") return state;
    throw new Error("DUO_UNAVAILABLE");
  } catch (error) {
    if (toAppError(error).code === "UNAVAILABLE") return null;
    throw error;
  }
}

export const duoInvite = (owner: string, friend: string) => ownerRpc(owner, "titan_buddy_invite_v1", { p_friend: friend });
export const duoRespond = (owner: string, id: string, accept: boolean) => ownerRpc(owner, "titan_buddy_respond_v1", { p_id: id, p_accept: accept });
export const duoNudge = (owner: string, id: string) => ownerRpc(owner, "titan_buddy_nudge_v1", { p_id: id });
export const duoEnd = (owner: string, id: string) => ownerRpc<boolean>(owner, "titan_buddy_end_v1", { p_id: id });

export const fetchGuild = () => rpc<Record<string, unknown> | null>("titan_get_my_guild");
/** AUD-44: the guild's chronicle — last weeks against the target, weeks held together, best streak (members only). */
export type GuildHistory = { target: number; weeks: { week: string; minutes: number; held: boolean }[]; held: number; bestStreak: number } | null;
export const fetchGuildHistory = (owner: string) => ownerRpc<GuildHistory>(owner, "titan_guild_history_v1", { p_weeks: 12 });
/** The guild's join code and name, read from the member-only RPC the website already uses (AUD-05): the weekly payload has no code. */
export type GuildIdentity = { id: string; code: string; name: string };
export async function fetchGuildIdentity(owner: string): Promise<GuildIdentity | null> {
  const g = await ownerRpc<Record<string, unknown> | null>(owner, "titan_get_my_guild", {});
  if (!g || typeof g.id !== "string") return null;
  return { id: g.id, code: typeof g.code === "string" ? g.code : "", name: typeof g.name === "string" ? g.name : "" };
}
export const guildCreate = (name: string, motto: string) => rpc("titan_create_guild", { p_name: name, p_motto: motto });
export const guildJoin = (code: string) => rpc("titan_join_guild", { p_code: code });
export const guildLeave = () => rpc("titan_leave_guild");
export const guildSend = (content: string) => rpc("titan_send_guild_message", { p_content: content });

/* ---------- Events (AUD-23): the server layer the website already shows ---------- */
export type PeriodicQuests = { version: number; week: unknown; month: unknown; souvenirs: { weeks: number; months: number } };
export type CommonQuest = { id: string; title: string; detail: string | null; weekStart: string; endsAt: string; target: number; minutes: number; members: number; joined: boolean; mine: number; state: "open" | "done" | "closed" } | null;
export type SeasonState = { current: { id: string; name: string; rules: string | null; startsOn: string; endsOn: string; state: "upcoming" | "running"; participants: number; joined: boolean; myMinutes: number; myDays: number } | null; archive: unknown[] };
export type WorldGoal = { id: string; title: string; detail: string | null; startsOn: string; endsOn: string; levels: number[]; minutes: number; members: number; joined: boolean; mine: number; level: number; state: "open" | "upcoming" | "closed" } | null;
export type CadenceWeek = { week: string; days: number; target: number; held: boolean; claimed: boolean; reward: number };
export type CadenceStatus = { current: CadenceWeek; previous: CadenceWeek } | null;
export type ExpeditionTitle = { id: string; title: string; expedition: string; ended_at: string };
export type EventsState = { quests: PeriodicQuests | null; common: CommonQuest; season: SeasonState | null; goal: WorldGoal; cadence: CadenceStatus; titles: ExpeditionTitle[] };

/** Each piece is optional: an RPC missing on an older server only hides its card. */
export async function fetchEvents(owner: string): Promise<EventsState> {
  const safe = <T,>(p: Promise<T>) => p.catch((e) => (toAppError(e).code === "UNAVAILABLE" ? null : Promise.reject(e)));
  const [quests, common, season, goal, cadence, titles] = await Promise.all([
    safe(ownerRpc<PeriodicQuests>(owner, "titan_periodic_quests_v1", {})),
    safe(ownerRpc<CommonQuest>(owner, "titan_common_quest_v1", {})),
    safe(ownerRpc<SeasonState>(owner, "titan_season_v1", {})),
    safe(ownerRpc<WorldGoal>(owner, "titan_world_goal_v1", {})),
    safe(ownerRpc<CadenceStatus>(owner, "titan_cadence_week_status_v1", {})),
    safe(ownerRpc<ExpeditionTitle[]>(owner, "titan_expedition_titles", {})),
  ]);
  return { quests: quests ?? null, common: common ?? null, season: season ?? null, goal: goal ?? null, cadence: cadence ?? null, titles: Array.isArray(titles) ? titles : [] };
}
/** AUD-25: +50 cosmetic credits for a held week (current or previous), once. */
export const cadenceClaim = (owner: string, week: string) => ownerRpc<{ week: string; credits: number; balance: number }>(owner, "titan_cadence_week_claim_v1", { p_week: week });
export const questClaim = (owner: string, scope: "week" | "month") => ownerRpc(owner, "titan_periodic_quest_claim_v1", { p_scope: scope });
export const commonQuestJoin = (owner: string, id: string, join: boolean) => ownerRpc(owner, "titan_common_quest_join_v1", { p_quest: id, p_join: join });
export const seasonJoin = (owner: string, id: string, join: boolean) => ownerRpc(owner, "titan_season_join_v1", { p_season: id, p_join: join });
export const worldGoalJoin = (owner: string, id: string, join: boolean) => ownerRpc(owner, "titan_world_goal_join_v1", { p_goal: id, p_join: join });

/* ---------- History import (AUD-43) ---------- */
export type HistoryImportResult = { imported: number; linked: number; duplicate: number; skipped: number; done: number; remaining: number; limited: boolean };
export const importHistory = (owner: string, items: { id: string; sport: string; startedAt: string; minutes: number; km: number | null }[]) =>
  ownerRpc<HistoryImportResult>(owner, "titan_import_history_v1", { p_items: items }, undefined, 60000);

/* ---------- Community lot 8 (C4 ranking, C5 intents, C7 clubs) ---------- */
export type Ranking = { optedIn: boolean; entries?: { rank: number; name: string; score: number; activeDays: number; progressPct: number | null; me: boolean }[]; me?: { score: number; activeDays: number; progressPct: number | null } | null };
export const fetchRanking = (owner: string) => ownerRpc<Ranking>(owner, "titan_ranking_v1", { p_sport: null });
export const rankingSet = (owner: string, on: boolean) => ownerRpc<boolean>(owner, "titan_ranking_set_v1", { p_on: on });
export type Intents = { mine: { intent: string; visibility: string; done: boolean; cheers: number } | null; friends: { userId: string; name: string; intent: string; done: boolean; cheered: boolean }[] };
export const fetchIntents = (owner: string, day: string) => ownerRpc<Intents>(owner, "titan_intents_v1", { p_day: day });
export const intentSet = (owner: string, day: string, text: string, friends: boolean) => ownerRpc(owner, "titan_intent_set_v1", { p_day: day, p_text: text, p_visibility: friends ? "friends" : "private" });
export const intentDone = (owner: string, day: string, done: boolean) => ownerRpc(owner, "titan_intent_done_v1", { p_day: day, p_done: done });
export const intentCheer = (owner: string, friend: string, day: string, on: boolean) => ownerRpc(owner, "titan_intent_cheer_v1", { p_owner: friend, p_day: day, p_on: on });
export type Club = { id: string; name: string; description: string | null; role: string; members: number; code: string | null; trophies?: { id: string; title: string; note: string | null; on: string }[]; announcements?: { id: string; body: string; at: string }[] };
export const fetchClubs = (owner: string) => ownerRpc<Club[] | null>(owner, "titan_club_my_v1", {});
export const clubJoin = (owner: string, code: string) => ownerRpc<string>(owner, "titan_club_join_v1", { p_code: code, p_club: null });
/** Social lot B: the common goal of the week, read by every member as a total (never a name). */
/** minutes and active are null below 3 members: the server never gives a total that would be another member's week. */
export type ClubWeek = { club: string; weekStart: string; goal: number | null; minutes: number | null; members: number; active: number | null; canSet: boolean };
export const fetchClubWeek = (owner: string, club: string) => ownerRpc<ClubWeek>(owner, "titan_club_week_v1", { p_club: club });

/* ---------- Life chapters (AUD-48) ---------- */
export type LifeChapter = { id: string; title: string; startsOn: string; endsOn: string | null; open: boolean; days: number; minutes: number; sessions: number };
export const fetchChapters = (owner: string) => ownerRpc<LifeChapter[]>(owner, "titan_chapters_v1", {});
export const chapterStart = (owner: string, title: string) => ownerRpc<string>(owner, "titan_chapter_start_v1", { p_title: title, p_starts_on: null });
export const chapterClose = (owner: string, id: string) => ownerRpc<boolean>(owner, "titan_chapter_close_v1", { p_id: id, p_ends_on: null });

/* ---------- Time capsules (AUD-40) ---------- */
export type Practice = { minutes: number; days: number };
export type Capsules = {
  delivered: { id: string; message: string; months: number; writtenOn: string; deliverOn: string; opened: boolean; then: Practice; now: Practice }[];
  waiting: { id: string; months: number; deliverOn: string }[];
};
export const fetchCapsules = (owner: string) => ownerRpc<Capsules>(owner, "titan_capsules_v1", {});
export const capsuleCreate = (owner: string, message: string, months: 3 | 6 | 12) => ownerRpc<{ id: string; deliverOn: string }>(owner, "titan_capsule_create_v1", { p_message: message, p_months: months });
export const capsuleOpen = (owner: string, id: string) => ownerRpc<boolean>(owner, "titan_capsule_open_v1", { p_id: id });

/* ---------- Public card ---------- */
export type CardSettings = { enabled: boolean; slug: string | null; show: Record<string, boolean> } & Record<string, unknown>;
export const fetchCardSettings = (owner: string) => ownerRpc<CardSettings>(owner, "titan_public_card_settings", {});
export const saveCard = (owner: string, enabled: boolean, show: Record<string, boolean>, newLink = false) => ownerRpc<CardSettings>(owner, "titan_public_card_save", { p_enabled: enabled, p_show: show, p_new_link: newLink });

/* ---------- Account ---------- */
export const exportOwnData = (owner: string) => ownerRpc<Record<string, unknown>>(owner, "export_own_data", {}, undefined, 30000);
export const deleteOwnAccount = (owner: string) => ownerRpc(owner, "delete_own_account", {}, undefined, 30000);

/* ---------- Connected sources (Health Connect) ---------- */
export type SourceStatus = { source: string; granted: boolean };
export const sourceConsent = (owner: string, source: "health_connect", consent: boolean, current?: () => boolean) =>
  ownerRpc<{ granted: boolean }>(owner, "titan_set_source_consent_v1", { p_source: source, p_granted: consent }, current);
export const dailyActivity = (owner: string, from: string, to: string) =>
  ownerRpc<{ day: string; steps: number; sources?: string[]; updatedAt?: string }[]>(owner, "titan_daily_activity_v1", { p_from: from, p_to: to });
export const sourcesStatus = (owner: string) => ownerRpc<SourceStatus[]>(owner, "titan_sources_v1", {});
export type ImportResult = { status: "imported" | "linked" | "duplicate"; log_id?: string };
export const importActivity = (owner: string, p: { externalId: string; sport: string; startedAt: string; minutes: number }, current?: () => boolean) =>
  ownerRpc<ImportResult>(owner, "titan_import_activity_v1", { p_source: "health_connect", p_external_id: p.externalId, p_sport: p.sport, p_started_at: p.startedAt, p_duration_minutes: p.minutes, p_distance_km: null }, current);
export async function importDailySteps(owner: string, day: string, steps: number, current?: () => boolean) {
  const result = await ownerRpc<{ day: string; steps: number }>(owner, "titan_import_daily_activity_v1", { p_source: "health_connect", p_day: day, p_steps: steps }, current);
  if (result?.day !== day || result.steps !== steps) throw new Error("STEPS_IMPORT_UNCONFIRMED");
  return result;
}
export const archiveImported = (owner: string, source: "health_connect" | "garmin", current?: () => boolean) =>
  ownerRpc<number>(owner, "titan_archive_imported_v1", { p_source: source }, current);

/* ---------- Route library (private GPS traces) ---------- */
export type RouteMeta = { id: string; eventId?: string | null; sport: string; startedAt: string; distanceM: number; durationS: number; ascentM: number | null; points: number };
export type RouteFull = RouteMeta & { track: import("../lib/gpsTrack").EncodedTrack };
/** Private data must use the token of the checked owner, including if Auth changes before fetch starts. */
export async function ownerRpc<T>(owner: string, name: string, params: Record<string, unknown>, current?: () => boolean, timeout?: number): Promise<T> {
  const session = await assertOwner(owner);
  if (current && !current()) throw Object.assign(new Error("AUTH_REQUIRED"), { code: "AUTH_REQUIRED" });
  const { data, error } = await withTimeout(supabase.rpc(name, params).setHeader("Authorization", `Bearer ${session.access_token}`), timeout);
  if (error) throw error;
  return data as T;
}
export const routeSave = (owner: string, p: { clientRouteId: string; sport: string; startedAt: string; distanceM: number; durationS: number; ascentM: number | null; track: unknown }) =>
  ownerRpc<{ id: string; created: boolean }>(owner, "titan_route_save_v1", { p_client_route_id: p.clientRouteId, p_sport: p.sport, p_started_at: p.startedAt, p_distance_m: p.distanceM, p_duration_s: p.durationS, p_ascent_m: p.ascentM, p_track: p.track });
export const routeLink = (owner: string, clientRouteId: string, eventId: string) => ownerRpc<boolean>(owner, "titan_route_link_v1", { p_client_route_id: clientRouteId, p_event_id: eventId });
export const routeForEvent = (owner: string, eventId: string) => ownerRpc<RouteMeta | null>(owner, "titan_route_for_event_v1", { p_event_id: eventId });
export const routesList = (owner: string) => ownerRpc<RouteMeta[]>(owner, "titan_routes_v1", { p_limit: 100 });
export const routeGet = (owner: string, id: string) => ownerRpc<RouteFull>(owner, "titan_route_get_v1", { p_id: id });
export const routeDelete = (owner: string, id: string) => ownerRpc<boolean>(owner, "titan_route_delete_v1", { p_id: id });

/** Where the account's TITAN+ comes from, as the server sees it: its own source (a store subscription, an offered access) or only a seat
    included by a coach. A seat must never stop the athlete from buying their own offer (Coach included): it ends with the coach's plan. */
export type MyPlan = { titanPlus: boolean; own: boolean; viaCoach: boolean };
export async function fetchMyPlan(owner: string): Promise<MyPlan> {
  const data = await ownerRpc<Partial<MyPlan> | null>(owner, "titan_my_plan_v1", {});
  if (!data || typeof data.own !== "boolean" || typeof data.viaCoach !== "boolean") throw new Error("PLAN_UNREADABLE");
  return { titanPlus: data.titanPlus === true, own: data.own, viaCoach: data.viaCoach };
}
