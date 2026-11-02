import type { LinkingOptions } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import type { RootParams } from "./types";
import { isGoogleOAuthCallback } from "../lib/googleOAuth";

const urlOf = (r: Notifications.NotificationResponse | null) => {
  const url = r?.notification.request.content.data?.url;
  return typeof url === "string" && url.startsWith("titan://") ? url : null;
};

/** titan:// links (local reminders, shortcuts). Website links stay on the website. */
export const linking: LinkingOptions<RootParams> = {
  prefixes: ["titan://"],
  config: {
    screens: {
      Tabs: { screens: { QG: "qg", Progress: "progres", Record: "seance", Adventure: "aventure", Profile: "profil" } },
      Journal: "journal",
      Goals: "objectifs",
      Community: "communaute",
      Atelier: "atelier",
      Settings: "reglages",
    },
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url && !isGoogleOAuthCallback(url)) return url;
    return urlOf(Notifications.getLastNotificationResponse());
  },
  subscribe(listener) {
    const a = Linking.addEventListener("url", ({ url }) => {
      // Supabase handles the PKCE callback; React Navigation must not treat it as an unknown screen.
      if (!isGoogleOAuthCallback(url)) listener(url);
    });
    const b = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = urlOf(r);
      if (url) listener(url);
    });
    return () => {
      a.remove();
      b.remove();
    };
  },
};
