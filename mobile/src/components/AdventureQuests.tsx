/* V1.5.4 — Quêtes entre les mondes. The notebook of clues (each clue with its origin, state and destination) and the chains
   between worlds, same view model as the website (core/web/adventure-quests.js). The World screen opens it from its map in one
   tap. The manner selected before its confirmation stays on the phone; everything else is read from the server. */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useQuestAction, useQuests, type QuestAction } from "../data/adventureQuests";
import { onReconnect, useOnline } from "../lib/network";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { T } from "./Text";

type Mark = { id: string; name: string; text: string; label: string; last: boolean };
type Manner = { id: string; name: string; label: string; reveals: string; chosen: boolean; closed: boolean; selected: boolean };
export type ChainView = {
  id: string; state: string; title: string; text?: string; intro?: string; eyebrow?: string; stateLabel?: string; anchor?: string; rules?: string;
  opens?: { id: string; name: string; how: string; origin: string; held: boolean }[]; opensTitle?: string;
  clue?: { id: string; name: string; text: string } | null; found?: string; attemptsText?: string;
  feedback?: { correct: boolean; attempts: number; text: string } | null;
  scene?: { name: string; story: string }; manners?: Manner[]; manner?: string; chosen?: string; closed?: string[]; readyText?: string;
  encounter?: { title: string; name: string; teaser: string; story: string; progress: string; waiting: string; pending: string; ready: boolean };
  outcome?: { id: string; eyebrow: string; name: string; text: string; decision: string };
  action?: { kind: string; label?: string; note?: string; title?: string; ready?: boolean; marks?: Mark[];
    select?: { id: string; label: string }[]; confirm?: { id: string; title: string; body: string; label: string; back: string } | null } | null;
};
type ClueView = { id: string; chain: string; state: string; stateLabel: string; name: string; text: string; origin: string; destination: string; destinationWorld: string; go: string };
export const quests = require("../core/web/adventure-quests.js") as {
  notebook: (payload: unknown, locale?: string, selected?: Record<string, string>) => { title: string; intro: string; empty: string; count: string; clues: ClueView[]; chains: ChainView[]; rules: string; privacy: string };
  mapEntries: (payload: unknown, world: string) => { label: string; count: string; clues: number; open: number; here: { id: string; state: string; direction: string; label: string; stateLabel: string }[] };
  conflict: (requested: string | null, item: unknown) => string; errorText: (code?: string) => string;
};

/** The access from the map of a world: one tap opens the notebook. Nothing without the V1.5.4 server or for a guest. */
export function QuestMapButton({ owner, world, onOpen }: { owner: string; world: string; onOpen: () => void }) {
  const q = useQuests(owner);
  const data = q.data?.owner === owner ? q.data : null;
  if (!data?.chains.length) return null;
  const m = quests.mapEntries(data, world);
  const label = [m.label, m.count, ...m.here.map((x) => `${x.label} (${x.stateLabel})`)].join(". ");
  return <Button kind="secondary" small icon="journal" label={`${m.label} · ${m.count}`} accessibilityHint={label} onPress={onOpen} testID="quest-map" />;
}

