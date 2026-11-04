/* Display rules: French count labels and chart axis labels that never overlap. */
import { labelIndexes } from "../src/components/Charts";
import { countLabel } from "../src/components/Section";
import { specific } from "../src/screens/progress/RecordsScreen";

test("0 and 1 take the singular, more takes the plural", () => {
  expect(countLabel("séances", "1")).toBe("séance");
  expect(countLabel("jours actifs", "0")).toBe("jour actif");
  expect(countLabel("semaines tenues", "1")).toBe("semaine tenue");
  expect(countLabel("séances", "2")).toBe("séances");
  expect(countLabel("de pratique", "1")).toBe("de pratique");
  expect(countLabel("séances", "1 h 01")).toBe("séances");
});

test("axis labels keep at least 40 px apart and always show the latest bar", () => {
  const twelve = labelIndexes(12, 340);
  expect(twelve.has(11)).toBe(true);
  expect(twelve.size).toBeLessThanOrEqual(Math.floor(340 / 40) + 1);
  const year = [...labelIndexes(52, 340)].sort((a, b) => a - b);
  expect(year.at(-1)).toBe(51);
  for (let i = 1; i < year.length; i += 1) expect(((year[i] - year[i - 1]) * 340) / 52).toBeGreaterThanOrEqual(40);
  expect(labelIndexes(0, 340).size).toBe(0);
});

test("record cards keep what is specific; standard cautions are collected once, unknown wording is kept", () => {
  const used = new Set<string>();
  expect(specific("Charge la plus élevée déclarée, réalisée sur 5 répétitions. Ce n’est pas un 1RM estimé.", used)).toBe("Charge la plus élevée déclarée, réalisée sur 5 répétitions.");
  expect(specific("Un repère historique, pas une recommandation de durée.", used)).toBe("");
  expect(used.size).toBe(2);
  expect(specific("Une formulation que l’application ne connaît pas encore.", used)).toBe("Une formulation que l’application ne connaît pas encore.");
  expect(used.size).toBe(2);
});
