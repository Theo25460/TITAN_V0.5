import { render, screen } from "@testing-library/react-native";
import { T } from "../src/components/Text";
test("headings, body and large values accommodate 200 percent text", () => {
 render(<><T variant="h1">Grand titre</T><T>Texte courant</T><T variant="numLarge">123456</T></>);
 for (const value of ["Grand titre", "Texte courant", "123456"]) expect(screen.getByText(value).props.maxFontSizeMultiplier).toBe(2);
});
