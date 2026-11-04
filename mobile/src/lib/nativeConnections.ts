import { assertOwner, ownerRpc } from "../data/api";
import { SITE_URL } from "./config";

type Network = typeof fetch;
type Current = () => boolean;
const valid = (current: Current) => { if (!current()) throw new Error("AUTH_REQUIRED"); };
/** Four things that are never confused: authorised (the person said yes), connected (the Garmin account is linked), received (an activity arrived), integrated (it is in the journal). */
export type GarminState = { enabled: boolean; linked: boolean; linked_at?: string; last_event_at?: string; authorized: boolean; imported: number; attached: number; last_import_at?: string };
type SourceRow = { source?: string; granted?: boolean; imported?: number; linked?: number; last_import_at?: string };
export async function readGarmin(owner: string): Promise<GarminState> {
  const [flags, status, sources] = await Promise.all([
    ownerRpc<{ flags?: Record<string, boolean> }>(owner, "titan_feature_flags_v1", {}),
    ownerRpc<{ linked: boolean; linked_at?: string; last_event_at?: string }>(owner, "titan_garmin_status_v1", {}),
    // The consent and the counters are a second reading: when it fails the screen still tells the truth about the link itself.
    ownerRpc<SourceRow[]>(owner, "titan_sources_v1", {}).catch(() => null),
  ]);
  if (typeof status?.linked !== "boolean") throw new Error("GARMIN_UNAVAILABLE");
  const row = Array.isArray(sources) ? sources.find((x) => x?.source === "garmin") : undefined;
  return { ...status, enabled: flags?.flags?.["screens.garmin"] === true, authorized: row?.granted === true, imported: Number(row?.imported) || 0, attached: Number(row?.linked) || 0, last_import_at: row?.last_import_at ?? undefined };
}
async function provider(owner: string, action: "start" | "disconnect", network: Network, current: Current) {
  const session = await assertOwner(owner); valid(current);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15000);
  try {
    const response = await network(`${SITE_URL}/.netlify/functions/garmin?action=${action}`, { method: "POST", headers: { Authorization: `Bearer ${session!.access_token}` }, signal: abort.signal });
    if (!response.ok) throw new Error("GARMIN_UNAVAILABLE");
    return await response.json();
  } finally { clearTimeout(timer); }
}
/** Opening Garmin is an explicit athlete action; server credentials and PKCE remain on the server. */
export async function connectGarmin(owner: string, consent: boolean, open: (url: string) => Promise<unknown>, network: Network = fetch, current: Current = () => true) {
  if (!consent) throw new Error("CONSENT_REQUIRED");
  const state = await readGarmin(owner); valid(current);
  if (!state.enabled) throw new Error("GARMIN_UNAVAILABLE");
  await ownerRpc(owner, "titan_set_source_consent_v1", { p_source: "garmin", p_granted: true }); valid(current);
  const result = await provider(owner, "start", network, current);
  const url = new URL(String(result?.url ?? ""));
  if (url.protocol !== "https:" || url.username || url.password || !(url.hostname === "garmin.com" || url.hostname.endsWith(".garmin.com"))) throw new Error("GARMIN_REDIRECT_INVALID");
  await assertOwner(owner); valid(current);
  await open(url.toString());
}
/** A provider outage never prevents withdrawal in TITAN. A database failure remains visible to the athlete. */
export async function disconnectGarmin(owner: string, network: Network = fetch, current: Current = () => true) {
  try { await provider(owner, "disconnect", network, current); } catch { /* local withdrawal remains required */ }
  valid(current);
  await ownerRpc(owner, "titan_set_source_consent_v1", { p_source: "garmin", p_granted: false });
  valid(current);
  await ownerRpc(owner, "titan_garmin_unlink_v1", {});
}

export type GuildMessage = { id: string; guild_id: string; sender_id: string; sender_name: string; content: string; created_at: string };
export async function loadGuildChat(owner: string) {
  const [messages, limits] = await Promise.all([
    ownerRpc<GuildMessage[]>(owner, "titan_list_guild_messages", {}),
    ownerRpc<{ messageMaxLength: number; chatGuildCost: number }>(owner, "titan_economy_limits", { p_user_id: owner }),
  ]);
  if (!Array.isArray(messages) || !Number.isInteger(limits?.messageMaxLength) || limits.messageMaxLength < 1 || limits.messageMaxLength > 2000 || !Number.isInteger(limits.chatGuildCost) || limits.chatGuildCost < 0) throw new Error("CHAT_UNAVAILABLE");
  return { messages, maxLength: limits.messageMaxLength, cost: limits.chatGuildCost };
}
export async function postGuildMessage(owner: string, text: string, maxLength: number) {
  const content = text.trim();
  if (!content || !Number.isInteger(maxLength) || maxLength < 1 || [...content].length > maxLength) throw new Error("MESSAGE_INVALID");
  const receipt = await ownerRpc<GuildMessage>(owner, "titan_send_guild_message", { p_content: content });
  if (!receipt?.id) throw new Error("CHAT_UNCONFIRMED");
  return receipt;
}
