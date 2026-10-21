import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { SportGrid, SportSearch } from "../../components/SportPicker";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Sports } from "../../core";
import { usePrefs, useSavePrefs } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { space } from "../../theme/tokens";

/** Favourite sports (same preference as the website onboarding): shown first when recording a session. */
export function SportsScreen() {
  const prefs = usePrefs();
  const save = useSavePrefs();
  const toast = useToast();
  const online = useOnline();
  const [picked, setPicked] = useState<string[]>(prefs.favoriteSports);
  const [limit, setLimit] = useState(false);
  useEffect(() => setPicked(prefs.favoriteSports), [prefs.favoriteSports]);
  const toggle = (id: string) => {
    setLimit(false);
    setPicked((p) => (p.includes(id) ? p.filter((s) => s !== id) : p.length >= 5 ? (setLimit(true), p) : [...p, id]));
  };
  const changed = picked.join() !== prefs.favoriteSports.join();
  return (
    <Screen
      footer={
        <Button
          label="Enregistrer mes sports"
          loading={save.isPending}
          disabled={!changed || !online}
          onPress={() =>
            save
              .mutateAsync({ prefs: { favoriteSports: picked } })
              .then(() => toast({ kind: "ok", title: "Sports enregistrés" }))
              .catch((e) => toast({ kind: "err", title: "Non enregistré", message: errorMessage(e) }))
          }
        />
      }
    >
      <T tone="muted">Jusqu’à 5 sports, proposés en premier quand tu enregistres une séance. Tu peux toujours en pratiquer d’autres : 260 sports sont disponibles.</T>
      <Section title={`Mes sports (${picked.length}/5)`}>
        {picked.length ? <SportGrid ids={picked} selected={picked} onPick={toggle} /> : <T variant="small">Aucun sport favori.</T>}
        {limit ? <T variant="caption" tone="warn">5 sports maximum : retire-en un pour en choisir un autre.</T> : null}
      </Section>
      <View style={{ gap: space.s3 }}>
        <SportSearch onPick={toggle} selected={picked} />
        <SportGrid ids={Sports.POPULAR.filter((s) => !picked.includes(s))} onPick={toggle} />
      </View>
      {!online ? <T variant="caption" tone="warn">Hors ligne : les préférences s’enregistrent avec une connexion.</T> : null}
    </Screen>
  );
}
