/* After a live session is saved: waits for the server to confirm it, then settles its journal and shows what the world
   received. Offline or held sessions stay in the outbox and settle later (flushSettlements on the next app start). */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { LiveVoies, LiveWorld } from "../core/live";
import type { TrainingPayload } from "../core/types";
import { flushSettlements, queueSettlement, settleLive, type LiveSettlement } from "../data/live";
import { colors, radius, space } from "../theme/tokens";
import { T } from "./Text";

export function LiveSettleCard({ owner, eventId, payload, confirmed }: { owner: string; eventId: string; payload?: TrainingPayload; confirmed: boolean }) {
  const journal = (payload?.details as { live?: { voie: string } } | undefined)?.live;
  const [result, setResult] = useState<LiveSettlement | null>(null);
  useEffect(() => {
    if (!journal) return;
    void queueSettlement(owner, eventId);
  }, [journal, owner, eventId]);
  useEffect(() => {
    if (!journal || !confirmed) return;
    let alive = true;
    void settleLive(owner, eventId).then((r) => { if (alive) setResult(r); void flushSettlements(owner); });
    return () => { alive = false; };
  }, [journal, confirmed, owner, eventId]);
  if (!journal) return null;
  const voie = LiveVoies.VOIES[journal.voie];
  const body = !confirmed ? "Le monde réagira dès que la séance sera confirmée par le serveur."
    : !result ? "Le monde prend note de ta séance…"
    : result.status === "held" ? "Séance en vérification : le monde réagira dès qu’elle sera validée."
    : result.status !== "settled" ? "Cette séance n’alimente pas le monde (séance ancienne, vérifiée ou hors délai)."
    : null;
  return (
    <View style={{ padding: space.s4, borderRadius: radius.r3, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.cyLine, gap: space.s2 }} accessibilityLiveRegion="polite">
      <T variant="eyebrow" tone="accent">{voie?.name ?? "TITAN LIVE"}</T>
      {body ? <T tone="muted">{body}</T> : (
        <>
          <T variant="h3">+{result!.essenceAmount} {LiveVoies.ESSENCES[result!.essence ?? ""]?.label ?? ""} · +{result!.eclats} éclats</T>
          {result!.missions?.length ? <T variant="small" tone="muted">{result!.missions.length} mission{result!.missions.length > 1 ? "s" : ""} vérifiée{result!.missions.length > 1 ? "s" : ""} par le serveur.</T> : null}
          {result!.missionsIgnored ? <T variant="small" tone="muted">Le journal ne correspondait pas à la séance enregistrée : seules les ressources d’effort comptent.</T> : null}
          {result!.find ? <T variant="small" tone={result!.findNew ? "amber" : "muted"}>Trouvaille : {result!.findName ?? LiveWorld.FINDS[result!.find.split(":")[0]]?.[Number(result!.find.split(":")[1])]?.[0]}{result!.findNew ? " (nouvelle)" : " (déjà dans ta collection)"}</T> : null}
        </>
      )}
    </View>
  );
}
