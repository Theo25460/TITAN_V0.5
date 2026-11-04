/* Data contracts shared with the website and the Supabase production schema (v300). */
export type Exercise = {
  name: string;
  variant?: string;
  kind?: "weighted" | "bodyweight" | "hold";
  setRows: { weight: number; reps?: number; rir?: number | null; seconds?: number }[];
  sets?: number;
  reps?: number;
  totalReps?: number;
  volume?: number;
  weight?: number;
  holdSeconds?: number;
  notes?: string;
};

export type SessionDetails = {
  client_event_id?: string;
  schemaVersion?: number;
  timezone?: string;
  val1?: number;
  val2?: number;
  duration?: number;
  elevation?: number;
  performedAt?: string;
  note?: string;
  tags?: string[];
  extras?: Record<string, unknown>;
  bio?: { rpe?: number };
  exercises?: Exercise[];
  unitOverride?: string;
  gpxStats?: { movingMinutes?: number; elapsedMinutes?: number; ascent?: number; descent?: number; points?: number };
  // Written by the server.
  serverReward?: unknown;
  historical?: boolean;
  effort?: { xp?: number; minutes?: number; effortMinutes?: number; estimated?: boolean };
  credits?: number;
  dailyCapped?: boolean;
  weeklyCapped?: boolean;
  [key: string]: unknown;
};

export type SyncStatus = "confirmed" | "pending" | "error" | "sending";

export type TrainingLog = {
  id: string;
  user_id?: string;
  client_event_id?: string;
  sport: string;
  category?: string;
  cat?: string;
  val: number;
  unit: string;
  xp: number;
  date: string;
  details: SessionDetails;
  archived_at?: string | null;
  revision?: number;
  created_at?: string;
  status?: string;
  is_suspicious?: boolean;
  syncStatus?: SyncStatus;
  syncReason?: string;
};

export type TrainingPayload = { sport: string; category: string; val: number; unit: string; date: string; details: SessionDetails };

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  metric: "sessions" | "days" | "minutes" | "distance";
  sport: string | null;
  target: number;
  start_date: string;
  end_date: string;
  archived_at: string | null;
  revision: number;
  created_at?: string;
  updated_at?: string;
};

export type Privacy = { publicProfile?: boolean; showStats?: boolean; socialPresence?: boolean; friendRankings?: boolean; [k: string]: unknown };

export type Profile = {
  id: string;
  username: string | null;
  level: number;
  xp: number;
  credits: number;
  avatar: string | null;
  friend_code: string | null;
  game_state: { user?: Record<string, unknown>; meta?: { profileVersion?: number } & Record<string, unknown> } & Record<string, unknown>;
  privacy: Privacy;
  is_elite: boolean;
  is_suspended: boolean;
  suspension_reason?: string | null;
  state_version: number;
  appearance: Record<string, unknown>;
  streak_count?: number;
  last_week_id?: string;
  last_seen_news_version?: string | null;
  created_at?: string;
  email?: string | null;
};

export type Campaign = {
  id: string;
  tier: string;
  chapter: number;
  route: string;
  started_at: string | null;
  completed_at: string | null;
  target: number;
  effort_target: number;
  evidence: { days?: number; effort?: number; source_ids?: string[] } | null;
};

export type AdventureSnapshot = {
  version: number;
  owner: string;
  generated_at: string;
  level: number;
  xp: number;
  credits: number;
  next_level_xp: number;
  plus: boolean;
  avatar: string;
  selected_world: string;
  revision: number;
  campaigns: Campaign[];
  rewards: { world: string; chapter: number; earned_at: string }[];
};
