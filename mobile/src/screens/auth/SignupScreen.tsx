import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import { Linking, type TextInput, View } from "react-native";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useAuth } from "../../data/auth";
import { SITE_URL } from "../../lib/config";
import { useOnline } from "../../lib/network";
import type { RootParams } from "../../navigation/types";
import { colors, space } from "../../theme/tokens";
import { EMAIL_RE } from "./LoginScreen";

export function SignupScreen({ navigation }: NativeStackScreenProps<RootParams, "Signup">) {
  const { signUp, resendConfirmation } = useAuth();
  const online = useOnline();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (busy) return;
    const clean = name.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
    const next: Record<string, string> = {};
    if (clean.length < 2) next.name = "Choisis un nom de 2 caractères minimum.";
    if (!EMAIL_RE.test(email.trim())) next.email = "Indique une adresse e-mail valide.";
    if (password.length < 8) next.password = "Choisis un mot de passe d’au moins 8 caractères.";
    if (!terms) next.terms = "Accepte les conditions pour créer ton compte.";
    setErrors(next);
    if (Object.keys(next).length) return;
    if (!online) return setErrors({ form: "La création du compte demande Internet." });
    setBusy(true);
    try {
      const { needsConfirmation } = await signUp(clean, email, password);
      if (needsConfirmation) setSent(email.trim().toLowerCase());
    } catch (e) {
      setErrors({ form: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <Screen>
        <T variant="h1">Vérifie ta boîte mail</T>
        <T>
          Un lien de confirmation part vers <T variant="bodyStrong">{sent}</T>. Ouvre-le pour activer ton compte, puis reviens te connecter ici.
        </T>
        <T variant="small">Rien reçu après quelques minutes ? Regarde dans les indésirables.</T>
        <Button label="J’ai confirmé : me connecter" onPress={() => navigation.replace("Login", { email: sent })} />
        <Button
          label={resent ? "E-mail renvoyé" : "Renvoyer l’e-mail"}
          kind="secondary"
          disabled={resent}
          onPress={async () => {
            try {
              await resendConfirmation(sent);
              setResent(true);
            } catch (e) {
              setErrors({ form: (e as Error).message });
            }
          }}
        />
        {errors.form ? <T tone="err" variant="small">{errors.form}</T> : null}
      </Screen>
    );

  return (
    <Screen keyboard>
      <View style={{ gap: space.s2 }}>
        <T variant="h1">Rejoins TITAN</T>
        <T tone="muted">Gratuit, sans publicité. Ton compte fonctionne aussi sur titan-app.fr.</T>
      </View>
      <Field label="Nom affiché" value={name} onChangeText={setName} error={errors.name} maxLength={24} autoComplete="name" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} testID="signup-name" />
      <Field ref={emailRef} label="E-mail" value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} testID="signup-email" />
      <Field ref={passwordRef} label="Mot de passe" value={password} onChangeText={setPassword} error={errors.password} hint="8 caractères minimum." secure autoComplete="new-password" testID="signup-password" />
      <Checkbox checked={terms} onChange={setTerms} accessibilityLabel="J’accepte les conditions d’utilisation et la politique de confidentialité" error={!!errors.terms}>
        <T variant="small" tone="default">
          J’accepte les{" "}
          <T variant="small" color={colors.cy} onPress={() => Linking.openURL(`${SITE_URL}/legal_cgu`)} accessibilityRole="link">
            conditions d’utilisation
          </T>{" "}
          et la{" "}
          <T variant="small" color={colors.cy} onPress={() => Linking.openURL(`${SITE_URL}/legal_privacy`)} accessibilityRole="link">
            politique de confidentialité
          </T>
          .
        </T>
      </Checkbox>
      {errors.terms ? <T variant="caption" tone="err">{errors.terms}</T> : null}
      {errors.form ? (
        <T variant="small" tone="err" accessibilityRole="alert">
          {errors.form}
        </T>
      ) : null}
      <Button label={busy ? "Création…" : "Créer mon compte"} loading={busy} onPress={submit} testID="signup-submit" />
      <Button label="J’ai déjà un compte" kind="ghost" onPress={() => navigation.replace("Login")} />
    </Screen>
  );
}
