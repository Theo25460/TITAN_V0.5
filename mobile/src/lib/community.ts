/* Lot 8 « communauté » — small pure helpers and per-owner local options behind C3, C6 and C9. Nothing here grants anything. */
import type { EventsState, SocialOverview } from "../data/api";
import { ownerKey, readJSON, writeJSON } from "./storage";

/** C3: share each confirmed session with friends automatically (off by default, kept on this phone, per account). */
export const readAutoShare = (owner: string) => readJSON<boolean>(ownerKey("autoShare", owner), false);
export const writeAutoShare = (owner: string, on: boolean) => writeJSON(ownerKey("autoShare", owner), on);

/** C6: ready-made friendly challenges — one tap fills the form; never a stake. */
export const CHALLENGE_TEMPLATES = [
  { id: "days", title: "Qui bouge le plus de jours cette semaine ?", metric: "active_days", target: 5, days: 7 },
  { id: "300", title: "300 minutes en 7 jours", metric: "effort_minutes", target: 300, days: 7 },
  { id: "month", title: "12 séances ce mois-ci", metric: "sessions", target: 12, days: 30 },
  { id: "weekend", title: "Week-end actif : 2 jours sur 2", metric: "active_days", target: 2, days: 3 },
] as const;

/** C9: everything a confirmed session also counts for, beyond the player — guild, joined quests, season, world goal, challenges. */
export function contributions(social: SocialOverview | null | undefined, events: EventsState | null | undefined): string[] {
  const out: string[] = [];
  if (social?.guild) out.push(`ta guilde (${social.guild.minutes} / ${social.guild.target} min cette semaine)`);
  const exp = social?.expedition as { title?: string; status?: string; me?: { joined?: boolean } } | null | undefined;
  if (exp?.me?.joined && exp.status === "active" && exp.title) out.push(`l’expédition « ${exp.title} »`);
  if (events?.common?.joined && events.common.state === "open") out.push(`la quête commune « ${events.common.title} »`);
  if (events?.season?.current?.joined && events.season.current.state === "running") out.push(`la saison « ${events.season.current.name} »`);
  if (events?.goal?.joined && events.goal.state === "open") out.push(`l’objectif mondial « ${events.goal.title} »`);
  const ch = (social?.challenges ?? []).filter((c) => c.status === "active" && c.my_status === "joined").length;
  if (ch) out.push(`${ch} défi${ch > 1 ? "s" : ""} entre amis`);
  return out;
}
