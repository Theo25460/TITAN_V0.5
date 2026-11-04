/* "Sources et capteurs" (V12-43): one vocabulary for every way data reaches TITAN. Three things are never confused:
   authorised (the person said yes), received (data really arrived), integrated (it is in the journal). A consent alone is never "synchronisé". */
export type SourceStatus = { label: string; tone: "ok" | "warn" | "default" | "err"; detail: string };

type Own = { supported: boolean; enabled: boolean; permission: string; live: boolean };

export function ownCounterStatus(o: Own): SourceStatus {
  if (!o.supported) return { label: "Indisponible", tone: "default", detail: "Ce téléphone n’a pas de capteur de pas." };
  if (o.enabled && o.permission !== "granted") return { label: "À réparer", tone: "warn", detail: "L’autorisation « activité physique » manque : réactive-la pour TITAN dans Android." };
  if (o.enabled) return { label: o.live ? "En direct" : "Actif", tone: "ok", detail: o.live ? "Compte tes pas pendant que TITAN est ouvert." : "Compte à l’ouverture de TITAN et rattrape les pas faits en veille." };
  return { label: "Non activé", tone: "default", detail: "Le capteur de ton téléphone, sans compte tiers." };
}

export function healthConnectStatus(connected: boolean | null, lastUpdate: string | null): SourceStatus {
  if (connected === null) return { label: "Vérification…", tone: "default", detail: "On regarde l’autorisation Android." };
  if (!connected) return { label: "Non connecté", tone: "default", detail: "Facultatif : pour les pas et séances de ta montre." };
  const when = lastUpdate ? new Date(lastUpdate).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return { label: "Connecté", tone: "ok", detail: when ? `Dernière réception de pas : ${when}.` : "Autorisé : aucun pas reçu pour l’instant." };
}

type GarminView = { enabled: boolean; linked: boolean; last_event_at?: string; authorized?: boolean; imported?: number; attached?: number; last_import_at?: string };
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

/** The label says how far the chain went; the detail says what really arrived. "Connecté" is only said for a linked account. */
export function garminStatus(g: GarminView | null | undefined, failed: boolean): SourceStatus {
  if (failed) return { label: "Indisponible", tone: "warn", detail: "Impossible de lire l’état pour le moment. Réessaie plus tard." };
  if (!g) return { label: "Vérification…", tone: "default", detail: "On lit l’état de ta liaison." };
  if (!g.linked) {
    if (g.authorized) return { label: "À terminer", tone: "warn", detail: "Tu as autorisé l’import, mais la liaison avec Garmin n’est pas terminée : reprends « Connecter Garmin »." };
    return g.enabled ? { label: "Non connecté", tone: "default", detail: "Tes activités Garmin peuvent rejoindre ton journal après ton autorisation." } : { label: "Bientôt", tone: "default", detail: "Pas encore activé pour cette version." };
  }
  const received = when(g.last_event_at);
  const integrated = Number(g.imported) || 0;
  const tail = integrated > 0 ? ` ${integrated} activité${integrated > 1 ? "s" : ""} dans ton journal.` : "";
  return { label: "Connecté", tone: "ok", detail: (received ? `Dernière activité reçue : ${received}.` : "Compte relié : aucune activité reçue pour l’instant.") + tail };
}
