import { ADS_BUILD } from "../../ads/adIds";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useOwner } from "../../data/auth";
import { keys, useProfile } from "../../data/hooks";
import { BILLING_BUILD, buy, loadOffers, manageInPlay, messageFor, restore, type Offer } from "../../lib/playBilling";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/tokens";

const accessToken = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;

/** TITAN+ and the Coach offers. Without the billing build flag this is the honest "coming soon" page (no price, no payment).
    With it, the offers and their prices come from Google Play; access is granted by our server after it has checked the purchase with Google. */
export function TitanPlusScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const profile = useProfile().data;
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: keys.profile(owner) }), [qc, owner]);

  useEffect(() => {
    if (!BILLING_BUILD) return;
    loadOffers()
      .then((o) => alive.current && setOffers(o))
      .catch(() => alive.current && (setOffers([]), setNote("Google Play n’est pas joignable pour le moment.")));
  }, []);

  async function subscribe(o: Offer) {
    if (busy) return;
    setBusy(o.id);
    setNote(null);
    const r = await buy(o, owner, accessToken);
    if (!alive.current) return;
    setBusy(null);
    if (r.kind === "active") {
      setNote(r.verdict.acknowledged ? "Merci ! Ton abonnement est actif." : "Abonnement actif. Google Play attend encore une confirmation : ouvre « Restaurer mes achats » dans un instant.");
      refresh();
    } else if (r.kind === "pending") setNote("Paiement en attente chez Google Play. L’accès arrive dès qu’il est confirmé.");
    else if (r.kind === "error") setNote(messageFor(r.error));
  }

  async function restoreAll() {
    if (busy) return;
    setBusy("restore");
    setNote(null);
    try {
      const r = await restore(accessToken);
      if (!alive.current) return;
      setNote(r.active ? "Achats restaurés." : r.checked ? "Aucun abonnement actif n’a pu être rattaché à ce compte." : "Google Play ne signale aucun abonnement.");
      refresh();
    } catch (e) {
      if (alive.current) setNote(messageFor(e));
    } finally {
      if (alive.current) setBusy(null);
    }
  }

  const live = BILLING_BUILD && offers && offers.length > 0;
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 12, paddingVertical: 12 }}>
        <Icon name="crown" size={44} color={colors.am} />
        <T variant="h1" center>
          {live ? "TITAN+" : "TITAN+ — Bientôt disponible"}
        </T>
        <T tone="muted" center>
          {live ? "Des analyses plus poussées et davantage de confort de personnalisation. Les prix sont ceux de Google Play." : "Des analyses plus poussées et davantage de confort de personnalisation. Pas encore proposé : aucun achat n’est possible aujourd’hui."}
        </T>
      </View>
      {profile?.is_elite ? (
        <Card tone="accent">
          <T variant="bodyStrong">Ton compte bénéficie déjà d’un accès TITAN+.</T>
          {BILLING_BUILD ? <Button small kind="secondary" label="Gérer dans Google Play" onPress={() => manageInPlay().catch(() => setNote("Ouvre Google Play > Paiements et abonnements."))} /> : null}
        </Card>
      ) : null}
      {live && !profile?.is_elite
        ? offers!.map((o) => (
            <Card key={o.id} style={{ gap: 6 }}>
              <T variant="h3">{o.name}</T>
              <T variant="bodyStrong">{o.price}</T>
              {o.perks.map((p) => (
                <T key={p} variant="small">• {p}</T>
              ))}
              <Button label={busy === o.id ? "Ouverture de Google Play…" : "S’abonner"} loading={busy === o.id} disabled={!!busy} onPress={() => subscribe(o)} testID={`subscribe-${o.id}`} />
            </Card>
          ))
        : null}
      {BILLING_BUILD && offers !== null ? <Button kind="ghost" label="Restaurer mes achats" loading={busy === "restore"} disabled={!!busy} onPress={restoreAll} testID="restore-purchases" /> : null}
      {note ? <T variant="small" tone="muted" accessibilityRole="alert">{note}</T> : null}
      <Card style={{ gap: 6 }}>
        <T variant="bodyStrong">Ce qui reste gratuit, pour toujours</T>
        <T variant="small">• Toutes les statistiques sportives de base, le journal et les records.</T>
        <T variant="small">• La progression, l’aventure et ses gardiens : battables sans payer.</T>
        <T variant="small">• Les crédits gagnés par l’effort et l’Atelier.</T>
        <T variant="small">{ADS_BUILD ? "• Peu de publicités, jamais pendant l’effort ; aucune avec TITAN+ ou une offre Coach." : "• Aucune publicité."}</T>
      </Card>
      {live ? <T variant="caption" tone="faint">Abonnement mensuel renouvelé automatiquement, résiliable à tout moment dans Google Play. Les cosmétiques ne s’achètent jamais avec de l’argent.</T> : null}
    </Screen>
  );
}
