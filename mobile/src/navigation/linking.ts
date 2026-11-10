import { getStateFromPath, type LinkingOptions } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import type { RootParams } from "./types";
import { parseCallback } from "../lib/googleAuth";

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
      Sentiers: "sentiers",
      Goals: "objectifs",
      Community: "communaute",
      Atelier: "atelier",
      Settings: "reglages",
      Garmin: "garmin",
    },
  },
  getStateFromPath(path, options) {
    const isSentiers = /^\/?aventure\/?(?:\?[^#]*)?#sentiers$/.test(path);
    return getStateFromPath(isSentiers ? "/sentiers" : path, options);
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    // The auth provider consumes the OAuth callback; it is not a navigable screen.
    if (url && !parseCallback(url)) return url;
    return urlOf(Notifications.getLastNotificationResponse());
  },
  subscribe(listener) {
    const a = Linking.addEventListener("url", ({ url }) => {
      if (!parseCallback(url)) listener(url);
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
