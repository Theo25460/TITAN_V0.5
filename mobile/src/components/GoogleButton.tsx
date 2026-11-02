import { useState } from "react";
import { View } from "react-native";
import { useAuth } from "../data/auth";
import { googleEnabled } from "../lib/googleAuth";
import { useOnline } from "../lib/network";
import { Button } from "./Button";
import { T } from "./Text";

/** "Continuer avec Google": shown only when the build says the provider is ready; the sign-in itself happens in the phone's browser. */
export function GoogleButton({ onError }: { onError: (message: string) => void }) {
  const { signInWithGoogle } = useAuth();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  if (!googleEnabled()) return null;
  async function go() {
    if (busy) return;
    if (!online) return onError("La connexion demande Internet. Vérifie ton réseau puis réessaie.");
    setBusy(true);
    try { await signInWithGoogle(); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <View style={{ gap: 8 }}>
      <Button label="Continuer avec Google" kind="secondary" loading={busy} onPress={go} testID="google-signin" accessibilityHint="Ouvre le navigateur du téléphone pour te connecter avec Google" />
      <T variant="caption" tone="faint">TITAN reçoit ton nom et ton adresse e-mail, rien d’autre. En continuant, tu acceptes les conditions d’utilisation et la politique de confidentialité.</T>
    </View>
  );
}
