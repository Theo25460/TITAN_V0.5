import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { assertOwner, fetchProfile, savePreferences } from "../data/api";
import { useOwner } from "../data/auth";
import { keys } from "../data/hooks";
import { listProfileCopies, mergePreferenceCopy, removeProfileCopy, type ProfileCopy } from "../data/profileCopies";
import { errorMessage } from "../lib/errors";
import { shareTextFile } from "../lib/exportFile";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Sheet } from "./Sheet";
import { T } from "./Text";
import { useToast } from "./Toast";

/** Pending edits survive app closure and sign-out. Recovery always uses the current server revision. */
export function ProfileRecovery() {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const copies = useQuery({ queryKey: ["profile-copies", owner], queryFn: () => listProfileCopies(owner), retry: false });
  const [selected, setSelected] = useState<ProfileCopy | null>(null);
  const [busy, setBusy] = useState(false);
  const active = selected?.owner === owner ? selected : null;

  async function exportCopy(copy: ProfileCopy) {
    setBusy(true);
    try {
      await assertOwner(owner);
      await shareTextFile(`titan-preferences-${copy.at.replace(/[:.]/g, "-")}.json`, JSON.stringify(copy, null, 2), "application/json");
    } catch (e) { toast({ kind: "err", title: "Export impossible", message: errorMessage(e) }); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!active || busy) return;
    const copy = active;
    setBusy(true);
    try {
      await assertOwner(owner);
      const fresh = await fetchProfile(owner);
      await assertOwner(owner);
      if (!fresh) throw new Error("PROFILE_UNAVAILABLE");
      const edit = mergePreferenceCopy(copy, fresh);
      const receipt = await savePreferences(fresh, edit.prefs, { username: edit.username, privacy: edit.privacy });
      await assertOwner(owner);
      qc.setQueryData(keys.profile(owner), receipt);
      await removeProfileCopy(owner, copy.key);
      await copies.refetch();
      setSelected(null);
      toast({ kind: "ok", title: "Préférences récupérées" });
    } catch (e) { toast({ kind: "err", title: "Copie conservée", message: errorMessage(e) }); }
    finally { setBusy(false); }
  }
  if (copies.error) return <Card><T>Les copies locales ne peuvent pas être lues. Elles sont conservées. Réessaie après redémarrage.</T></Card>;
  if (!copies.data?.length) return null;
  return <Card style={{ gap: space.s3 }}>
    <T variant="h3">Préférences à récupérer</T>
    <T>Ces modifications attendent ta confirmation. Tu peux les exporter ou les réappliquer au profil actuel.</T>
    {copies.data.map(copy => <View key={copy.key} style={{ gap: space.s2 }}>
      <T variant="bodyStrong">{new Date(copy.at).toLocaleString("fr-FR")}</T>
      <Button small kind="secondary" label="Exporter cette copie" disabled={busy} onPress={() => exportCopy(copy)} />
      <Button small label="Réappliquer cette copie" disabled={busy} onPress={() => setSelected(copy)} />
    </View>)}
    <Sheet visible={!!active} onClose={() => { if (!busy) setSelected(null); }} title="Récupérer les préférences">
      <T>Les champs modifiés dans cette copie remplaceront les mêmes champs du profil actuel. Les autres préférences seront conservées. Les séances, XP et crédits ne sont pas modifiés.</T>
      {active?.base === null ? <T>Le résultat d’un envoi précédent est incertain : tous les réglages présents dans cette copie seront réappliqués. Exporte-la d’abord si tu souhaites en vérifier le contenu.</T> : null}
      <Button label="Confirmer la récupération" loading={busy} onPress={restore} />
      <Button kind="ghost" label="Annuler" disabled={busy} onPress={() => setSelected(null)} />
    </Sheet>
  </Card>;
}
