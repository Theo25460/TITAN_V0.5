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
async function provider(owner: string, action: "start" | "disconnect" | "complete", network: Network, current: Current, handoff?: string, signal?: AbortSignal) {
  const session = await assertOwner(owner); valid(current);
  if (signal?.aborted) throw new Error("AUTH_REQUIRED");
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  try {
    const response = await network(`${SITE_URL}/.netlify/functions/garmin?action=${action}${action === "start" ? "&client=android&flow=handoff" : ""}`, {
      method: "POST", headers: { Authorization: `Bearer ${session!.access_token}`, ...(handoff ? { "Content-Type": "application/json" } : {}) },
      ...(handoff ? { body: JSON.stringify({ handoff }) } : {}), signal: abort.signal,
    });
    if (response.status === 401) throw new Error("AUTH_REQUIRED");
    const body = await response.json().catch(() => null);
    valid(current);
    if (action === "complete" && body?.garmin === "error" && (response.status === 400 || response.status === 403)) return body;
    if (!response.ok) {
      throw new Error(body?.error === "GARMIN_CONFIGURATION" ? "GARMIN_CONFIGURATION" : body?.error === "consent_required" ? "CONSENT_REQUIRED" : "GARMIN_UNAVAILABLE");
    }
    return body;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
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

/** Only public diagnostic codes are shown. Provider bodies and tokens never enter the UI. */
export function garminFailureMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "AUTH_REQUIRED") return "Ta session a expiré ou changé. Reconnecte-toi à TITAN avant de relancer Garmin.";
  if (code === "CONSENT_REQUIRED") return "Autorise d’abord l’import de tes activités Garmin dans TITAN.";
  if (code === "GARMIN_CONFIGURATION") return "La configuration Garmin de TITAN est indisponible. Contacte l’assistance avec le code GARMIN_CONFIGURATION.";
  if (code === "GARMIN_REDIRECT_INVALID") return "L’adresse reçue pour Garmin n’a pas pu être vérifiée. Contacte l’assistance avec le code GARMIN_REDIRECT_INVALID.";
  return "La demande n’a pas été confirmée. Actualise l’état avant de réessayer. Si la liaison reste impossible, contacte l’assistance avec le code GARMIN_UNAVAILABLE.";
}
const garminStages = new Map([
  ["state", "Ce retour Garmin a expiré ou n’a pas pu être vérifié. Relance la connexion et termine-la dans les dix minutes."],
  ["code", "Le code d’autorisation Garmin est absent ou invalide. Relance la connexion depuis TITAN."],
  ["token", "L’échange d’autorisation avec Garmin a échoué. Réessaie une fois, puis contacte l’assistance avec le code GARMIN_TOKEN."],
  ["identity", "L’identité du compte Garmin n’a pas été confirmée. Relance la connexion. Si cela persiste, contacte l’assistance avec le code GARMIN_IDENTITY."],
  ["permissions", "Les permissions Garmin n’ont pas pu être vérifiées. Relance la connexion et autorise les activités. Code GARMIN_PERMISSIONS."],
  ["link", "La liaison n’a pas pu être enregistrée dans TITAN. Actualise l’état avant de réessayer. Code GARMIN_LINK."],
  ["storage", "L’enregistrement sécurisé de l’autorisation a échoué. Actualise l’état avant de relancer la connexion. Code GARMIN_STORAGE."],
]);
export const GARMIN_CHECKING = "Retour Garmin reçu. Vérification de l’état du compte en cours.";
const GARMIN_HANDOFF = /^[A-Za-z0-9_-]{32,4096}$/;

function garminNotice(status: string, reason?: string | null): string {
  if (status === "ok") return GARMIN_CHECKING;
  if (status === "refused") return "L’autorisation Garmin a été refusée ou interrompue. Tu peux relancer la connexion quand tu le souhaites.";
  if (status === "permission") return "Garmin n’a pas accordé l’accès aux activités. Relance la connexion et autorise leur import.";
  if (status === "conflict") return "Ce compte Garmin est déjà associé à un autre compte TITAN. Contacte l’assistance pour vérifier la liaison.";
  if (status === "consent") return "L’import n’est pas autorisé dans TITAN. Autorise-le ici puis relance la connexion Garmin.";
  return garminStages.get(reason ?? "") ?? garminFailureMessage(null);
}

export function parseGarminReturn(value: string | null): { notice: string; handoff: string | null } | null {
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "titan:" || url.hostname !== "garmin" || url.pathname || url.username || url.password || url.port) return null;
  const status = url.searchParams.get("garmin");
  if (!status) return null;
  if (status === "complete") {
    const handoff = url.hash.startsWith("#handoff=") ? url.hash.slice("#handoff=".length) : "";
    return GARMIN_HANDOFF.test(handoff) ? { notice: GARMIN_CHECKING, handoff } : null;
  }
  if (url.hash) return null;
  return { notice: garminNotice(status, url.searchParams.get("garmin_reason")), handoff: null };
}

export function garminReturnMessage(value: string | null): string | null {
  return parseGarminReturn(value)?.notice ?? null;
}

export async function completeGarmin(owner: string, handoff: string, network: Network = fetch, current: Current = () => true, signal?: AbortSignal) {
  if (!GARMIN_HANDOFF.test(handoff)) throw new Error("GARMIN_UNAVAILABLE");
  const result = await provider(owner, "complete", network, current, handoff, signal);
  return garminNotice(typeof result?.garmin === "string" ? result.garmin : "", typeof result?.garmin_reason === "string" ? result.garmin_reason : null);
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
