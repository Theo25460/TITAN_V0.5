import { getStateFromPath, type LinkingOptions } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import type { RootParams } from "./types";
import { parseCallback } from "../lib/googleAuth";

const urlOf = (r: Notifications.NotificationResponse | null) => {
  const url = r?.notification.request.content.data?.url;
  return typeof url === "string" && url.startsWith("titan://") ? url : null;
};

/** titan:// links (local reminders, shortcuts) and verified invitation links https://titan-app.fr/social?ami=…|guilde=… (AUD-12).
    Only /social is claimed by the Android intent filter: every other website link stays on the website. */
export const linking: LinkingOptions<RootParams> = {
  prefixes: ["titan://", "https://titan-app.fr"],
  config: {
    screens: {
      Tabs: { screens: { QG: "qg", Progress: "progres", Record: "seance", Adventure: "aventure", Profile: "profil" } },
      Journal: "journal",
      Sentiers: "sentiers",
      Goals: "objectifs",
      Community: "communaute",
      Events: "evenements",
      Retro: "retro",
      Capsules: "capsules",
      Atelier: "atelier",
      Settings: "reglages",
      Garmin: "garmin",
    },
  },
  getStateFromPath(path, options) {
    const isSentiers = /^\/?aventure\/?(?:\?[^#]*)?#sentiers$/.test(path);
    if (isSentiers) return getStateFromPath("/sentiers", options);
    // The website's community page is the invitation landing: same query, native Community screen.
    const social = /^\/?social(?:\.html)?\/?(\?[^#]*)?(?:#.*)?$/.exec(path);
    if (social) return getStateFromPath(`/communaute${social[1] || ""}`, options);
    return getStateFromPath(path, options);
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
