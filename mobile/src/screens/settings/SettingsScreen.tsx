import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { Group, ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { ToggleRow } from "../../components/Toggle";
import { useToast } from "../../components/Toast";
import { useOwner } from "../../data/auth";
import { readLogsCache } from "../../data/logsCache";
import { useQueue } from "../../data/queue";
import { loadDevicePrefs, saveDevicePrefs } from "../../lib/prefsLocal";
import { useReducedMotion } from "../../lib/motion";
import { useOnline } from "../../lib/network";

export function SettingsScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const queue = useQueue();
  const reduced = useReducedMotion();
  const [haptics, setHaptics] = useState(true);
  const [cached, setCached] = useState<number | null>(null);
  useEffect(() => {
    loadDevicePrefs().then((p) => setHaptics(p.haptics));
    readLogsCache(owner).then((c) => setCached(c?.logs.length ?? 0));
  }, [owner]);
  return (
    <Screen>
      <Group title="Interactions">
        <ToggleRow label="Retours haptiques" hint="Vibrations légères lors des actions." value={haptics} onChange={(v) => { setHaptics(v); saveDevicePrefs({ haptics: v }); }} />
        <ListRow icon="eye" title="Animations" subtitle={reduced ? "Réduites, selon le réglage d’accessibilité d’Android." : "Suivent le réglage « Supprimer les animations » d’Android."} last />
      </Group>
      <Group title="Données sur ce téléphone">
        <ListRow icon="journal" title="Journal disponible hors ligne" value={cached === null ? "…" : `${cached} séances`} />
        <ListRow icon="upload" title="Séances en attente d’envoi" value={String(queue.items.length)} />
        <ListRow
          icon="restore"
          title="Actualiser depuis le serveur"
          subtitle={online ? "Recharge tes données de compte." : "Disponible avec une connexion."}
          onPress={
            online
              ? () =>
                  Alert.alert("Actualiser les données ?", "Les données affichées sont rechargées depuis ton compte. Les séances en attente restent sur ce téléphone.", [
                    { text: "Annuler", style: "cancel" },
                    {
                      text: "Actualiser",
                      onPress: async () => {
                        await qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === owner });
                        toast({ kind: "ok", title: "Données actualisées" });
                      },
                    },
                  ])
              : undefined
          }
          last
        />
      </Group>
      <T variant="caption" tone="faint">
        Les séances en attente ne sont jamais effacées par une actualisation : elles partent dès que la connexion revient.
      </T>
    </Screen>
  );
}
