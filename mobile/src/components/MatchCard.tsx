/* V1.6.2 — « Sources » block of the session sheet: which imports the server linked to this session (or split from it), what each
   source says, the fields that differ, the rule applied, the decisions made, and the athlete's reversible choice. Same words and
   rules as the website journal (src/core/web/session-match.js); the server decides (titan_resolve_session_match_v1). */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Ledger, SessionMatch, type MatchDecision, type MatchView, type SessionMatchRow } from "../core";
import type { TrainingLog } from "../core/types";
import * as api from "../data/api";
import { useOwner } from "../data/auth";
import { keys } from "../data/hooks";
import { useOnline } from "../lib/network";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Alert } from "./Dialog";
import { T } from "./Text";
import { useToast } from "./Toast";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CONFIRM: Record<MatchDecision, { title: string; text: string; ok: string }> = {
  same: { title: "Garder une seule séance ?", text: "L’import reste rattaché à ta séance : il ne compte qu’une fois. Tes valeurs et ta note sont conservées.", ok: "Une seule séance" },
  distinct: { title: "Séparer en deux séances ?", text: "L’activité importée devient une séance à part, comptée avec les règles habituelles (récompenses et records). Ta séance n’est pas modifiée.", ok: "Deux séances" },
};
const ERRORS: Record<string, string> = {
  MATCH_SOURCE_UNKNOWN: "Ce rapprochement date d’avant le détail des sources. Relance l’import depuis la source pour pouvoir le séparer.",
  MATCH_SESSION_GONE: "Ta séance d’origine est archivée : restaure-la d’abord pour y rattacher cet import.",
  MATCH_UNKNOWN: "Ce rapprochement n’existe plus dans ton compte.",
  RATE_LIMITED: "Trop de décisions en peu de temps. Réessaie dans une heure.",
};

export const matchKey = (owner: string, id: string) => ["session-matches", owner, id] as const;

export function MatchCard({ log, logs }: { log: TrainingLog; logs: TrainingLog[] }) {
  const owner = useOwner();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const enabled = !!owner && log.syncStatus === "confirmed" && UUID.test(String(log.id));
  const q = useQuery({ queryKey: matchKey(owner, log.id), queryFn: () => api.sessionMatches(owner, log.id), enabled: enabled && online, staleTime: 60_000 });
  const rows: SessionMatchRow[] = Array.isArray(q.data) ? q.data : [];
  if (!enabled || !rows.length) return null;

  function decide(row: SessionMatchRow, decision: MatchDecision) {
    const c = CONFIRM[decision];
    Alert.alert(c.title, `${c.text}\nTu peux revenir sur ce choix depuis cette fiche. Un nouvel import de la même activité garde ta décision.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: c.ok,
        onPress: async () => {
          setBusy(true);
          try {
            await api.resolveSessionMatch(owner, row.source, row.external_id, decision);
            await Promise.all([qc.invalidateQueries({ queryKey: keys.logs(owner) }), qc.invalidateQueries({ queryKey: ["session-matches", owner] })]);
            toast({ kind: "ok", title: decision === "same" ? "Une seule séance" : "Deux séances distinctes", message: "Ta décision est enregistrée dans ton compte." });
          } catch (e) {
            toast({ kind: "warn", title: "Décision non enregistrée", message: ERRORS[String((e as Error)?.message || "").trim()] || "Réessaie dans un instant." });
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={{ gap: space.s3 }}>
      {rows.map((row) => (
        <MatchView key={`${row.source}:${row.external_id}`} view={SessionMatch.describe(row, log, logs)} limit={Ledger.sourceLimit(row.source)} busy={busy} online={online} onDecide={(d) => decide(row, d)} />
      ))}
    </View>
  );
}

function MatchView({ view, limit, busy, online, onDecide }: { view: MatchView; limit: string | null; busy: boolean; online: boolean; onDecide: (d: MatchDecision) => void }) {
  const diverging = new Set(view.divergences.map((d) => d.field));
  const line = (label: string, field: string, pick: (s: MatchView["sources"][number]) => string) => (
    <View key={field} style={{ flexDirection: "row", gap: space.s2 }} testID={`match-row-${field}`}>
      <T variant="caption" tone="muted" style={{ flex: 1 }}>
        {label}
        {diverging.has(field) ? " · diffère" : ""}
      </T>
      {view.sources.map((s) => (
        <T key={s.role} variant={diverging.has(field) ? "bodyStrong" : "caption"} style={{ flex: 1.2 }}>
          {pick(s)}
        </T>
      ))}
    </View>
  );
  return (
    <Card tone="flat" style={{ gap: space.s2 }} testID="match-card" accessibilityLabel={`Sources : ${view.title}`}>
      <T variant="eyebrow" tone="faint">
        Sources
      </T>
      <T variant="bodyStrong" tone={view.tone === "warn" ? "warn" : "default"} testID="match-title">
        {view.title}
      </T>
      <T variant="small">{view.text}</T>
      {view.sources.length > 1 ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", gap: space.s2 }}>
            <T variant="caption" tone="faint" style={{ flex: 1 }}>
              {" "}
            </T>
            {view.sources.map((s) => (
              <View key={s.role} style={{ flex: 1.2 }}>
                <T variant="caption" tone="default">
                  {s.label}
                </T>
                <T variant="caption" tone="faint">
                  {s.saved}
                </T>
              </View>
            ))}
          </View>
          {line("Début", "start", (s) => s.at)}
          {line("Durée", "duration", (s) => s.duration)}
          {line("Distance", "distance", (s) => s.distance)}
        </View>
      ) : null}
      {view.reasons.map((r) => (
        <T key={r} variant="caption" tone="warn">
          {r}
        </T>
      ))}
      {view.rows.filter((r) => r.shownOnly).map((r) => (
        <T key={r.field} variant="caption" tone="faint">
          {r.label} affichée depuis {view.sources[1]?.label || "la source"}, hors totaux.
        </T>
      ))}
      {view.sources.length > 1 ? (
        <T variant="caption" tone="faint">
          Règle : {view.rule}
          {view.overlap ? ` Recouvrement : ${view.overlap} % de l’effort le plus court.` : ""}
        </T>
      ) : null}
      {view.events.map((e, i) => (
        <T key={`${e.at}-${i}`} variant="caption" tone="muted">
          {e.at} : {e.text} par {e.by}
        </T>
      ))}
      {/* V1.6.3: a source whose later edits never come back says so; the athlete corrects the session here. */}
      {limit ? (
        <T variant="caption" tone="muted" testID="match-source-limit">
          {limit}
        </T>
      ) : null}
      {view.actions.length ? (
        <View style={{ gap: space.s2 }}>
          {view.actions.map((a, i) => (
            <Button key={a.id} small kind={i === 0 && view.state === "review" ? "primary" : "secondary"} label={a.label} disabled={!online || busy} loading={busy} onPress={() => onDecide(a.id)} testID={`match-${a.id}`} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
