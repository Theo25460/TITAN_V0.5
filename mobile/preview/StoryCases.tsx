/* Preview only: the story cards of « Partager » in the cases the brief asks to check (GPS session with a record and a route, trail,
   manual session, team sport with its own measures, strength, long texts, climbing, nothing measured, record, milestone).
   #Story?case=gps&style=feuille draws one card at 540 × 960 dp (1080 × 1920 at density 2); #ShareStory?case=gps opens the real
   preview screen. The route is a synthetic city loop in metres, not a real place. */
import { View } from "react-native";
import { StoryCard } from "../src/components/StoryCard";
import { buildStory, ShareStory, type StoryOptions, type StoryRequest, type StoryStyle } from "../src/core/shareStory";
import { colors } from "../src/theme/tokens";

const date = "2026-11-26T07:40:00Z";
const route = { segs: [[[0,0],[169,26],[347,53],[528,64],[688,108],[869,118],[1062,149],[1095,359],[1115,561],[1140,788],[1162,995],[1191,1189],[1218,1412],[1423,1385],[1647,1381],[1853,1376],[2063,1362],[2266,1344],[2477,1332],[2501,1477],[2498,1635],[2533,1796],[2540,1947],[2552,2104],[2563,2264],[2632,2337],[2702,2409],[2771,2479],[2840,2546],[2909,2608],[2979,2664],[3048,2715],[3117,2758],[3186,2794],[3256,2821],[3325,2840],[3394,2850],[3463,2851],[3532,2843],[3601,2827],[3671,2802],[3740,2769],[3809,2728],[3879,2682],[3948,2630],[4017,2572],[4086,2511],[4156,2448],[4225,2382],[4294,2317],[4363,2252],[4432,2188],[4502,2128],[4571,2072],[4640,2021],[4709,1976],[4779,1938],[4848,1907],[4917,1884],[4986,1870],[5056,1864],[5125,1867],[5194,1879],[5263,1900],[5305,1635],[5348,1361],[5392,1087],[5427,792],[5472,536],[5513,252],[5293,195],[5071,154],[4833,92],[4622,64],[4378,9],[4161,-56],[4096,-240],[4050,-447],[3983,-637],[3926,-821],[3870,-995],[3801,-1184],[3496,-1184],[3203,-1176],[2894,-1156],[2603,-1153],[2290,-1126],[1996,-1113],[1896,-1091],[1775,-1063],[1670,-1036],[1558,-1010],[1457,-988],[1335,-958],[1304,-1013],[1296,-1058],[1261,-1120],[1233,-1156],[1198,-1205],[1188,-1269]]] };
const week = { rows: [{ label: "Course à pied", family: "endurance", cells: [0, 2, 0, 3, 0, 0, 0] }, { label: "Musculation", family: "force", cells: [2, 0, 0, 0, 1, 0, 0] }, { label: "Yoga", family: "mobilite", cells: [0, 0, 1, 0, 0, 0, 0] }], mark: 3, markRow: 0 };

export const STORY_CASES: Record<string, { request: StoryRequest; options?: Partial<StoryOptions> }> = {
  gps: { request: { kind: "session", input: { sport: "Course à pied", sportId: "running", date, name: "Théo", metrics: [["Distance", "10,2 km"], ["Durée", "52:10"], ["Allure", "5:07 /km"], ["Dénivelé", "+120 m"], ["Ressenti", "7/10"]], record: { label: "10 km", value: "52:10", previous: "54:02" }, route, week } } },
  trail: { request: { kind: "session", input: { sport: "Trail", sportId: "trail_running", date, metrics: [["Distance", "23,4 km"], ["Durée", "3:12:40"], ["Allure", "8:14 /km"], ["Dénivelé", "+1 240 m"]], route, week: { ...week, markRow: 0 } } } },
  manual: { request: { kind: "session", input: { sport: "Yoga", sportId: "yoga", date, metrics: [["Durée", "45 min"]], extras: { fields: [{ id: "style", type: "select", label: "Style", options: [{ value: "vinyasa", label: "Vinyasa" }] }, { id: "poses", type: "number", label: "Postures travaillées" }], values: { style: "vinyasa", poses: 24 } }, week: { ...week, markRow: 2, mark: 2 } } } },
  football: { request: { kind: "session", input: { sport: "Football", sportId: "football", date, metrics: [["Durée", "1 h 30"]], extras: { fields: [{ id: "position", type: "select", label: "Poste", options: ["Milieu"] }, { id: "goals", type: "number", label: "Buts marqués" }, { id: "assists", type: "number", label: "Passes décisives" }, { id: "score_for", type: "number", label: "Score de ton équipe" }, { id: "score_against", type: "number", label: "Score adverse" }], values: { position: "Milieu", goals: 2, assists: 1, score_for: 3, score_against: 1 } } } } },
  strength: { request: { kind: "session", input: { sport: "Musculation", sportId: "muscu_gym", date, metrics: [["Exercices", "5"], ["Séries", "18"], ["Volume", "6,4 t"], ["Durée", "1 h 05"]], week: { ...week, markRow: 1 } } } },
  long: { request: { kind: "session", input: { sport: "Randonnée en raquettes à neige sur sentier balisé de moyenne montagne", sportId: "snowshoeing", date, name: "Marie-Charlotte de La Rochefoucauld-Montbel", metrics: [["Distance", "14,8 km"], ["Durée", "4 h 20"], ["Vitesse", "3,4 km/h"], ["Dénivelé", "+860 m"]] } }, options: { name: true } },
  climbing: { request: { kind: "session", input: { sport: "Escalade en salle", sportId: "bouldering", date, metrics: [["Durée", "1 h 30"], ["Meilleure", "6b+"], ["Réussites", "5/8"]] } } },
  empty: { request: { kind: "session", input: { sport: "Pratique libre", date: null, metrics: [] } } },
  record: { request: { kind: "achievement", input: { type: "record", title: "Charge maximale", value: "120 kg", sport: "Musculation", sportId: "muscu_gym", previous: "115 kg", date } } },
  milestone: { request: { kind: "achievement", input: { type: "milestone", title: "Ma 100e séance", value: "100", progress: "100 séances enregistrées depuis le 3 mars 2025.", date } } },
};

export function StoryPreview({ name, style }: { name: string; style?: string }) {
  const c = STORY_CASES[name] ?? STORY_CASES.gps!;
  const s = (ShareStory.STYLES.includes(style as StoryStyle) ? style : "champ") as StoryStyle;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StoryCard model={buildStory(c.request, { ...c.options, style: s })} style={s} width={540} />
    </View>
  );
}
