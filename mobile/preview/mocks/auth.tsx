/* Preview only: a signed-in account, or signed out when the URL asks for an auth screen. */
import type { ReactNode } from "react";
import { previewState } from "../state";

const noop = async () => {};
export function useAuth() {
  const signedOut = previewState.signedOut;
  return {
    owner: signedOut ? null : "owner-a",
    email: "athlete@titan-app.fr",
    status: signedOut ? "signedOut" : "signedIn",
    notice: null,
    clearNotice() {},
    signIn: noop,
    signUp: async () => ({ needsConfirmation: true }),
    signOut: noop,
    resetPassword: noop,
    resendConfirmation: noop,
    updatePassword: noop,
  } as const;
}
export function useOwner(): string {
  return "owner-a";
}
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
