/* React Query hooks: every key starts with [scope, owner] so cached data can never cross accounts. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useMemo } from "react";
import { Progress } from "../core";
import { buildSession, toPayload, type SessionDraft } from "../core/session";
import type { Goal, Profile, TrainingLog } from "../core/types";
import { isOnline } from "../lib/network";
import * as api from "./api";
import { useOwner } from "./auth";
import { saveLogsCache } from "./logsCache";
import { enqueue, flushQueue, provisionalLogs, useQueue } from "./queue";
import { rememberReceipt } from "./receipts";

export const keys = {
  profile: (o: string) => ["profile", o] as const,
  logs: (o: string) => ["logs", o] as const,
  goals: (o: string) => ["goals", o] as const,
  adventure: (o: string) => ["adventure", o] as const,
  atelier: (o: string) => ["atelier", o] as const,
  social: (o: string) => ["social", o] as const,
  guild: (o: string) => ["guild", o] as const,
  card: (o: string) => ["card", o] as const,
};

export function useProfile() {
  const owner = useOwner();
  return useQuery({ queryKey: keys.profile(owner), queryFn: () => api.fetchProfile(owner) });
}

export type Prefs = { weeklyGoalSessions: number; cadencePauses: string[]; favoriteSports: string[]; schedule: Record<string, { sport: string | null; minutes?: number | null; note?: string }>; onboardedAt: string | null; notifications: Record<string, unknown> };

export function prefsOf(profile: Profile | null | undefined): Prefs {
  const u = (profile?.game_state?.user ?? {}) as Record<string, unknown>;
  const pauses = Array.isArray(u.cadencePauses) ? (u.cadencePauses as string[]).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)) : [];
  const fav = Array.isArray(u.favoriteSports) ? (u.favoriteSports as string[]) : Array.isArray(u.preferredSports) ? (u.preferredSports as string[]) : [];
  return {
    weeklyGoalSessions: Math.min(7, Math.max(1, parseInt(String(u.weeklyGoalSessions ?? 3), 10) || 3)),
    cadencePauses: pauses,
    favoriteSports: fav.filter((s) => typeof s === "string").slice(0, 12),
    schedule: (u.schedule && typeof u.schedule === "object" ? u.schedule : {}) as Prefs["schedule"],
    onboardedAt: typeof u.onboardedAt === "string" ? u.onboardedAt : u.onboardingComplete === true ? "legacy" : null,
    notifications: (u.notifications && typeof u.notifications === "object" ? u.notifications : {}) as Record<string, unknown>,
  };
}

export function usePrefs() {
  const q = useProfile();
  return useMemo(() => prefsOf(q.data), [q.data]);
}

/** Preference change: merged server-side, with one automatic retry after a version conflict (another device). */
export function useSavePrefs() {
  const owner = useOwner();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ prefs, username, privacy }: { prefs: api.Preferences; username?: string; privacy?: Profile["privacy"] }) => {
      let profile = qc.getQueryData<Profile | null>(keys.profile(owner)) ?? (await api.fetchProfile(owner));
      if (!profile) throw new Error("PROFILE_UNAVAILABLE");
      try {
        return await api.savePreferences(profile, prefs, { username, privacy });
      } catch (e) {
        if (!String((e as Error)?.message).includes("PROFILE_VERSION_CONFLICT")) throw e;
        profile = await api.fetchProfile(owner);
        if (!profile) throw e;
        return api.savePreferences(profile, prefs, { username, privacy });
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.profile(owner) }),
  });
}

/** Confirmed sessions from the server + sessions still waiting on this device. */
export function useLogs() {
  const owner = useOwner();
  const queue = useQueue();
  const q = useQuery({
    queryKey: keys.logs(owner),
    queryFn: async () => {
      const logs = await api.fetchAllLogs(owner);
      saveLogsCache(owner, logs).catch(() => {});
      return logs;
    },
    staleTime: 30_000,
  });
  const value = useMemo(() => {
    const confirmed = q.data ?? [];
    const ids = new Set(confirmed.map((l) => l.client_event_id || l.details?.client_event_id || l.id));
    const pending = queue.owner === owner ? provisionalLogs(queue.items, ids) : [];
    const all = [...confirmed.filter((l) => !l.archived_at), ...pending].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const archived = confirmed.filter((l) => l.archived_at);
    return { logs: all, active: Progress.activeLogs(all), archived, pending, confirmed };
  }, [q.data, queue, owner]);
  return { ...q, ...value };
}

