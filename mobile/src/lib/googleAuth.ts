/* Google sign-in (REC/Android): the PKCE flow in the system browser, with no new native module and no Google SDK in the application.
   TITAN opens the Supabase authorisation address in the phone's browser; Google asks the player, then the browser comes back to
   titan://auth-callback?code=… ; the code is exchanged for a session on a dedicated PKCE client, whose session is then given to the normal client.
   Nothing is shown unless the build says the provider is ready (EXPO_PUBLIC_TITAN_GOOGLE=1): the provider and the redirect address must first be
   switched on in the Supabase dashboard and the Google console, which is an external step. TITAN receives the name and the e-mail address only. */
import { createClient, type Session } from "@supabase/supabase-js";
import { Linking } from "react-native";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { secureSessionStorage } from "./secureStorage";

export const REDIRECT = "titan://auth-callback";
export const googleEnabled = () => process.env.EXPO_PUBLIC_TITAN_GOOGLE === "1";

type KeyValueStore = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> };

/** PKCE storage: ONLY the code verifier is written to the Keystore, so a phone that reclaims the app while the player is in the browser
 *  can still finish the sign-in when titan://auth-callback reopens it. Everything else (the session the exchange returns) stays in memory
 *  and is wiped right after the hand-over to the main client: no second copy of the tokens is ever persisted. */
export function createPkceStorage(secure: KeyValueStore) {
  const memory = new Map<string, string>();
  const persisted = (k: string) => /code-verifier$/.test(k);
  return {
    async getItem(k: string) { return persisted(k) ? secure.getItem(k) : memory.get(k) ?? null; },
    async setItem(k: string, v: string) { if (persisted(k)) await secure.setItem(k, v); else memory.set(k, v); },
    async removeItem(k: string) { if (persisted(k)) await secure.removeItem(k); else memory.delete(k); },
    wipeMemory() { memory.clear(); },
  };
}
const pkceStorage = createPkceStorage(secureSessionStorage);

let pkceClient: ReturnType<typeof createClient> | null = null;
const pkce = () =>
  (pkceClient ||= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // persistSession must be true: with false, supabase-js swaps the storage for an in-memory one and the verifier would not survive an app restart.
    auth: { flowType: "pkce", storage: pkceStorage, storageKey: "titan-google", autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
    global: { headers: { "x-titan-client": "android-native" } },
  }));

/** The authorisation code of a callback address, or null when the address is anything else (a failed attempt carries an error instead). */
export function parseCallback(url: string | null | undefined): { code: string } | { error: string } | null {
  // Match the exact callback, not another route with the same prefix (e.g. auth-callback-evil).
  if (!url || !(url === REDIRECT || url.startsWith(`${REDIRECT}?`) || url.startsWith(`${REDIRECT}#`))) return null;
  const query = url.slice(url.indexOf("?") + 1).split("#")[0] ?? "";
  const params = new URLSearchParams(url.includes("?") ? query : "");
  const fragment = new URLSearchParams(url.includes("#") ? url.slice(url.indexOf("#") + 1) : "");
  const error = params.get("error_description") || params.get("error") || fragment.get("error_description") || fragment.get("error");
  if (error) return { error: error.slice(0, 200) };
  const code = params.get("code");
  return code && /^[A-Za-z0-9._~-]{8,256}$/.test(code) ? { code } : { error: "Réponse de connexion incomplète." };
}

export async function startGoogle(): Promise<void> {
  const { data, error } = await pkce().auth.signInWithOAuth({ provider: "google", options: { redirectTo: REDIRECT, skipBrowserRedirect: true } });
  if (error || !data?.url) throw new Error(error?.message || "Google n’est pas disponible pour le moment.");
  await Linking.openURL(data.url);
}

export async function exchange(code: string): Promise<Pick<Session, "access_token" | "refresh_token">> {
  const { data, error } = await pkce().auth.exchangeCodeForSession(code);
  if (error || !data?.session) {
    pkceStorage.wipeMemory();
    throw new Error(error?.message || "La connexion avec Google n’a pas abouti.");
  }
  const tokens = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  pkceStorage.wipeMemory();
  return tokens;
}
