import { Linking } from "react-native";
import { beginGoogleOAuth, completeGoogleOAuthCallback, GOOGLE_OAUTH_REDIRECT, isGoogleOAuthCallback } from "../src/lib/googleOAuth";
import { supabase } from "../src/lib/supabase";

jest.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
    },
  },
}));

describe("Google OAuth Android — PKCE callback", () => {
  const auth = supabase.auth;
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts only TITAN's expected OAuth callback", () => {
    expect(GOOGLE_OAUTH_REDIRECT).toBe("titan://auth/callback");
    expect(isGoogleOAuthCallback("titan://auth/callback?code=abc")).toBe(true);
    expect(isGoogleOAuthCallback("titan://profil?code=abc")).toBe(false);
    expect(isGoogleOAuthCallback("https://evil.example/callback?code=abc")).toBe(false);
    expect(isGoogleOAuthCallback("titan://auth/callback/other?code=abc")).toBe(false);
    expect(isGoogleOAuthCallback("broken://")).toBe(false);
  });

  it("exchanges only an OAuth authorization code", async () => {
    (auth.exchangeCodeForSession as jest.Mock).mockResolvedValue({ error: null });
    await expect(completeGoogleOAuthCallback("titan://auth/callback?code=real-code")).resolves.toBe(true);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("real-code");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it("refuses foreign and incomplete redirects without exchanging anything", async () => {
    await expect(completeGoogleOAuthCallback("https://example.com/?code=x")).resolves.toBe(false);
    await expect(completeGoogleOAuthCallback("titan://auth/callback?error=access_denied")).rejects.toThrow();
    await expect(completeGoogleOAuthCallback("titan://auth/callback")).rejects.toThrow();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("uses the Google provider and the allowed redirect with no secret in the app", async () => {
    (auth.signInWithOAuth as jest.Mock).mockResolvedValue({ data: { url: "https://oubmftfufwwzwpgvrcag.supabase.co/auth/v1/authorize?provider=google" }, error: null });
    const launch = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    try {
      await beginGoogleOAuth();
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: GOOGLE_OAUTH_REDIRECT, skipBrowserRedirect: true },
      });
      expect(launch).toHaveBeenCalledTimes(1);
    } finally {
      launch.mockRestore();
    }
  });
});