function Chain({ v, busy, send, select }: { v: ChainView; busy: boolean; send: (chain: string, action: QuestAction, answer?: string[] | null, manner?: string | null) => void; select: (chain: string, manner: string | null) => void }) {
  if (v.state === "unknown") return <View testID={`quest-${v.id}`}><T variant="bodyStrong">{v.title}</T><T>{v.text}</T></View>;
  const a = v.action, fb = v.feedback, e = v.encounter;
  const box = { padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderStyle: "dashed" as const, borderColor: colors.bg3, gap: 2 };
  return (
    <View testID={`quest-${v.id}`} accessibilityLabel={`${v.title}, ${v.stateLabel}`} style={{ gap: space.s2, paddingTop: space.s3, borderTopWidth: 1, borderTopColor: colors.bg2 }}>
      <T variant="caption" tone="muted">{`${v.eyebrow} · ${v.stateLabel}`}</T>
      <T variant="h3" accessibilityRole="header">{v.title}</T>
      <T tone="muted">{v.intro}</T>
      {v.state === "locked" ? <View style={{ gap: space.s2 }} testID={`quest-${v.id}-opens`}>
        <T variant="bodyStrong">{v.opensTitle}</T>
        {v.opens?.map((o) => <T key={o.id} variant="small">{`• ${o.name} · ${o.how} (${o.origin})`}</T>)}
      </View> : <View style={box}><T variant="caption" tone="muted">{v.found}</T><T variant="small">{v.clue?.text}</T></View>}
      {fb ? <View testID={`quest-${v.id}-feedback-${fb.correct ? "right" : "wrong"}`} style={{ borderLeftWidth: 3, borderLeftColor: fb.correct ? colors.cy : colors.am, paddingLeft: space.s3 }}>
        <T accessibilityLiveRegion="polite">{fb.text}</T>
      </View> : null}
      {a?.kind === "start" ? <View style={{ gap: space.s2 }}>
        <Button label={a.label ?? ""} onPress={() => send(v.id, "start")} disabled={busy} testID={`quest-${v.id}-start`} />
        <T variant="small" tone="muted">{a.note}</T>
      </View> : null}
      {a?.kind === "link" ? <View style={{ gap: space.s2 }}>
        <T variant="bodyStrong">{a.title}</T>
        {v.attemptsText ? <T variant="small">{v.attemptsText}</T> : null}
        {a.marks?.map((m) => (
          <View key={m.id} style={{ padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: m.last ? colors.am : colors.bg2, gap: space.s2 }}>
            <T variant="small"><T variant="small" style={{ fontWeight: "700" }}>{m.name}</T>{` · ${m.text}`}</T>
            <Button small kind="secondary" label={m.label} disabled={busy} onPress={() => send(v.id, "link", [m.id])} testID={`quest-${v.id}-mark-${m.id}`} />
          </View>
        ))}
        <T variant="small" tone="muted">{a.note}</T>
      </View> : null}
      {v.scene ? <View style={box} testID={`quest-${v.id}-scene`}><T variant="bodyStrong">{v.scene.name}</T><T variant="small">{v.scene.story}</T></View> : null}
      {a?.kind === "choose" ? <View style={{ gap: space.s2 }}>
        <T variant="bodyStrong">{a.title}</T>
        {v.manners?.map((m, i) => (
          <View key={m.id} style={{ padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: m.selected ? colors.cy : colors.bg2, gap: space.s2 }}>
            <T variant="bodyStrong">{m.label}</T><T variant="small">{m.reveals}</T>
            {a.confirm ? null : <Button small kind="secondary" label={a.select?.[i]?.label ?? m.label} onPress={() => select(v.id, m.id)} testID={`quest-${v.id}-select-${m.id}`} />}
          </View>
        ))}
        {a.confirm ? <View style={{ padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.cy, gap: space.s2 }} testID={`quest-${v.id}-confirm`}>
          <T variant="bodyStrong">{a.confirm.title}</T><T variant="small">{a.confirm.body}</T>
          <Button label={a.confirm.label} onPress={() => send(v.id, "choose", null, a.confirm!.id)} loading={busy} testID={`quest-${v.id}-choose`} />
          <Button kind="ghost" small label={a.confirm.back} onPress={() => select(v.id, null)} testID={`quest-${v.id}-back`} />
        </View> : null}
      </View> : null}
      {e ? <View style={{ gap: space.s2 }} testID={`quest-${v.id}-encounter`}>
        <T variant="bodyStrong" testID={`quest-${v.id}-chosen`}>{v.chosen}</T>
        {v.closed?.map((c) => <T key={c} variant="small" tone="muted">{c}</T>)}
        <T variant="caption" tone="muted">{e.title}</T>
        <T variant="bodyStrong">{e.name}</T>
        <T>{e.ready ? e.story : e.teaser}</T>
        {v.state !== "resolved" ? <>
          <T variant="small" testID={`quest-${v.id}-progress`}>{`${e.progress}${v.readyText ? ` · ${v.readyText}` : ""}`}</T>
          {v.state === "waiting" ? <T variant="small">{e.waiting}</T> : null}
          <T variant="small" tone="muted">{e.pending}</T>
          <Button label={a?.label ?? ""} disabled={!a?.ready || busy} onPress={() => send(v.id, "resolve")} testID={`quest-${v.id}-resolve`} />
        </> : null}
      </View> : null}
      {v.outcome ? <View testID={`quest-${v.id}-outcome-${v.outcome.id}`} style={{ padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.cy, gap: 2 }}>
        <T variant="caption" tone="muted">{v.outcome.eyebrow}</T><T variant="bodyStrong">{v.outcome.name}</T><T>{v.outcome.text}</T><T variant="small">{v.outcome.decision}</T>
      </View> : null}
    </View>
  );
}

