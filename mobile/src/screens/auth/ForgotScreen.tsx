import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useAuth } from "../../data/auth";
import { useOnline } from "../../lib/network";
import type { RootParams } from "../../navigation/types";
import { EMAIL_RE } from "./LoginScreen";

export function ForgotScreen({ navigation, route }: NativeStackScreenProps<RootParams, "Forgot">) {
  const { resetPassword } = useAuth();
  const online = useOnline();
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!EMAIL_RE.test(email.trim())) return setError("Indique une adresse e-mail valide.");
    if (!online) return setError("L’envoi du lien demande Internet.");
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      {sent ? (
        <>
          <T variant="h1">Lien envoyé</T>
          <T>
            Si un compte existe pour <T variant="bodyStrong">{email.trim().toLowerCase()}</T>, un e-mail t’attend. Le lien ouvre la page sécurisée de titan-app.fr pour choisir un nouveau mot de passe ; il fonctionnera ensuite dans l’application.
          </T>
          <Button label="Retour à la connexion" onPress={() => navigation.replace("Login", { email })} />
        </>
      ) : (
        <>
          <T variant="h1">Mot de passe oublié</T>
          <T tone="muted">Indique l’e-mail de ton compte : nous t’envoyons un lien pour en choisir un nouveau.</T>
          <Field label="E-mail" value={email} onChangeText={setEmail} error={error} autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={submit} />
          <Button label="Envoyer le lien" loading={busy} onPress={submit} />
        </>
      )}
    </Screen>
  );
}
