/* Preview only: the story cards of « Partager » in the cases the brief asks to check (GPS session with a record, manual session
   without distance, strength, climbing with a long name, pending session, record, milestone, nothing measured). #Story?case=gps
   draws one card at 540 × 960 dp (1080 × 1920 at density 2); #ShareStory?case=gps opens the real preview screen. */
import { View } from "react-native";
import { StoryCard } from "../src/components/StoryCard";
import { buildStory, type StoryOptions, type StoryRequest } from "../src/core/shareStory";
import { colors } from "../src/theme/tokens";

const date = "2026-11-26T07:40:00Z";

export const STORY_CASES: Record<string, { request: StoryRequest; options?: Partial<StoryOptions> }> = {
  gps: {
    request: {
      kind: "session",
      input: {
        sport: "Course à pied", sportId: "running", date, name: "Théo",
        metrics: [["Distance", "10,2 km"], ["Durée", "52:10"], ["Allure", "5:07 /km"], ["Dénivelé", "+120 m"], ["Ressenti", "7/10"]],
        record: { label: "10 km", value: "52:10", previous: "54:02" },
        xp: { confirmed: true, amount: 1240, level: 12, rankName: "Sentinelle" },
      },
    },
  },
  manual: { request: { kind: "session", input: { sport: "Yoga", sportId: "yoga", date, metrics: [["Durée", "45 min"]], xp: null } } },
  strength: {
    request: {
      kind: "session",
      input: { sport: "Musculation", sportId: "muscu_gym", date, metrics: [["Exercices", "5"], ["Séries", "18"], ["Volume", "6,4 t"], ["Durée", "1 h 05"]], xp: { confirmed: true, amount: 380, level: 9, rankName: "Explorateur" } },
    },
  },
  long: {
    request: {
      kind: "session",
      input: { sport: "Randonnée en raquettes à neige sur sentier balisé de moyenne montagne", sportId: "snowshoeing", date, name: "Marie-Charlotte de La Rochefoucauld-Montbel", metrics: [["Distance", "14,8 km"], ["Durée", "4 h 20"], ["Vitesse", "3,4 km/h"], ["Dénivelé", "+860 m"]], xp: { confirmed: true, amount: 2210, level: 21, rankName: "Gardien" } },
    },
    options: { name: true },
  },
  climbing: { request: { kind: "session", input: { sport: "Escalade en salle", sportId: "bouldering", date, metrics: [["Durée", "1 h 30"], ["Meilleure", "6b+"], ["Réussites", "5/8"]], xp: { confirmed: true, amount: 410, level: 8, rankName: "Explorateur" } } } },
  pending: { request: { kind: "session", input: { sport: "Vélo de route", sportId: "cycling", date, metrics: [["Distance", "42,5 km"], ["Durée", "1:31:40"], ["Vitesse", "27,8 km/h"]], xp: null } } },
  empty: { request: { kind: "session", input: { sport: "Pratique libre", date: null, metrics: [] } } },
  record: { request: { kind: "achievement", input: { type: "record", title: "Charge maximale · Squat", value: "120 kg", sport: "Musculation", sportId: "muscu_gym", previous: "115 kg", date } } },
  milestone: { request: { kind: "achievement", input: { type: "milestone", title: "Ma 100e séance", value: "100", progress: "100 séances enregistrées depuis le 3 mars 2025.", date } } },
};

export function StoryPreview({ name }: { name: string }) {
  const c = STORY_CASES[name] ?? STORY_CASES.gps;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StoryCard model={buildStory(c.request, c.options)} width={540} sportId={c.request.input.sportId ?? null} />
    </View>
  );
}
