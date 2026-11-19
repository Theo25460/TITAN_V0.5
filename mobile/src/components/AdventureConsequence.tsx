/* V1.5.2 — the access opened by the Veilleur's outcome in the Vallée (belvédère shortcut or archive annex room), same view model
   as the website (core/web/adventure-consequence.js). Reached from the Camp de base: one tap on its card, the interaction is the
   next one. The first landmark of the corniche stays on the phone until the second sends the alignment; nothing else is local. */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useConsequenceAction, useConsequences } from "../data/adventureConsequence";
import type { AdventureWorld } from "../data/adventureRpg";
import { onReconnect, useOnline } from "../lib/network";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { T } from "./Text";

type Mark = { id: string; name: string; text: string; label: string; selected: boolean; sends: boolean };
export type ConsequenceView = {
  state: "discover" | "open" | "unknown"; world: string; text?: string; outcome?: string; kind?: string; need?: number;
  camp?: { eyebrow: string; title: string; text: string; cta: string; href: string; world: string };
  title?: string; intro?: string; item?: { name: string; text: string }; marksTitle?: string; needText?: string; marks?: Mark[];
  selectedText?: string; unselect?: string; feedback?: { correct: boolean; attempts: number; text: string } | null;
  access?: { text: string; from: string; to: string; action: string; visits: number; visitsText: string; vignette: string } | null;
  rules?: string; privacy?: string;
};
export const consequences = require("../core/web/adventure-consequence.js") as {
  view: (item: unknown, locale?: string, selected?: string | null) => ConsequenceView | null;
  campEntries: (payload: unknown) => { eyebrow: string; title: string; text: string; cta: string; href: string; world: string; state: string; outcome: string }[];
  itemFor: (payload: unknown, world: string) => unknown; errorText: (code?: string) => string;
};

export function AdventureConsequence({ owner, world }: { owner: string; world: AdventureWorld }) {
  const q = useConsequences(owner);
  const act = useConsequenceAction(owner);
  const online = useOnline();
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { setSelected(null); setNotice(""); }, [owner, world]);
  // Back online (or another device discovered meanwhile): re-read the server, never replay an answer.
  useEffect(() => { const stop = onReconnect(() => { setNotice(""); void q.refetch(); }); return () => { stop(); }; }, [q]);
  const data = q.data?.owner === owner ? q.data : null;
  const item = data ? consequences.itemFor(data, world) : null;
  const v = item ? consequences.view(item, "fr", selected) : null;
  if (!v) return null;
  if (v.state === "unknown") return <Card testID="consequence"><T>{v.text}</T></Card>;
  const send = (action: "discover" | "visit", marks: string[] | null = null) => {
    if (!online) { setNotice(consequences.errorText("RPG_OFFLINE")); setSelected(null); return; }
    setNotice("");
    act.mutate({ world, action, marks }, {
      onSuccess: () => setSelected(null),
      onError: (e) => { setSelected(null); setNotice(consequences.errorText((e as Error)?.message) || "L’accès est indisponible pour le moment. Ta découverte est conservée."); },
    });
  };
  const open = v.state === "open";
  const fb = v.feedback;
  return (
    <Card testID="consequence">
      <View style={{ gap: space.s2 }}>
        <T variant="eyebrow" tone="accent">{`${v.camp?.eyebrow} · conséquence de ta victoire`}</T>
        <T variant="h2" accessibilityRole="header">{v.title}</T>
        <T>{open ? v.access?.text : v.intro}</T>
        <View style={{ padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderStyle: "dashed", borderColor: colors.bg3, gap: 2 }}>
          <T variant="caption" tone="muted">{v.item?.name}</T>
          <T variant="small">{v.item?.text}</T>
        </View>
        {fb ? <View testID={`consequence-feedback-${fb.correct ? "right" : "wrong"}`} style={{ borderLeftWidth: 3, borderLeftColor: fb.correct ? colors.cy : colors.am, paddingLeft: space.s3 }}>
          <T accessibilityLiveRegion="polite">{fb.text}</T>
        </View> : null}
        {!open ? (
          <View style={{ gap: space.s2 }}>
            <T variant="bodyStrong">{v.marksTitle}</T>
            <T variant="small" tone="muted">{v.needText}</T>
            {v.selectedText ? <T variant="small" testID="consequence-selected">{v.selectedText}</T> : null}
            {v.marks?.map((m) => (
              <View key={m.id} style={{ padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: m.selected ? colors.cy : colors.bg2, gap: space.s2 }}>
                <T variant="small"><T variant="small" style={{ fontWeight: "700" }}>{m.name}</T>{` · ${m.text}`}</T>
                {m.selected ? null : (
                  <Button small kind="secondary" label={m.label} testID={`consequence-mark-${m.id}`} disabled={act.isPending}
                    onPress={() => (m.sends ? send("discover", selected && selected !== m.id ? [selected, m.id] : [m.id]) : (setNotice(""), setSelected(m.id)))} />
                )}
              </View>
            ))}
            {v.unselect ? <Button small kind="ghost" label={v.unselect} onPress={() => setSelected(null)} testID="consequence-unselect" /> : null}
          </View>
        ) : (
          <View style={{ gap: space.s2 }} testID="consequence-access">
            <T variant="bodyStrong" accessibilityLabel={`${v.access?.from} relié à ${v.access?.to}`}>{`${v.access?.from} ⇄ ${v.access?.to}`}</T>
            <Button label={v.access?.action ?? ""} onPress={() => send("visit")} loading={act.isPending} testID="consequence-visit" />
            {v.access?.vignette ? <T testID="consequence-vignette" accessibilityLiveRegion="polite">{v.access.vignette}</T> : null}
            <T variant="small" tone="muted" testID="consequence-visits">{v.access?.visitsText}</T>
          </View>
        )}
        {notice ? <T variant="small" tone="amber" testID="consequence-notice" accessibilityLiveRegion="polite">{notice}</T> : null}
        <T variant="small" tone="muted">{v.rules}</T>
        <T variant="small" tone="muted">{v.privacy}</T>
      </View>
    </Card>
  );
}
