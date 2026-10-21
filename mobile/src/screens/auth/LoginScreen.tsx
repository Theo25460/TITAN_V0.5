import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import { type TextInput, View } from "react-native";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useAuth } from "../../data/auth";
import { useOnline } from "../../lib/network";
import type { RootParams } from "../../navigation/types";
import { space } from "../../theme/tokens";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function LoginScreen({ navigation, route }: NativeStackScreenProps<RootParams, "Login">) {
  const { signIn, notice, clearNotice } = useAuth();
  const online = useOnline();
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (busy) return;
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "Indique une adresse e-mail valide.";
    if (!password) next.password = "Indique ton mot de passe.";
    setErrors(next);
    if (next.email || next.password) return;
    if (!online) return setErrors({ form: "La connexion demande Internet. Vérifie ton réseau puis réessaie." });
    setBusy(true);
    clearNotice();
    try {
      await signIn(email, password);
    } catch (e) {
      setErrors({ form: (e as Error).message });
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <View style={{ gap: space.s2 }}>
        <T variant="h1">Bon retour</T>
        <T variant="body" tone="muted">
          Connecte-toi avec ton compte TITAN.
        </T>
      </View>
      {notice ? <T tone="warn" variant="small">{notice}</T> : null}
      <Field label="E-mail" value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} testID="login-email" />
      <Field ref={passwordRef} label="Mot de passe" value={password} onChangeText={setPassword} error={errors.password} secure autoComplete="current-password" returnKeyType="go" onSubmitEditing={submit} testID="login-password" />
      {errors.form ? (
        <T variant="small" tone="err" accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {errors.form}
        </T>
      ) : null}
      <Button label={busy ? "Connexion…" : "Se connecter"} loading={busy} onPress={submit} testID="login-submit" />
      <Button label="Mot de passe oublié ?" kind="ghost" onPress={() => navigation.navigate("Forgot", { email })} />
      <Button label="Créer un compte" kind="secondary" onPress={() => navigation.replace("Signup")} />
    </Screen>
  );
}
