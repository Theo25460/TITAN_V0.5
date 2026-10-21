import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Image, StyleSheet, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { ProgressBar } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { Segmented } from "../../components/Segmented";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format } from "../../core";
import { CARD_STYLES, MAP_OVERLAYS } from "../../core/cosmetics";
import { worldImages } from "../../core/images";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { keys, useAdventure, useAtelier } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { colors, radius, space } from "../../theme/tokens";

type Slot = "frame" | "map" | "card";
const SLOT_LABEL: Record<Slot, string> = { frame: "Cadres", map: "Ambiances", card: "Cartes" };

/** Cosmetics only, bought with credits earned by training; possession and appearance are decided by the server. */
export function AtelierScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const q = useAtelier();
  const adventure = useAdventure().data;
  const toast = useToast();
  const online = useOnline();
  const [slot, setSlot] = useState<Slot>("frame");
  const [busy, setBusy] = useState<string | null>(null);
  const a = q.data;

  async function refresh() {
    await Promise.all([qc.invalidateQueries({ queryKey: keys.atelier(owner) }), qc.invalidateQueries({ queryKey: keys.profile(owner) }), qc.invalidateQueries({ queryKey: keys.adventure(owner) })]);
  }

  async function equip(item: api.AtelierItem) {
    setBusy(item.id);
    try {
      await api.setAppearance(item.slot, item.id);
      await refresh();
      toast({ kind: "ok", title: `${item.name} équipé` });
    } catch (e) {
      toast({ kind: "err", title: "Impossible d’équiper", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  function buy(item: api.AtelierItem) {
    Alert.alert(`Obtenir « ${item.name} » ?`, `${Format.number(item.price)} crédits gagnés par tes séances. Purement visuel : aucun avantage sportif ni de classement.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: `Échanger ${item.price} crédits`,
        onPress: async () => {
          setBusy(item.id);
          try {
            await api.purchaseItem(item.id);
            await api.setAppearance(item.slot, item.id).catch(() => {});
            await refresh();
            toast({ kind: "ok", title: `${item.name} ajouté à ta collection` });
          } catch (e) {
            toast({ kind: "err", title: "Échange impossible", message: errorMessage(e) });
            await refresh();
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  if (q.isLoading && !a) return <Screen><LoadingCards /></Screen>;
  if (!a) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  const items = a.items.filter((i) => i.slot === slot);
  const equipped = a.appearance?.[slot];

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Card tone="amber" style={{ gap: 6 }}>
        <T variant="eyebrow" tone="amber">
          Mes crédits
        </T>
        <T variant="numLarge" tone="amber">
          {Format.number(a.credits)}
        </T>
        <T variant="small">Gagnés uniquement par tes séances validées : 10 % de l’XP. Ils ne s’achètent pas.</T>
        <View style={{ gap: 4 }}>
          <T variant="caption" tone="faint">
            Cette semaine : {Format.number(a.week_credits)} / {Format.number(a.week_credit_cap)} crédits
          </T>
          <ProgressBar value={a.week_credits / Math.max(1, a.week_credit_cap)} color={colors.am} height={5} accessibilityLabel="Crédits gagnés cette semaine" />
        </View>
      </Card>
      <Segmented value={slot} onChange={setSlot} options={(Object.keys(SLOT_LABEL) as Slot[]).map((s) => ({ value: s, label: SLOT_LABEL[s] }))} accessibilityLabel="Catégorie" />
      {!online ? <T variant="caption" tone="warn">Hors ligne : les échanges et changements d’apparence demandent une connexion.</T> : null}
      <Section title={SLOT_LABEL[slot]}>
        <View style={styles.grid}>
          {items.map((item) => {
            const isOn = equipped === item.cosmetic;
            const lockedRank = item.unlock === "rank" && !item.owned && (adventure?.level ?? a.level) < item.min_level;
            const plusOnly = item.unlock === "plus" && !item.owned;
            return (
              <Card key={item.id} style={[styles.item, isOn && { borderColor: colors.cy }]}>
                <View style={styles.preview}>
                  {slot === "frame" ? (
                    <Avatar id={adventure?.avatar} frame={item.cosmetic} size={58} />
                  ) : slot === "map" ? (
                    <View style={styles.mapPrev}>
                      <Image source={worldImages.valley} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_OVERLAYS[item.cosmetic]?.color, opacity: MAP_OVERLAYS[item.cosmetic]?.opacity ?? 0 }]} />
                    </View>
                  ) : (
                    <View style={[styles.cardPrev, { backgroundColor: CARD_STYLES[item.cosmetic]?.bg, borderColor: CARD_STYLES[item.cosmetic]?.line }]}>
                      <T variant="caption" color={CARD_STYLES[item.cosmetic]?.ac}>
                        TITAN
                      </T>
                      <T variant="bodyStrong" color={CARD_STYLES[item.cosmetic]?.tx}>
                        Niv. {adventure?.level ?? a.level}
                      </T>
                    </View>
                  )}
                </View>
                <T variant="bodyStrong" numberOfLines={1}>
                  {item.name}
                </T>
                {isOn ? (
                  <Chip label="Équipé" tone="ok" icon="check" />
                ) : item.owned ? (
                  <Button small kind="secondary" label="Équiper" loading={busy === item.id} disabled={!online || !!busy} onPress={() => equip(item)} />
                ) : item.unlock === "credits" ? (
                  <Button small kind="amber" label={`${Format.number(item.price)} cr.`} loading={busy === item.id} disabled={!online || !!busy || a.credits < item.price} onPress={() => buy(item)} accessibilityHint={a.credits < item.price ? `Il te manque ${item.price - a.credits} crédits` : undefined} />
                ) : lockedRank ? (
                  <T variant="caption" tone="faint">Niveau {item.min_level}</T>
                ) : plusOnly ? (
                  <T variant="caption" tone="faint">TITAN+ · bientôt</T>
                ) : (
                  <T variant="caption" tone="faint">À débloquer</T>
                )}
              </Card>
            );
          })}
        </View>
      </Section>
      <T variant="caption" tone="faint">
        Catalogue permanent, sans rotation ni compte à rebours. Les cadres de rang se gagnent en progressant.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s3 },
  item: { width: "47.5%", flexGrow: 1, gap: space.s2, alignItems: "flex-start" },
  preview: { alignSelf: "stretch", height: 92, alignItems: "center", justifyContent: "center", borderRadius: radius.r2, backgroundColor: colors.bg1 },
  mapPrev: { width: "100%", height: "100%", borderRadius: radius.r2, overflow: "hidden" },
  cardPrev: { width: 110, height: 70, borderRadius: 10, borderWidth: 1, padding: 8, justifyContent: "space-between" },
});
