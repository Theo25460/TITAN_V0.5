import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Alert } from "../../components/Dialog";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Sheet } from "../../components/Sheet";
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

function statusOf(item: api.AtelierItem, equipped: boolean) {
  if (equipped) return "Équipé";
  if (item.owned) return "Dans ta collection";
  if (item.unlock === "credits") return `${Format.number(item.price)} crédits`;
  if (item.unlock === "rank") return `Récompense du niveau ${item.min_level}`;
  if (item.unlock === "plus") return "TITAN+ · bientôt";
  return "À débloquer";
}

function Piece({ item, avatar, level, large = false }: { item: api.AtelierItem; avatar?: string | null; level: number; large?: boolean }) {
  const card = CARD_STYLES[item.cosmetic];
  const overlay = MAP_OVERLAYS[item.cosmetic];
  return (
    <View style={[styles.preview, large && { height: 164 }]} importantForAccessibility="no-hide-descendants">
      {item.slot === "frame" ? <Avatar id={avatar} frame={item.cosmetic} size={large ? 116 : 58} />
        : item.slot === "map" ? <View style={styles.mapPrev}>
          <Image source={worldImages.valley} style={styles.mapArt} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay?.color, opacity: overlay?.opacity ?? 0 }]} />
        </View> : <View style={[styles.cardPrev, large && { width: "85%", height: 128, padding: 16 }, { backgroundColor: card?.bg, borderColor: card?.line }]}>
          <T variant="caption" color={card?.ac}>TITAN</T>
          <T variant={large ? "h2" : "bodyStrong"} color={card?.tx}>Niv. {level}</T>
        </View>}
    </View>
  );
}

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
  const [selected, setSelected] = useState<string | null>(null);
  const a = q.data;

  async function refresh() {
    await Promise.all([qc.invalidateQueries({ queryKey: keys.atelier(owner) }), qc.invalidateQueries({ queryKey: keys.profile(owner) }), qc.invalidateQueries({ queryKey: keys.adventure(owner) })]);
  }

  async function equip(item: api.AtelierItem) {
    setBusy(item.id);
    try {
      await api.setAppearance(owner, item.slot, item.id);
      await refresh();
      toast({ kind: "ok", title: `${item.name} équipé` });
    } catch (e) {
      toast({ kind: "err", title: "Impossible d’équiper", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  function buy(item: api.AtelierItem) {
    Alert.alert(`Obtenir « ${item.name} » ?`, `${Format.number(item.price)} crédits pour ajouter cette pièce à ta collection et l’équiper. Purement visuel : aucun avantage sportif ni de classement.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: `Échanger ${item.price} crédits`,
        onPress: async () => {
          setBusy(item.id);
          try {
            await api.purchaseItem(owner, item.id);
            // The exchange is done once the server accepted it. Putting the piece on is a second request: if it fails, the
            // player keeps the piece and is told it is not worn yet, instead of believing it is (it was swallowed before).
            const worn = await api.setAppearance(owner, item.slot, item.id).then(() => true, () => false);
            await refresh();
            toast(worn
              ? { kind: "ok", title: `${item.name} ajouté et équipé` }
              : { kind: "ok", title: `${item.name} ajouté à ta collection`, message: "Il n’a pas pu être équipé : touche « Équiper » sur sa carte." });
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
  const piece = items.find(item => item.id === selected);
  const level = adventure?.level ?? a.level;

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
            const status = statusOf(item, isOn);
            return (
              <Card key={item.id} style={styles.item} onPress={() => setSelected(item.id)}
                testID={`atelier-preview-${item.id}`} accessibilityLabel={`${item.name}. ${status}. Voir l’aperçu`}>
                <Piece item={item} avatar={adventure?.avatar} level={level} />
                <T variant="bodyStrong">{item.name}</T>
                <T variant="caption" tone={isOn ? "accent" : "muted"}>{status}</T>
              </Card>
            );
          })}
        </View>
      </Section>
      <T variant="caption" tone="faint">
        Catalogue permanent, sans rotation ni compte à rebours. Les cadres de rang se gagnent en progressant.
      </T>
      {piece ? (
        <Sheet visible onClose={() => setSelected(null)} title={piece.name}>
          <Piece item={piece} avatar={adventure?.avatar} level={level} large />
          <T variant="bodyStrong">{statusOf(piece, equipped === piece.cosmetic)}</T>
          {piece.description ? <T variant="small">{piece.description}</T> : null}
          {!online ? <T tone="warn">Connecte-toi pour modifier ta collection.</T> : null}
          {equipped !== piece.cosmetic && (piece.owned ? (
            <Button label="Équiper" disabled={!online || !!busy} loading={busy === piece.id} onPress={() => void equip(piece)} />
          ) : piece.unlock === "credits" ? (
            <>
              <T variant="small">{a.credits < piece.price
                ? `Encore ${Format.number(piece.price - a.credits)} crédits à gagner en séance.`
                : `Solde après échange · ${Format.number(a.credits - piece.price)} crédits`}</T>
              <Button kind="amber" label={`Obtenir pour ${Format.number(piece.price)} crédits`} disabled={!online || !!busy || a.credits < piece.price}
                onPress={() => { setSelected(null); buy(piece); }} />
            </>
          ) : null)}
        </Sheet>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s3 },
  item: { width: "47.5%", flexGrow: 1, gap: space.s2, alignItems: "flex-start" },
  preview: { alignSelf: "stretch", height: 92, alignItems: "center", justifyContent: "center", borderRadius: radius.r2, backgroundColor: colors.bg1 },
  mapPrev: { width: "100%", height: "100%", borderRadius: radius.r2, overflow: "hidden" },
  // A bundled image carries its own pixel size in its style: without an explicit size the painting is not scaled to its box.
  mapArt: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  cardPrev: { maxWidth: "100%", width: 110, height: 70, borderRadius: 10, borderWidth: 1, padding: 8, justifyContent: "space-between" },
});
