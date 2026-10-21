/* Preview only: the real hooks module, with every server read answered from fixtures and every write a no-op. */
import * as actual from "../../src/data/hooks";
import { Progress } from "../../src/core";
import { adventure, archived, atelier, goals, logs, profile, social } from "../fixtures";
import { previewState } from "../state";

export * from "../../src/data/hooks";

const { empty, loading } = previewState;
const noop = () => {};
const q = <T,>(data: T) => ({ data: loading ? undefined : data, isLoading: loading, isRefetching: false, isError: false, error: null, refetch: noop, isSuccess: !loading });
const mutation = () => ({ mutate: noop, mutateAsync: async () => ({}), isPending: false, reset: noop });

const list = empty || loading ? [] : logs;
const emptyProfile = { ...profile, level: 1, xp: 0, credits: 0, game_state: { user: { onboardedAt: profile.game_state?.user?.onboardedAt, weeklyGoalSessions: 3, favoriteSports: [] }, meta: {} } };

export const useProfile = () => q(empty ? emptyProfile : profile);
export const usePrefs = () => actual.prefsOf(empty ? emptyProfile : profile);
export const useLogs = () => ({ ...q(list), logs: list, active: Progress.activeLogs(list), archived: empty ? [] : archived, pending: [], confirmed: list });
export const useGoals = () => q(empty ? [] : goals);
export const useAdventure = () =>
  q(empty ? { ...adventure, level: 1, xp: 0, credits: 0, campaigns: adventure.campaigns.map((c) => ({ ...c, chapter: 0 })), rewards: [] } : adventure);
export const useAtelier = () => q(atelier);
export const useSocial = () => q(empty ? { ...social, friends: [], requests_in: [], requests_out: [], moments: [], challenges: [], expedition: null, guild: null } : social);
export const useCardSettings = () => q({ enabled: true, slug: "camille-7k2", show: { name: true, level: true, totals: false, sports: true, titles: true } });
export const useSavePrefs = mutation;
export const useSaveGoal = mutation;
export const useRecordSession = mutation;
export const useUpdateSession = mutation;
export const useAdventureAction = mutation;