/** The notebook of clues. onGo opens the World screen of a clue's destination on its notebook. */
export function AdventureQuests({ owner, onGo }: { owner: string; onGo?: (world: string) => void }) {
  const q = useQuests(owner);
  const act = useQuestAction(owner);
  const online = useOnline();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Record<string, string>>({});
  useEffect(() => { setSelected({}); setNotice({}); }, [owner]);
  // Back online (or another device moved a chain meanwhile): re-read the server, never replay an action.
  useEffect(() => { const stop = onReconnect(() => { setNotice({}); void q.refetch(); }); return () => { stop(); }; }, [q]);
  const data = q.data?.owner === owner ? q.data : null;
  if (!data?.chains.length) return null;
  const n = quests.notebook(data, "fr", selected);
  const keep = (chain: string, manner: string | null) => setSelected((x) => { const y = { ...x }; if (manner) y[chain] = manner; else delete y[chain]; return y; });
  // A tap on a manner clears the previous notice; a server answer or an error keeps its own notice.
  const select = (chain: string, manner: string | null) => { setNotice((x) => ({ ...x, [chain]: "" })); keep(chain, manner); };
  const send = (chain: string, action: QuestAction, answer: string[] | null = null, manner: string | null = null) => {
    if (!online) { setNotice((x) => ({ ...x, [chain]: quests.errorText("RPG_OFFLINE") })); keep(chain, null); return; }
    setNotice((x) => ({ ...x, [chain]: "" }));
    act.mutate({ chain, action, answer, manner }, {
      onSuccess: (d) => { keep(chain, null); if (action === "choose") setNotice((x) => ({ ...x, [chain]: quests.conflict(manner, d.chains.find((c) => c.id === chain)) })); },
      onError: (e) => { keep(chain, null); setNotice((x) => ({ ...x, [chain]: quests.errorText((e as Error)?.message) || "Le carnet est indisponible pour le moment. Tes indices sont conservés." })); },
    });
  };
  return (
    <Card testID="quests">
      <View style={{ gap: space.s3 }}>
        <T variant="h2" accessibilityRole="header">{n.title}</T>
        <T tone="muted">{n.intro}</T>
        <T variant="small" testID="quests-count">{n.count}</T>
        {n.clues.length ? n.clues.map((c) => (
          <View key={c.id} testID={`quest-clue-${c.id}`} accessibilityLabel={`${c.name}, ${c.stateLabel}`} style={{ padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.bg2, borderLeftWidth: 3, borderLeftColor: c.state === "used" ? colors.am : colors.cy, gap: 2 }}>
            <T variant="caption" tone="muted" testID={`quest-clue-${c.id}-state`}>{c.stateLabel}</T>
            <T variant="bodyStrong">{c.name}</T><T variant="small">{c.text}</T>
            <T variant="small" tone="muted">{c.origin}</T><T variant="small" tone="muted">{c.destination}</T>
            {onGo ? <Button kind="ghost" small label={c.go} onPress={() => onGo(c.destinationWorld)} testID={`quest-clue-${c.id}-go`} /> : null}
          </View>
        )) : <T variant="small" tone="muted" testID="quests-empty">{n.empty}</T>}
        {n.chains.map((v) => (
          <View key={v.id} style={{ gap: space.s2 }}>
            <Chain v={v} busy={act.isPending} send={send} select={select} />
            {notice[v.id] ? <T variant="small" tone="amber" testID={`quest-${v.id}-notice`} accessibilityLiveRegion="polite">{notice[v.id]}</T> : null}
          </View>
        ))}
        <T variant="small" tone="muted">{n.rules}</T>
        <T variant="small" tone="muted">{n.privacy}</T>
      </View>
    </Card>
  );
}
