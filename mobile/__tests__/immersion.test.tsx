import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QgBanner } from "../src/components/QgBanner";
import { shouldCheer } from "../src/components/TodayStrip";
import { dayOfYear, voiceLine, type VoiceContext } from "../src/lib/voice";

const base: VoiceContext = { hour: 9, dayOfYear: 100, sessions: 12, sessionsToday: 0, weekDays: 1, weekTarget: 3, chapterReady: false, worldName: "La vallée de l’Aube", stepsRatio: null, daysAway: 0 };
const metrics = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };

describe("TITAN's voice (immersion)", () => {
  test("it says what is true, in priority order", () => {
    expect(voiceLine({ ...base, sessions: 0 })).toMatch(/Ta première balise/);
    expect(voiceLine({ ...base, sessionsToday: 1, chapterReady: true })).toMatch(/séance|noté|Bien joué/);
    expect(voiceLine({ ...base, chapterReady: true })).toBe("Une balise est prête à s’allumer dans La vallée de l’Aube.");
    expect(voiceLine({ ...base, daysAway: 5 })).toMatch(/Content de te revoir.*sans pression/);
    expect(voiceLine({ ...base, weekDays: 3 })).toMatch(/Semaine tenue/);
    expect(voiceLine({ ...base, stepsRatio: 1.2 })).toMatch(/Objectif de pas atteint/);
  });

  test("it never scolds, counts misses or begs the player back, whatever the context", () => {
    const forbidden = /(manqu|raté|retard|tu n['’]as pas|dernière chance|reviens|ne perds pas|série|streak|perdu)/i;
    for (let hour = 0; hour < 24; hour++)
      for (const day of [0, 1, 2, 3, 40, 199]) {
        for (const daysAway of [null, 0, 1, 3, 30])
          for (const sessions of [0, 5])
            expect(voiceLine({ ...base, hour, dayOfYear: day, daysAway, sessions, weekDays: 0 })).not.toMatch(forbidden);
      }
  });

  test("it varies by day but is stable within a day", () => {
    const lines = new Set([100, 101, 102].map((d) => voiceLine({ ...base, dayOfYear: d })));
    expect(lines.size).toBeGreaterThan(1);
    expect(voiceLine({ ...base, dayOfYear: 100 })).toBe(voiceLine({ ...base, dayOfYear: 100 }));
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
  });

  test("the banner greets, names the rank and carries the line", () => {
    render(<SafeAreaProvider initialMetrics={metrics}><QgBanner greeting="Bonjour, Camille" line="Prêt quand tu l’es." level={7} rankName="Sentinelle" avatar="scout" onProfile={jest.fn()} /></SafeAreaProvider>);
    expect(screen.getByText("Bonjour, Camille")).toBeTruthy();
    expect(screen.getByText("Prêt quand tu l’es.")).toBeTruthy();
    expect(screen.getByLabelText("Profil, niveau 7, Sentinelle")).toBeTruthy();
  });
});

test("the step goal is cheered once a day, never merely because the app reopened", () => {
  expect(shouldCheer(null, "2026-11-04", true)).toBe(true);
  expect(shouldCheer("2026-11-03", "2026-11-04", true)).toBe(true);
  expect(shouldCheer("2026-11-04", "2026-11-04", true)).toBe(false);
  expect(shouldCheer(null, "2026-11-04", false)).toBe(false);
});
