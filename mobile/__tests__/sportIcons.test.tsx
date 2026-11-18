import { render } from "@testing-library/react-native";
import { Icon } from "../src/components/Icon";
import { SportChip } from "../src/components/SportPicker";
import { Sports } from "../src/core";
import { ICONS } from "../src/core/icons.generated";

// docs/design/SPORT_ICONS.md — the native catalogue draws the same sport glyphs as the website.
test("chaque sport du catalogue hors ligne a son glyphe natif, et les familles leur marque", () => {
  const catalog = Sports.all();
  expect(catalog.length).toBe(260);
  const glyphs = new Set<string>();
  for (const { id } of catalog) {
    const name = Sports.iconOf(id);
    expect([id, name in ICONS]).toEqual([id, true]);
    expect(name.startsWith("sport-")).toBe(true);
    glyphs.add(name);
  }
  expect(glyphs.size).toBeGreaterThanOrEqual(255);
  for (const family of ["endurance", "force", "technique", "jeu", "mobilite"] as const) expect(Sports.FAMILY_ICON[family] in ICONS).toBe(true);
});

test("un glyphe de sport se dessine avec ses propres épaisseurs et teintes, sans élément inconnu", () => {
  const { toJSON } = render(<Icon name="sport-tennis" size={22} />);
  const tree = JSON.stringify(toJSON());
  expect(tree.length).toBeGreaterThan(200);
  for (const [, parts] of Object.entries(ICONS)) for (const [tag] of parts) expect(["path", "circle", "rect", "line", "polyline", "ellipse"]).toContain(tag);
});

test("la puce de sport porte le glyphe propre au sport choisi", () => {
  const padel = JSON.stringify(render(<SportChip id="padel" onPress={() => {}} />).toJSON());
  const tennis = JSON.stringify(render(<SportChip id="tennis" onPress={() => {}} />).toJSON());
  expect(padel).not.toEqual(tennis);
});
