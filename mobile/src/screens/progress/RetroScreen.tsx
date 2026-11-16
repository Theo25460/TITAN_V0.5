/* AUD-26: « TITAN Rétro » — the year in story cards, each shareable as a 1080×1920 picture. Computed on the phone. */
import { createRef, useMemo, useState, type RefObject } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { SHARE_CARD_SIZE, ShareCard } from "../../components/ShareCard";
import { EmptyState } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { EffortRules, Progress } from "../../core";
import { useLogs, usePrefs, useProfile } from "../../data/hooks";
import { useNavigation } from "@react-navigation/native";
import { errorMessage } from "../../lib/errors";
import { buildRetro, periodBounds, retroYear } from "../../lib/retro";
import { shareCardImage } from "../../lib/shareImage";
import { space } from "../../theme/tokens";

export function RetroScreen({ route }: { route?: { params?: { year?: number; month?: number } } } = {}) {
  const { active } = useLogs();
  const navigation = useNavigation();
  const prefs = usePrefs();
  const profile = useProfile().data;
  const toast = useToast();
  const { width } = useWindowDimensions();
  const year = route?.params?.year ?? retroYear() ?? new Date().getFullYear();
  const month = route?.params?.month ?? null;
  const { label } = periodBounds({ year, month });
  const [busy, setBusy] = useState<number | null>(null);
  const cards = useMemo(() => {
    const cadence = Progress.cadence(active, { target: prefs.weeklyGoalSessions, pauses: prefs.cadencePauses });
    const level = Number(profile?.level) || 0;
    const rank = level ? { name: EffortRules.rank(level).name, level } : null;
    return buildRetro(active, { year, month, cadence, rank });
  }, [active, prefs, profile?.level, year, month]);
  const refs = useMemo(() => cards.map(() => createRef<View>()), [cards]);
  const scale = Math.min(1, (width - space.s4 * 2) / SHARE_CARD_SIZE.width);

  async function share(i: number) {
    setBusy(i);
    try {
      await shareCardImage(refs[i] as RefObject<unknown>, `TITAN Rétro ${label}`);
    } catch (e) {
      toast({ kind: "err", title: "Image impossible à partager", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  if (!cards.length)
    return (
      <Screen>
        <EmptyState icon="calendar" title={`Pas encore de Rétro ${label}`} text="Enregistre tes séances, ou importe ton historique Strava : ton année se raconte dès la première." action="Importer mon historique" onAction={() => navigation.navigate("HistoryImport")} />
      </Screen>
    );
  return (
    <Screen>
      <T variant="h1">{month == null ? `Mon année ${year}` : `Mon mois de ${label}`}</T>
      <T tone="muted">Ton effort réel, tous sports confondus. Chaque carte se partage en story ; rien ne quitte ton téléphone sans toi.</T>
      {cards.map((c, i) => (
        <View key={i} style={{ gap: space.s2, alignItems: "center" }} testID={`retro-card-${i}`}>
          <View style={{ width: SHARE_CARD_SIZE.width * scale, height: SHARE_CARD_SIZE.height * scale, overflow: "hidden", borderRadius: 18 }}>
            <View style={{ transform: [{ scale }], transformOrigin: "top left" as never, width: SHARE_CARD_SIZE.width, height: SHARE_CARD_SIZE.height }}>
              <ShareCard data={c} />
            </View>
          </View>
          <Button small kind="secondary" icon="share" label="Partager cette carte" loading={busy === i} onPress={() => share(i)} testID={`retro-share-${i}`} />
        </View>
      ))}
      {/* Full-size copies, off-screen, are what gets captured at 1080×1920. */}
      <View style={styles.offscreen} pointerEvents="none">
        {cards.map((c, i) => (
          <ShareCard key={i} ref={refs[i]} data={c} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ offscreen: { position: "absolute", left: -10000, top: 0 } });
