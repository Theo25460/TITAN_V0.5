import { Component, type ReactNode } from "react";
import { View } from "react-native";
import { colors, space } from "../theme/tokens";
import { Button } from "./Button";
import { T } from "./Text";

/** Last line of defence: a rendering error shows a recoverable screen instead of a blank app. Data is not touched
    (sessions stay in the device queue). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[TITAN] render error", error?.message);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: space.s6, gap: space.s4 }} accessibilityRole="alert">
        <T variant="h2">Un écran n’a pas pu s’afficher</T>
        <T tone="muted">Tes séances enregistrées sont conservées sur ce téléphone. Réessaie : si le problème revient, écris à l’assistance depuis le profil.</T>
        <Button label="Réessayer" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
