/* Google OAuth for the Android app uses Supabase's PKCE flow.
   No Google secret or service-role key belongs on-device. The redirect must be allowlisted in Supabase Auth. */
import { Linking } from "react-native";
import { supabase } from "./supabase";

export const GOOGLE_OAUTH_REDIRECT = "titan://auth/callback";

export function isGoogleOAuthCallback(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "titan:" && parsed.hostname === "auth" && parsed.pathname === "/callback";
  } catch {
    return false;
  }
}

export async function beginGoogleOAuth(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: GOOGLE_OAUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw new Error("Connexion Google indisponible. Vérifie l’activation du fournisseur dans Supabase.");
  if (!data.url) throw new Error("Google n’a pas fourni de lien de connexion.");
  await Linking.openURL(data.url);
}

export async function completeGoogleOAuthCallback(url: string): Promise<boolean> {
  if (!isGoogleOAuthCallback(url)) return false;
  // Use only the authorization code, never trust an arbitrary session or token in a deep link.
  const parsed = new URL(url);
  if (parsed.searchParams.has("error") || parsed.searchParams.has("error_description")) {
    throw new Error("Connexion Google annulée ou refusée. Tu peux réessayer.");
  }
  const code = parsed.searchParams.get("code");
  if (!code) throw new Error("Le retour de Google est incomplet. Réessaie la connexion.");
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw new Error("La session Google n’a pas pu être confirmée. Réessaie.");
  return true;
}
