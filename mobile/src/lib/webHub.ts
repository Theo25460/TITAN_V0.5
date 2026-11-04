/* What lives on the website (the complete TITAN) and is not rebuilt in the Android app (the pocket companion). The phone keeps a door
   to each of them: nothing of TITAN is out of reach from the app, it just opens where it is at its best (a large screen). */
import { SITE_URL } from "./config";

export type WebFeature = { id: string; icon: "chart" | "group" | "layers" | "route" | "target"; title: string; text: string; path: string };

export const WEB_FEATURES: readonly WebFeature[] = [
  { id: "stats", icon: "chart", title: "Analyses et comparaisons", text: "Charge, fraîcheur, comparaisons entre périodes et rapports détaillés, sur grand écran.", path: "/stats" },
  { id: "coaching", icon: "group", title: "Espace coach", text: "Suivre plusieurs sportifs, comparer et préparer des séances.", path: "/coaching" },
  { id: "gpx", icon: "route", title: "Analyse d’un fichier GPX", text: "Importer une trace et lire terrain, pauses et dénivelé en détail.", path: "/training?mode=hub" },
  { id: "export", icon: "layers", title: "Exports et données complètes", text: "Tout ton journal en CSV ou JSON, depuis ton compte.", path: "/profile" },
  { id: "plan", icon: "target", title: "Prévoir en détail", text: "Planifier tes semaines avec la vue calendrier complète.", path: "/prevoir" },
];

export const webUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
