import { Group } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { ToggleRow } from "../../components/Toggle";
import { useToast } from "../../components/Toast";
import { useProfile, useSavePrefs } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";

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
      <T variant="caption" tone="faint">
        L’application Android ne collecte aucune statistique d’usage, aucune publicité et aucun identifiant publicitaire.
      </T>
    </Screen>
  );
}
