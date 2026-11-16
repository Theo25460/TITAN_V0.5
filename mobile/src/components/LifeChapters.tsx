/* AUD-48: « Mes chapitres » — named periods of one's sporting life, each told in figures (days, effort, sessions). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Format } from "../core";
import * as api from "../data/api";
import { useOwner } from "../data/auth";
import { errorMessage } from "../lib/errors";
import { useOnline } from "../lib/network";
import { space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Field } from "./Field";
import { T } from "./Text";
import { useToast } from "./Toast";

const d = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export function LifeChapters() {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [title, setTitle] = useState("");
  const q = useQuery({ queryKey: ["chapters", owner], queryFn: () => api.fetchChapters(owner).catch(() => null), staleTime: 5 * 60_000 });
  const act = useMutation({
    mutationFn: async ({ fn }: { fn: () => Promise<unknown>; ok: string }) => {
      if (!online) throw new Error("Connexion requise.");
      return fn();
    },
    onSuccess: (_r, v) => {
      toast({ kind: "ok", title: v.ok });
      setTitle("");
      qc.invalidateQueries({ queryKey: ["chapters", owner] });
    },
    onError: (e) => toast({ kind: "err", title: "Action impossible", message: errorMessage(e) }),
  });
  if (q.data === null) return null;
  const list = q.data ?? [];
  return (
    <Card style={{ gap: space.s3 }} testID="life-chapters">
      <T variant="eyebrow" tone="accent">Mes chapitres</T>
      <T variant="small" tone="muted">Donne un nom aux périodes de ta vie sportive : TITAN raconte chacune en chiffres.</T>
      {list.map((c) => (
        <View key={c.id} style={{ gap: 2 }} testID={`chapter-${c.id}`}>
          <T variant="bodyStrong">{c.title}</T>
          <T variant="caption" tone="muted">
            {d(c.startsOn)} → {c.open ? "aujourd’hui" : d(c.endsOn!)} · {c.days} jour{c.days > 1 ? "s" : ""} actif{c.days > 1 ? "s" : ""} · {Format.duration(c.minutes)} · {c.sessions} séance{c.sessions > 1 ? "s" : ""}
          </T>
          {c.open ? <Button small kind="ghost" label="Clore ce chapitre" onPress={() => act.mutate({ fn: () => api.chapterClose(owner, c.id), ok: "Chapitre clos" })} /> : null}
        </View>
      ))}
      <Field label="Nouveau chapitre" value={title} onChangeText={setTitle} maxLength={60} placeholder="Prépa marathon, reprise, saison de club…" testID="chapter-title" />
      <Button small kind="secondary" label="Commencer ce chapitre aujourd’hui" disabled={title.trim().length < 2 || !online} loading={act.isPending} onPress={() => act.mutate({ fn: () => api.chapterStart(owner, title.trim()), ok: "Nouveau chapitre ouvert" })} testID="chapter-start" />
    </Card>
  );
}