export function useGoals() {
  const owner = useOwner();
  return useQuery({ queryKey: keys.goals(owner), queryFn: () => api.fetchGoals(owner) });
}

export function useSaveGoal() {
  const owner = useOwner();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fields, old }: { fields: Partial<api.GoalFields>; old?: Goal | null }) => api.saveGoal(owner, fields, old),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.goals(owner) }),
  });
}

export function useAdventure() {
  const owner = useOwner();
  return useQuery({ queryKey: keys.adventure(owner), queryFn: api.fetchAdventure, select: (s) => (s && s.owner === owner ? s : null) });
}

export function useAtelier() {
  const owner = useOwner();
  return useQuery({ queryKey: keys.atelier(owner), queryFn: api.fetchAtelier });
}

export function useSocial() {
  const owner = useOwner();
  return useQuery({ queryKey: keys.social(owner), queryFn: api.fetchSocial, staleTime: 30_000 });
}

export function useCardSettings() {
  const owner = useOwner();
  return useQuery({ queryKey: keys.card(owner), queryFn: api.fetchCardSettings });
}

/** Invalidate what a confirmed session changes: journal, XP/credits, campaign evidence, social progress. */
export function invalidateAfterSession(qc: ReturnType<typeof useQueryClient>, owner: string) {
  for (const k of [keys.logs(owner), keys.profile(owner), keys.adventure(owner), keys.atelier(owner), keys.social(owner)]) qc.invalidateQueries({ queryKey: k });
}

/** Records a session: durable write on the device first, then sending. Resolves once the session is safe locally. */
export function useRecordSession() {
  const owner = useOwner();
  const qc = useQueryClient();
  const profile = useProfile().data;
  return useMutation({
    networkMode: "always",
    mutationFn: async (draft: SessionDraft) => {
      const build = buildSession(draft);
      if (build.errors.length) throw Object.assign(new Error(build.errors[0].message), { field: build.errors[0].field });
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
      const payload = toPayload(build, draft.sport, Crypto.randomUUID(), timezone, profile?.is_elite === true);
      await enqueue(owner, payload);
      return payload;
    },
    onSuccess: () => {
      if (isOnline()) syncNow(qc, owner);
    },
  });
}

export function syncNow(qc: ReturnType<typeof useQueryClient>, owner: string) {
  return flushQueue(owner, (eventId, receipt) => rememberReceipt(eventId, receipt)).then((r) => {
    if (r.sent > 0) invalidateAfterSession(qc, owner);
    return r;
  });
}

export function useUpdateSession() {
  const owner = useOwner();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ log, patch }: { log: TrainingLog; patch: api.SessionPatch }) => {
      if (log.syncStatus && log.syncStatus !== "confirmed") throw new Error("Cette séance attend encore la synchronisation. Tu pourras la corriger une fois envoyée.");
      if (log.user_id && log.user_id !== owner) throw new Error("Le compte a changé. Rouvre la séance depuis le journal.");
      return api.updateSession(log, patch);
    },
    onSuccess: (row) => {
      qc.setQueryData<TrainingLog[]>(keys.logs(owner), (prev) => (prev ? prev.map((l) => (l.id === row.id ? { ...l, ...row } : l)) : prev));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.logs(owner) });
      qc.invalidateQueries({ queryKey: keys.adventure(owner) });
    },
  });
}

/** Campaign actions (start, claim a chapter, choose a character): validated server-side with the snapshot revision. */
export function useAdventureAction() {
  const owner = useOwner();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, params }: { action: "start" | "claim" | "avatar" | "select"; params: { world?: string; route?: string; avatar?: string; chapter?: number } }) => {
      const snapshot = qc.getQueryData<import("../core/types").AdventureSnapshot>(keys.adventure(owner)) ?? (await api.fetchAdventure());
      if (!snapshot || snapshot.owner !== owner) throw new Error("ADVENTURE_UNAVAILABLE");
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
      return api.adventureAction(snapshot, action, params, timezone);
    },
    onSuccess: (next) => {
      if (next?.owner === owner) qc.setQueryData(keys.adventure(owner), next);
      qc.invalidateQueries({ queryKey: keys.profile(owner) });
      qc.invalidateQueries({ queryKey: keys.atelier(owner) });
    },
    onError: () => qc.invalidateQueries({ queryKey: keys.adventure(owner) }),
  });
}
