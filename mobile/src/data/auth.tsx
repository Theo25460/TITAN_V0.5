/* Authentication with the same Supabase accounts as titan-app.fr. The session (access + refresh token) is kept in the
   Android Keystore; switching or losing the account clears every cached view of the previous one. */
import type { Session } from "@supabase/supabase-js";
import { Linking } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SITE_URL } from "../lib/config";
import { toAppError } from "../lib/errors";
import { createReturnWatch, exchange, GOOGLE_NO_RETURN, googleEnabled, parseCallback, startGoogle, watchAppState } from "../lib/googleAuth";
import { forgetAccountCache } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { createProfile, fetchProfile } from "./api";
import { readLogsCache } from "./logsCache";
import { loadQueue } from "./queue";
import { queryClient } from "./queryClient";

type Status = "loading" | "signedOut" | "signedIn";

type AuthValue = {
  status: Status;
  session: Session | null;
  owner: string | null;
  email: string | null;
  notice: string | null;
  clearNotice(): void;
  signIn(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  resendConfirmation(email: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(opts?: { forget?: boolean }): Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
/** The signed-in account id. Screens under the main navigator always have one. */
export function useOwner(): string {
  const { owner } = useAuth();
  if (!owner) throw new Error("No signed-in account");
  return owner;
}

/** Prepares the device for an account: its own queue, its cached journal, nothing from another account. */
async function enterAccount(owner: string | null, previous: string | null) {
  if (previous && previous !== owner) {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[1] === previous });
  }
  await loadQueue(owner);
  if (owner) {
    const cached = await readLogsCache(owner);
    if (cached && !queryClient.getQueryData(["logs", owner])) queryClient.setQueryData(["logs", owner], cached.logs, { updatedAt: cached.savedAt });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const ownerRef = useRef<string | null>(null);
  const applyEpoch = useRef(0);
  const explicitSignOut = useRef(false);

  const apply = useCallback(async (next: Session | null) => {
    const epoch = ++applyEpoch.current;
    const owner = next?.user.id ?? null;
    const current = () => epoch === applyEpoch.current && ownerRef.current === owner;
    const previous = ownerRef.current;
    if (owner !== previous) {
      ownerRef.current = owner;
      try {
        await enterAccount(owner, previous);
      } catch {
        if (!current()) return;
        // Keep Auth valid, but the unread queue remains unready and refuses new writes instead of overwriting it.
        setNotice("Ton stockage local est indisponible. Tes séances en attente ne seront pas écrasées. Redémarre TITAN pour réessayer avant d’enregistrer une nouvelle séance.");
        setSession(next);
        setStatus(next ? "signedIn" : "signedOut");
        return;
      }
      if (!current()) return;
      if (owner) {
        // First connection of a brand-new account: create its profile row through the server function.
        try {
          const profile = await fetchProfile(owner);
          if (!current()) return;
          if (!profile) {
            const meta = next?.user.user_metadata ?? {};
            await createProfile(String(meta.username || meta.full_name || "Agent").slice(0, 24));
          } else if (profile.is_suspended) {
            setNotice(profile.suspension_reason || "Ce compte est suspendu. Contacte l’assistance TITAN.");
            explicitSignOut.current = true;
            await supabase.auth.signOut();
            return;
          } else queryClient.setQueryData(["profile", owner], profile);
        } catch {
          // Offline start: the cached profile is used; the next sync confirms it.
        }
      }
    }
    if (!current()) return;
    setSession(next);
    setStatus(next ? "signedIn" : "signedOut");
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) return apply(data.session);
      })
      .catch(() => {
        if (alive) return apply(null);
      });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "SIGNED_OUT" && ownerRef.current && !explicitSignOut.current) setNotice("Ta session a expiré. Reconnecte-toi pour retrouver tes données.");
      if (event === "SIGNED_OUT") explicitSignOut.current = false;
      // Never call Supabase inside this callback (documented deadlock): defer the work.
      setTimeout(() => {
        if (alive) apply(next);
      }, 0);
    });
    return () => {
      alive = false;
      applyEpoch.current++;
      data.subscription.unsubscribe();
    };
  }, [apply]);

  // One Google attempt at a time is watched: back in the app without the callback = told, never silent (V12-03).
  const googleWatch = useRef<ReturnType<typeof createReturnWatch> | null>(null);
  if (!googleWatch.current) googleWatch.current = createReturnWatch({ onMissing: () => setNotice(GOOGLE_NO_RETURN) });
  useEffect(() => (googleEnabled() ? watchAppState(googleWatch.current!) : undefined), []);

  // The browser comes back with titan://auth-callback?code=…: the code becomes a session (a failure is told, never silent).
  useEffect(() => {
    if (!googleEnabled()) return;
    let alive = true;
    const handled = new Set<string>();
    const handle = async (url: string | null) => {
      const cb = parseCallback(url);
      if (!cb || !url || handled.has(url)) return;
      googleWatch.current?.received();
      // getInitialURL and the event listener can receive the same redirect.
      handled.add(url);
      try {
        if ("error" in cb) throw new Error(cb.error);
        const tokens = await exchange(cb.code);
        const { error } = await supabase.auth.setSession(tokens);
        if (error) throw error;
      } catch (e) {
        if (alive) setNotice(`La connexion avec Google n’a pas abouti : ${toAppError(e).message}`);
      }
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => { handle(url); });
    return () => { alive = false; sub.remove(); };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      session,
      owner: session?.user.id ?? null,
      email: session?.user.email ?? null,
      notice,
      clearNotice: () => setNotice(null),
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw new Error(toAppError(error).message);
      },
      async signInWithGoogle() {
        try { await startGoogle(); googleWatch.current?.start(); } catch (e) { throw new Error(toAppError(e).message); }
      },
      async signUp(name, email, password) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { emailRedirectTo: `${SITE_URL}/onboarding`, data: { full_name: name.trim(), username: name.trim() } },
        });
        if (error) throw new Error(toAppError(error).message);
        return { needsConfirmation: !data.session };
      },
      async resendConfirmation(email) {
        const { error } = await supabase.auth.resend({ type: "signup", email: email.trim().toLowerCase(), options: { emailRedirectTo: `${SITE_URL}/onboarding` } });
        if (error) throw new Error(toAppError(error).message);
      },
      async resetPassword(email) {
        // The link opens the website page that sets the new password; the same password then works in the app.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${SITE_URL}/update-password` });
        if (error) throw new Error(toAppError(error).message);
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(toAppError(error).message);
      },
      async signOut({ forget = false } = {}) {
        const owner = ownerRef.current;
        explicitSignOut.current = true;
        await supabase.auth.signOut({ scope: "local" });
        queryClient.clear();
        // Unsent sessions stay on the device for this account unless the account itself is deleted.
        if (owner) await forgetAccountCache(owner, { keepQueue: !forget });
      },
    }),
    [status, session, notice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
