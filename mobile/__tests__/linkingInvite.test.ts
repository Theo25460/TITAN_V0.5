/* AUD-12: a verified https invitation link lands on the native Community screen with its code; other paths are untouched. */
import { linking } from "../src/navigation/linking";

const stateOf = (path: string) => linking.getStateFromPath!(path, linking.config as never);
const leaf = (state: ReturnType<typeof stateOf>) => {
  let s: unknown = state;
  let route: { name: string; params?: Record<string, unknown> } | undefined;
  while (s && typeof s === "object" && "routes" in (s as object)) {
    const r = (s as { routes: { name: string; params?: Record<string, unknown>; state?: unknown }[] }).routes.at(-1)!;
    route = r;
    s = r.state;
  }
  return route;
};

test("https://titan-app.fr is a prefix, so invitation links reach the app", () => {
  expect(linking.prefixes).toContain("https://titan-app.fr");
});

test.each([
  ["/social?ami=TN-AB12", { ami: "TN-AB12" }],
  ["/social?guilde=G-K7P2Q#guilde", { guilde: "G-K7P2Q" }],
  ["social.html?ami=TN-AB12", { ami: "TN-AB12" }],
])("%s opens Community with the code", (path, params) => {
  const route = leaf(stateOf(path));
  expect(route?.name).toBe("Community");
  expect(route?.params).toEqual(params);
});

test("existing titan:// routes keep working", () => {
  expect(leaf(stateOf("/journal"))?.name).toBe("Journal");
  expect(leaf(stateOf("/aventure#sentiers"))?.name).toBe("Sentiers");
});
