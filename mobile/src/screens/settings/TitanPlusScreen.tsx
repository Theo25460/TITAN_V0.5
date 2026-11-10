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
import { BILLING_BUILD, buy, FREE_PLAN, loadOffers, manageInPlay, messageFor, PLANS, restore, type Offer } from "../../lib/playBilling";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/tokens";

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
  const actionRunning = useRef(false);
  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: keys.profile(owner) }), [qc, owner]);
  const accessToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return alive.current && session?.user.id === owner ? session.access_token : null;
  };

  useEffect(() => {
    if (!BILLING_BUILD) return;
    loadOffers()
      .then((o) => alive.current && setOffers(o))
      .catch(() => alive.current && (setOffers([]), setNote("Google Play n’est pas joignable pour le moment.")));
  }, []);

  function start(action: string) {
    if (actionRunning.current) return false;
    actionRunning.current = true;
    setBusy(action);
    setNote(null);
    return true;
  }

  function stop() {
    actionRunning.current = false;
    if (alive.current) setBusy(null);
  }

  async function subscribe(o: Offer) {
    if (!start(o.id)) return;
    try {
      const r = await buy(o, owner, accessToken);
      if (!alive.current) return;
      if (r.kind === "active" && r.verdict.active) {
        setNote(r.verdict.access_kind === "test"
          ? "Accès de test actif. Cet achat de test ne prouve aucun paiement commercial."
          : r.verdict.acknowledged ? "Ton accès TITAN+ est actif. Un achat vérifié peut comporter un essai gratuit. Consulte ton reçu Google Play." : "Accès actif. Google Play attend encore une confirmation. Ouvre « Restaurer mes achats » dans un instant.");
        refresh();
      } else if (r.kind === "active") {
        setNote("Aucun accès actif n’a été confirmé. Consulte tes abonnements Google Play ou utilise « Restaurer mes achats ».");
        refresh();
      } else if (r.kind === "pending") setNote("Paiement en attente chez Google Play. Une fois confirmé, utilise « Restaurer mes achats ».");
      else if (r.kind === "error") setNote(messageFor(r.error));
    } catch (e) {
      if (alive.current) setNote(messageFor(e));
    } finally { stop(); }
  }

  async function restoreAll() {
    if (!start("restore")) return;
    try {
      const r = await restore(accessToken);
      if (!alive.current) return;
      setNote(r.active ? "Achats restaurés." : r.checked ? "Aucun abonnement actif n’a pu être rattaché à ce compte." : "Google Play ne signale aucun abonnement.");
      refresh();
    } catch (e) {
      if (alive.current) setNote(messageFor(e));
    } finally { stop(); }
  }

  const live = BILLING_BUILD && offers !== null && offers.length > 0;
  const offerOf = (id: string) => offers?.find((o) => o.id === id);
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
          <T variant="small" tone="muted">Un accès offert, de test ou inclus par un coach ne prouve pas un abonnement payé. Pour un achat existant, consulte le prestataire indiqué sur ton reçu.</T>
          {BILLING_BUILD ? <Button small kind="secondary" label="Ouvrir mes abonnements Google Play" onPress={() => manageInPlay().catch(() => setNote("Ouvre Google Play > Paiements et abonnements."))} /> : null}
        </Card>
      ) : null}
      <Card style={{ gap: 6 }} testID="plan-free">
        <T variant="h3">{FREE_PLAN.name}</T>
        <T variant="caption" tone="faint">{FREE_PLAN.tagline}</T>
        {FREE_PLAN.perks.filter((p) => ADS_BUILD || !/Publicités/.test(p)).map((p) => (
          <T key={p} variant="small">• {p}</T>
        ))}
      </Card>
      {PLANS.map((plan) => {
        const o = offerOf(plan.id);
        return (
          <Card key={plan.id} tone={plan.kind === "coach" ? "amber" : "accent"} style={{ gap: 6 }} testID={`plan-${plan.plan}`}>
            <T variant="h3">{plan.name}</T>
            <T variant="caption" tone="faint">{plan.tagline}</T>
            <T variant="bodyStrong">{o ? o.price : live ? "Pas encore proposé" : "Bientôt disponible"}</T>
            {plan.perks.map((p) => (
              <T key={p} variant="small">• {p}</T>
            ))}
            {o && !profile?.is_elite ? <Button label={busy === o.id ? "Achat en cours…" : "S’abonner"} loading={busy === o.id} disabled={!!busy} onPress={() => subscribe(o)} testID={`subscribe-${plan.plan}`} /> : null}
          </Card>
        );
      })}
      {BILLING_BUILD ? <Button kind="ghost" label="Restaurer mes achats" loading={busy === "restore"} disabled={!!busy} onPress={restoreAll} testID="restore-purchases" /> : null}
      {note ? <T variant="small" tone="muted" accessibilityRole="alert">{note}</T> : null}
      {live ? <T variant="caption" tone="faint">Avant confirmation, Google Play indique le prix, la période facturée et les conditions de renouvellement. Un renouvellement automatique peut être arrêté dans tes abonnements Google Play. Les cosmétiques ne s’achètent jamais avec de l’argent.</T> : null}
    </Screen>
  );
}
