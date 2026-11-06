import { fireEvent, render, screen } from "@testing-library/react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { AccessibleTabBar, TabLabel, tabLayout } from "../src/navigation/Tabs";
jest.mock("../src/data/queue", () => ({ useQueue: () => ({ items: [] }) }));
test("five full destination labels remain available at 200 percent on a small phone", () => {
 const layout = tabLayout(320, 2, 16);
 expect(layout.columns).toBe(2);
 expect(layout.itemHeight).toBeGreaterThanOrEqual(44);
 expect(layout.height).toBeGreaterThan(tabLayout(320, 1, 16).height);
 render(<TabLabel color="#fff">Aventure</TabLabel>);
 expect(screen.getByText("Aventure").props.maxFontSizeMultiplier).toBe(2);
 expect(screen.getByText("Aventure").props.numberOfLines).toBeUndefined();
});
test.each([320, 360, 390, 600, 844])("width %i retains touch targets and text space", width => {
 for (const scale of [1, 1.5, 2]) {
  const layout = tabLayout(width, scale, 16);
  expect(width / layout.columns).toBeGreaterThanOrEqual(44);
  expect(layout.itemHeight).toBeGreaterThanOrEqual(44);
  expect(layout.height).toBeGreaterThanOrEqual(Math.ceil(5 / layout.columns) * layout.itemHeight + 16);
 }
});
test("large-text navigation retains selection, labels, badges and preventable events", () => {
 const routes = ["QG", "Progress", "Record", "Adventure", "Profile"].map(name => ({ key: name, name }));
 const titles = ["QG", "Progrès", "Séance", "Aventure", "Profil"];
 const emit = jest.fn(() => ({ defaultPrevented: false })), navigate = jest.fn();
 const props = { state: { index: 0, routes }, insets: { top: 0, bottom: 16, left: 0, right: 0 }, descriptors: Object.fromEntries(routes.map((r, i) => [r.key, { options: { title: titles[i], tabBarAccessibilityLabel: r.name === "Record" ? "Enregistrer une séance" : titles[i], tabBarButtonTestID: `tab-${r.name}`, tabBarBadge: r.name === "Progress" ? 2 : undefined } }])), navigation: { emit, navigate } } as unknown as BottomTabBarProps;
 render(<AccessibleTabBar {...props} width={320} fontScale={2} />);
 expect(screen.getAllByRole("tab")).toHaveLength(5);
 expect(screen.getByRole("tab", { name: "QG", selected: true })).toBeTruthy();
 expect(screen.getByRole("tab", { name: /Progrès.*2 séances en attente/ })).toBeTruthy();
 fireEvent.press(screen.getByRole("tab", { name: "Enregistrer une séance" }));
 expect(navigate).toHaveBeenCalledWith("Record", undefined);
 emit.mockReturnValue({ defaultPrevented: true });
 fireEvent.press(screen.getByRole("tab", { name: "Aventure" }));
 expect(navigate).toHaveBeenCalledTimes(1);
});
