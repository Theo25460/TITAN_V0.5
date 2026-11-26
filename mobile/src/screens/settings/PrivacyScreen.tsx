import { useSyncExternalStore } from "react";
import { Linking } from "react-native";
import { ADS_BUILD } from "../../ads/adIds";
import { adsManager } from "../../ads/sdk";
import { useAdsRemote } from "../../ads/useAds";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Group } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { ToggleRow } from "../../components/Toggle";
import { useToast } from "../../components/Toast";
import { useProfile, useSavePrefs } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { webUrl } from "../../lib/webHub";
import { space } from "../../theme/tokens";

type Key = "publicProfile" | "showStats" | "socialPresence" | "friendRankings";
const ITEMS: [Key, string, string][] = [
  ["publicProfile", "Profil trouvable", "Tes amis peuvent t’ajouter avec ton code ami."],
  ["showStats", "Partager mes statistiques avec mes amis", "Niveau et jours actifs de la semaine."],
  ["socialPresence", "Montrer ma dernière activité", "La date de ta dernière séance, sans détail."],
  ["friendRankings", "Apparaître dans les classements entre amis", "Uniquement entre amis, jamais public."],
];

/** Private by default: every sharing choice is explicit and reversible (same privacy object as the website). */
export function PrivacyScreen() {
  const profile = useProfile();
  const save = useSavePrefs();
  const toast = useToast();
  const online = useOnline();
  const p = profile.data;
  const ads = useSyncExternalStore(adsManager.subscribe, adsManager.get);
  const adsRemote = useAdsRemote();
  if (profile.isLoading && !p) return <Screen><LoadingCards count={1} /></Screen>;
  if (!p) return <Screen><ErrorState error={profile.error} onRetry={() => profile.refetch()} /></Screen>;
  const privacy = { publicProfile: false, showStats: false, socialPresence: false, friendRankings: false, ...(p.privacy || {}) };
  return (
    <Screen>
      <T tone="muted">TITAN est privé par défaut. Rien n’est visible des autres tant que tu ne l’as pas choisi.</T>
      <Group>
        {ITEMS.map(([key, label, hint], i) => (
          <ToggleRow
            key={key}
            testID={`privacy-${key}`}
            label={label}
            hint={hint}
            value={privacy[key] === true}
            disabled={!online || save.isPending}
            onChange={(v) => save.mutateAsync({ prefs: {}, privacy: { ...privacy, [key]: v } }).catch((e) => toast({ kind: "err", title: "Réglage non enregistré", message: errorMessage(e) }))}
            last={i === ITEMS.length - 1}
          />
        ))}
      </Group>
      {!online ? <T variant="caption" tone="warn">Hors ligne : la confidentialité se règle avec une connexion.</T> : null}
      {/* Coaching lives on the website: the app still says, in one place, what a coach can see and where to change or stop it.
          A block of text and a button is a panel (padding, gaps); « Group » is for rows that bring their own padding. */}
      <Card style={{ gap: space.s3 }}>
        <T variant="bodyStrong">Suivi par un coach</T>
        <T variant="small" tone="muted">
          Un coach ne voit que ce que tu acceptes de partager : tu choisis la période, les sports et les détails. Il te propose des séances et ne modifie jamais ton journal. Tu peux modifier ou arrêter ce partage à tout moment.
        </T>
        <T variant="small" tone="muted">Sans invitation acceptée de ta part, aucun coach ne voit rien.</T>
        <Button small kind="secondary" icon="globe" label="Voir ou arrêter mon partage sur le site" testID="privacy-coaching" onPress={() => Linking.openURL(webUrl("/coaching")).catch(() => {})} />
      </Card>
      <T variant="caption" tone="faint">
        {ADS_BUILD ? "TITAN ne collecte aucune statistique d’usage. Les publicités (gratuit seulement) passent par Google AdMob, une fois ton choix fait dans le formulaire de Google. Google peut alors utiliser l’identifiant publicitaire de ton téléphone (tu peux le réinitialiser ou le supprimer dans les réglages Android) ; TITAN lui-même ne le lit pas." : "L’application Android ne collecte aucune statistique d’usage et n’affiche aucune publicité dans cette version."}
      </T>
      {adsRemote.banners && !p.is_elite ? (
        <Card style={{ gap: space.s3 }}>
          <T variant="bodyStrong">Publicité</T>
          <T variant="small" tone="muted">
            L’application gratuite affiche des publicités, jamais pendant une séance. Tu peux revoir ton choix dans le formulaire de Google à tout moment. TITAN+, Coach et Coach Ultra n’en affichent aucune.
          </T>
          <Button
            small
            kind="secondary"
            label="Gérer mes choix publicitaires"
            testID="ads-privacy-options"
            onPress={async () => {
              await adsManager.start();
              await adsManager.openPrivacyOptions();
            }}
          />
          {ads.phase === "denied" ? <T variant="caption" tone="faint">Aucune publicité demandée : le formulaire de Google ne l’autorise pas.</T> : null}
        </Card>
      ) : null}
    </Screen>
  );
}
