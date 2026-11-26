/* V1.6.3 — « Modifications » block of the session sheet: what corrections, archives and restores changed, read from the server
   (titan_session_changes_v1, owner only), in the same words as the website journal (src/core/web/history-ledger.js changeText).
   Without the server function (bundle v22 not applied) nothing is shown. */
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { Ledger, type SessionChangeEntry } from "../core";
import type { TrainingLog } from "../core/types";
import * as api from "../data/api";
import { useOwner } from "../data/auth";
import { useOnline } from "../lib/network";
import { space } from "../theme/tokens";
import { Card } from "./Card";
import { T } from "./Text";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function ChangesCard({ log }: { log: TrainingLog }) {
  const owner = useOwner();
  const online = useOnline();
  const enabled = !!owner && log.syncStatus === "confirmed" && UUID.test(String(log.id)) && Number(log.revision) > 1;
  const q = useQuery({
    queryKey: ["session-changes", owner, log.id, log.revision],
    queryFn: () => api.sessionChanges(owner, log.id),
    enabled: enabled && online,
    staleTime: 60_000,
    retry: false,
  });
  const entries: SessionChangeEntry[] = Array.isArray(q.data) ? q.data : [];
  if (!enabled || !entries.length) return null;
  return (
    <Card tone="flat" style={{ gap: space.s2 }} testID="changes-card" accessibilityLabel="Modifications de la séance">
      <T variant="eyebrow" tone="faint">
        Modifications
      </T>
      <View style={{ gap: 4 }}>
        {entries.map((e) => (
          <T key={`${e.revision}-${e.at}`} variant="small" testID="changes-entry">
            {when(e.at)} · {(e.changes || []).map(Ledger.changeText).join(" · ")}
          </T>
        ))}
      </View>
      <T variant="caption" tone="faint">
        Référence {Ledger.reference(log)}, la même sur tes autres appareils. Les récompenses restent celles de la séance initiale.
      </T>
    </Card>
  );
}
