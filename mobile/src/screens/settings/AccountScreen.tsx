import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Field } from "../../components/Field";
import { Group, ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Progress, Sports } from "../../core";
import { exportOwnData } from "../../data/api";
import { useAuth } from "../../data/auth";
import { useLogs, useProfile, useSavePrefs } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { shareTextFile, toCsv } from "../../lib/exportFile";
import { useOnline } from "../../lib/network";
import { space } from "../../theme/tokens";

export function AccountScreen() {
  const navigation = useNavigation();
  const { email, updatePassword } = useAuth();
  const profile = useProfile();
  const save = useSavePrefs();
  const toast = useToast();
  const online = useOnline();
  const { confirmed } = useLogs();
  const [name, setName] = useState(profile.data?.username ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function rename() {
    const clean = name.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
    if (clean.length < 2) return toast({ kind: "err", title: "Nom trop court", message: "2 caractères minimum." });
    try {
      await save.mutateAsync({ prefs: { name: clean }, username: clean });
      toast({ kind: "ok", title: "Nom mis à jour" });
    } catch (e) {
      toast({ kind: "err", title: "Nom non enregistré", message: errorMessage(e) });
    }
  }

  async function changePassword() {
    if (password.length < 8) return toast({ kind: "err", title: "Mot de passe trop court", message: "8 caractères minimum." });
    setBusy("pwd");
    try {
      await updatePassword(password);
      setPassword("");
      toast({ kind: "ok", title: "Mot de passe modifié", message: "Il fonctionne aussi sur titan-app.fr." });
    } catch (e) {
      toast({ kind: "err", title: "Modification impossible", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    setBusy("csv");
    try {
      const rows: unknown[][] = [["date", "sport", "valeur", "unité", "durée (min)", "minutes d’effort", "RPE", "XP", "note", "archivée"]];
      for (const l of [...confirmed].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()))
        rows.push([new Date(l.date).toISOString(), Sports.label(l.sport), l.val, l.unit, Number(l.details?.duration || l.details?.val2) || "", Math.round(Progress.effortOf(l).effortMinutes), l.details?.bio?.rpe ?? "", l.xp, l.details?.note ?? "", l.archived_at ? "oui" : ""]);
      await shareTextFile(`titan-journal-${Format.dateKey(new Date())}.csv`, toCsv(rows), "text/csv");
    } catch (e) {
      toast({ kind: "err", title: "Export impossible", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function exportAll() {
    if (!online) return toast({ kind: "warn", title: "Connexion requise", message: "L’export complet est préparé par le serveur." });
    setBusy("json");
    try {
      const data = await exportOwnData();
      await shareTextFile(`titan-donnees-${Format.dateKey(new Date())}.json`, JSON.stringify(data, null, 2), "application/json");
    } catch (e) {
      toast({ kind: "err", title: "Export impossible", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen keyboard>
      <Card style={{ gap: space.s3 }}>
        <Field label="Nom affiché" value={name} onChangeText={setName} maxLength={24} />
        <Button small kind="secondary" label="Enregistrer le nom" loading={save.isPending} disabled={!online || name.trim() === (profile.data?.username ?? "")} onPress={rename} />
      </Card>
      <Card style={{ gap: space.s3 }}>
        <T variant="caption" tone="muted">
          E-mail du compte
        </T>
        <T variant="bodyStrong">{email}</T>
        <Field label="Nouveau mot de passe" value={password} onChangeText={setPassword} secure autoComplete="new-password" hint="8 caractères minimum. Valable aussi sur le site." />
        <Button small kind="secondary" label="Changer le mot de passe" loading={busy === "pwd"} disabled={!online || !password} onPress={changePassword} />
      </Card>
      <Section title="Mes données">
        <Group>
          <ListRow icon="download" title="Exporter mon journal (CSV)" subtitle={`${confirmed.length} séances synchronisées`} onPress={busy ? undefined : exportCsv} />
          <ListRow icon="layers" title="Exporter toutes mes données (JSON)" subtitle="Profil, séances, progression : copie complète préparée par le serveur." onPress={busy ? undefined : exportAll} last />
        </Group>
      </Section>
      <View style={{ gap: space.s2 }}>
        <Button kind="danger" label="Supprimer mon compte" icon="trash" onPress={() => navigation.navigate("DeleteAccount")} />
        <T variant="caption" tone="faint" center>
          Suppression définitive du compte et des données associées, sur l’application comme sur le site.
        </T>
      </View>
    </Screen>
  );
}
