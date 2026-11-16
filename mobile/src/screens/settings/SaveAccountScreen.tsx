/* AUD-20: a discovery account (Supabase anonymous sign-in) becomes a regular account without losing anything: same id, same sessions,
   same progress. Supabase sends a confirmation e-mail; the account stays usable meanwhile. */
import { useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useAuth } from "../../data/auth";
import { useOnline } from "../../lib/network";
import { EMAIL_RE } from "../auth/LoginScreen";

export function SaveAccountScreen() {
  const { saveDiscovery, isDiscovery } = useAuth();
  const online = useOnline();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function submit() {
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Choisis un nom d’au moins 2 caractères.";
    if (!EMAIL_RE.test(email.trim())) next.email = "Indique une adresse e-mail valide.";
    if (password.length < 8) next.password = "Choisis un mot de passe d’au moins 8 caractères.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const r = await saveDiscovery(name, email, password);
      setSent(r.needsConfirmation ? email.trim().toLowerCase() : "");
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (sent !== null)
    return (
      <Screen>
        <Card tone="accent" style={{ gap: 8 }}>
          <T variant="h3">Presque fini</T>
          <T>{sent ? `Confirme ton adresse depuis l’e-mail envoyé à ${sent}. Tu peux continuer à utiliser TITAN en attendant : tout est déjà sur ton compte.` : "Ton compte est sauvegardé. Tes séances et ta progression te suivent partout."}</T>
        </Card>
      </Screen>
    );
  if (!isDiscovery)
    return (
      <Screen>
        <T>Ton compte est déjà sauvegardé.</T>
      </Screen>
    );
  return (
    <Screen>
      <T tone="muted">Tes séances, ton niveau et ton aventure restent exactement là où ils sont : on ajoute seulement une adresse et un mot de passe pour les retrouver sur un autre appareil ou sur titan-app.fr.</T>
      <Field label="Nom affiché" value={name} onChangeText={setName} error={errors.name} maxLength={24} autoComplete="name" testID="save-name" />
      <Field label="E-mail" value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" testID="save-email" />
      <Field label="Mot de passe" value={password} onChangeText={setPassword} error={errors.password} hint="8 caractères minimum." secure autoComplete="new-password" testID="save-password" />
      {errors.form ? <T variant="small" tone="err" accessibilityRole="alert">{errors.form}</T> : null}
      <Button label="Sauvegarder mon compte" loading={busy} disabled={!online} onPress={submit} testID="save-submit" />
    </Screen>
  );
}

/** Reminder shown to a discovery account at the places where losing it would hurt: the QG and after a session. */
export function DiscoveryBanner({ onPress }: { onPress: () => void }) {
  const { isDiscovery } = useAuth();
  if (!isDiscovery) return null;
  return (
    <Card tone="amber" onPress={onPress} accessibilityLabel="Compte non sauvegardé. Sauvegarder mon compte." testID="discovery-banner">
      <T variant="eyebrow" tone="amber">Compte d’essai</T>
      <T variant="bodyStrong">Sauvegarde ton compte pour ne pas perdre tes séances.</T>
      <T variant="small">Un e-mail et un mot de passe suffisent : tout ce que tu as fait est conservé.</T>
    </Card>
  );
}
