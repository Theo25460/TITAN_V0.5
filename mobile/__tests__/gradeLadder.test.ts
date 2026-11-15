/* AUD-29: every grade offered as a chip is accepted by the session check (no chip can produce a refused grade). */
import { buildSession, freshDraft, GRADE_LADDER } from "../src/core/session";

test.each(Object.entries(GRADE_LADDER))("%s grades are all valid", (system, grades) => {
  for (const g of grades) {
    const d = freshDraft("bouldering");
    const draft = { ...d, durM: "60", climbing: { ...d.climbing, discipline: system === "Français voie" ? "Voie" : "Bloc", system, best: g } } as typeof d;
    const built = buildSession(draft);
    expect([g, built.errors.some((e) => e.field === "climbing.best")]).toEqual([g, false]);
  }
});
