import { render, screen } from "@testing-library/react-native";
import { WorldPathMap } from "../src/components/WorldPathMap";
test("map lights the exact acquired links and names the guardian seal", () => {
 render(<WorldPathMap chapter={4} earned={new Set([1, 2, 3])} color="#3DD9E8" worldName="Aube" finished={false} />);
 expect(screen.getByLabelText(/3 chapitres validés sur 9, chapitre 4 en cours/)).toBeTruthy();
 expect(screen.getByTestId("world-path-earned-2")).toBeTruthy();
 expect(screen.getByTestId("world-path-earned-3")).toBeTruthy();
 expect(screen.queryByTestId("world-path-earned-4")).toBeNull();
 expect(screen.queryByText("★")).toBeNull();
 expect(screen.getByText(/sceau en bouclier/)).toBeTruthy();
});
test("finished lights all links; unstarted lights none", () => {
 const result = render(<WorldPathMap chapter={10} earned={new Set()} color="#3DD9E8" worldName="Aube" finished />);
 for (let i = 2; i <= 9; i++) expect(screen.getByTestId(`world-path-earned-${i}`)).toBeTruthy();
 result.rerender(<WorldPathMap chapter={0} earned={new Set()} color="#3DD9E8" worldName="Aube" finished={false} />);
 expect(screen.queryAllByTestId(/world-path-earned-/)).toHaveLength(0);
});
