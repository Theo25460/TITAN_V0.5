import { clean, composeMail, FEEDBACK_MAX, problemWith } from "../src/lib/feedback";

describe("feedback (V11-79)", () => {
  test("a message is checked before any mail is composed", () => {
    expect(problemWith("court")).toMatch(/au moins 10/);
    expect(problemWith("x".repeat(FEEDBACK_MAX + 1))).toMatch(/dépasse/);
    expect(problemWith("Un message tout à fait suffisant.")).toBeNull();
    expect(problemWith("   \u0000\u0001  ")).toMatch(/au moins/);
  });
  test("control characters and line endings are cleaned", () => {
    expect(clean("a\u0000b\r\nc\u0007 ")).toBe("ab\nc");
  });
  test("technical information is added only when given, and never contains account data", () => {
    const without = composeMail("idea", "Une idée de fonction pour le journal.", null);
    expect(without.subject).toBe("TITAN Android — Idée");
    expect(without.body).not.toMatch(/Informations techniques/);
    const withInfo = composeMail("problem", "Un bug sur la séance.", { app: "1.1.0 (301)", android: "14 (API 34)", device: "Google Pixel 8" });
    expect(withInfo.body).toMatch(/Application : 1\.1\.0 \(301\)/);
    expect(withInfo.body).toMatch(/Téléphone : Google Pixel 8/);
    expect(withInfo.body).not.toMatch(/@|token|session/i);
    expect(withInfo.url.startsWith("mailto:titanteam.app@gmail.com?subject=")).toBe(true);
  });
  test("the body is bounded", () => {
    expect(composeMail("problem", "y".repeat(FEEDBACK_MAX + 500), null).body.length).toBeLessThanOrEqual(FEEDBACK_MAX);
  });
});
