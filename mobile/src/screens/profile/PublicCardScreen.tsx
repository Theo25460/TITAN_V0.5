import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Share, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Group } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { ToggleRow } from "../../components/Toggle";
import { useToast } from "../../components/Toast";
import { saveCard, type CardSettings } from "../../data/api";
import { useOwner } from "../../data/auth";
import { keys, useCardSettings } from "../../data/hooks";
import { SITE_URL } from "../../lib/config";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { space } from "../../theme/tokens";

const FIELDS: [string, string, string][] = [
  ["name", "Nom affiché", "Ton nom TITAN"],
  ["level", "Niveau et rang", "Ton niveau et ton rang actuels"],
  ["totals", "Totaux", "Séances, heures et semaines tenues"],
  ["sports", "Sports", "Tes disciplines principales"],
  ["titles", "Titres", "Les insignes gagnés dans l’Aventure"],
];

/** Optional public card (/u/<link> on titan-app.fr): off by default, every field chosen by the user, link renewable. */
export function PublicCardScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const q = useCardSettings();
  const toast = useToast();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const c = q.data;

  async function update(enabled: boolean, show: Record<string, boolean>, newLink = false) {
    setBusy(true);
    try {
      const next = await saveCard(enabled, show, newLink);
      qc.setQueryData<CardSettings>(keys.card(owner), next);
    } catch (e) {
      toast({ kind: "err", title: "Carte non mise à jour", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading && !c) return <Screen><LoadingCards count={1} /></Screen>;
  if (!c) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const url = c.slug ? `${SITE_URL}/u/${c.slug}` : null;

  return (
    <Screen>
      <T tone="muted">Une page publique et facultative qui résume ton parcours. Rien d’autre (séances, notes, santé) n’y apparaît.</T>
      <Group>
        <ToggleRow label="Activer ma carte publique" hint={c.enabled ? "Toute personne ayant le lien peut la voir." : "Désactivée : le lien ne montre rien."} value={c.enabled} disabled={busy || !online} onChange={(v) => update(v, c.show)} last />
      </Group>
      {c.enabled ? (
        <>
          <Group title="Ce qui est visible">
            {FIELDS.map(([key, label, hint], i) => (
              <ToggleRow key={key} label={label} hint={hint} value={c.show[key] !== false} disabled={busy || !online} onChange={(v) => update(true, { ...c.show, [key]: v })} last={i === FIELDS.length - 1} />
            ))}
          </Group>
          {url ? (
            <Card style={{ gap: space.s3 }}>
              <T variant="small" selectable>
                {url}
              </T>
              <View style={{ flexDirection: "row", gap: space.s2 }}>
                <Button small label="Partager" icon="share" onPress={() => Share.share({ message: `Mon parcours TITAN : ${url}` }).catch(() => {})} style={{ flex: 1 }} />
                <Button
                  small
                  kind="secondary"
                  label="Nouveau lien"
                  disabled={!online || busy}
                  onPress={() => Alert.alert("Créer un nouveau lien ?", "L’ancien lien cessera immédiatement de fonctionner.", [{ text: "Annuler", style: "cancel" }, { text: "Nouveau lien", onPress: () => update(true, c.show, true) }])}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ) : null}
        </>
      ) : null}
      {!online ? <T variant="caption" tone="warn">Hors ligne : la carte se règle avec une connexion.</T> : null}
    </Screen>
  );
}
