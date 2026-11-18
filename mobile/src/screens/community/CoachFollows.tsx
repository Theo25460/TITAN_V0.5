import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { T } from "../../components/Text";
import { Sports } from "../../core";
import { ownerRpc } from "../../data/api";
import { space } from "../../theme/tokens";

type Link = {
  id: string; athlete_id: string; athlete_name: string; coach_id: string; coach_name: string;
  paused: boolean; sport?: string;
};

/** Read a fresh portal snapshot when the sheet opens. Revocable relationships never enter persistent storage. */
export function CoachFollows({ owner, online }: { owner: string; online: boolean }) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLinks(null);
    setFailed(false);
    if (online && !owner.startsWith("guest_")) {
      void ownerRpc<{ owner: string; links: Link[] }>(owner, "titan_coach_portal", { p_action: "snapshot", p_data: {} }, () => active)
        .then((snapshot) => {
          if (snapshot.owner !== owner) throw new Error("AUTH_REQUIRED");
          const own = snapshot.links.filter((link) => link.coach_id === owner || link.athlete_id === owner);
          if (active) setLinks(own);
        })
        .catch(() => { if (active) setFailed(true); });
    }
    return () => { active = false; };
  }, [owner, online, attempt]);

  if (owner.startsWith("guest_")) return <T>Connecte ton compte pour consulter tes suivis.</T>;
  if (!online) return <T>Reconnecte-toi pour vérifier les partages actifs.</T>;
  if (failed) return <View style={{ gap: space.s3 }}><T>Les suivis sont indisponibles pour le moment.</T><Button label="Réessayer" onPress={() => setAttempt((v) => v + 1)} /></View>;
  if (!links) return <T accessibilityLiveRegion="polite">Vérification des suivis…</T>;
  if (!links.length) return <T>Aucun suivi partagé sur ce compte.</T>;
  return <>{links.map((link) => {
    const coaching = owner === link.coach_id;
    return <View key={link.id} style={{ gap: space.s1 }}>
      <T variant="eyebrow">{coaching ? "Sportif accompagné" : "Mon coach"}</T>
      <T variant="title">{(coaching ? link.athlete_name : link.coach_name) || "Compte TITAN"}</T>
      <T variant="small">{link.paused ? "Suivi en pause" : "Partage actif"} · {link.sport ? Sports.label(link.sport) : "Tous les sports partagés"}</T>
    </View>;
  })}</>;
}
