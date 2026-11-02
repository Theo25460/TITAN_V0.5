import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { secureSessionStorage } from "./secureStorage";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureSessionStorage,
    storageKey: "titan-auth",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { headers: { "x-titan-client": "android-native" } },
});

// Refresh tokens only while the app is in the foreground (recommended for mobile clients).
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
