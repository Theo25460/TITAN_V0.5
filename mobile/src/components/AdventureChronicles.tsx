/* V1.5.5 — Chroniques et aventures rejouables. The chronicle of a world's first arc (every run, oldest first: decisions, clues,
   outcomes, written with the texts of the run's arc version), the scenes discovered on each route, the outcome active in the
   world, and the next step of the single active run. Same view model as the website (core/web/adventure-chronicles.js). The
   route or the answer selected before its confirmation stays on the phone; everything else is read from the server. */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useChronicleAction, useChronicles, type ChronicleAction, type ChronicleParams } from "../data/adventureChronicles";
import { onReconnect, useOnline } from "../lib/network";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { T } from "./Text";

/* eslint-disable @typescript-eslint/no-require-imports */
const modules = {
  rpg: require("../core/web/adventure-rpg.js"), branches: require("../core/web/adventure-branches.js"),
  guardian: require("../core/web/adventure-guardian.js"), campaigns: require("../core/web/adventure-campaigns.js"),
  consequence: require("../core/web/adventure-consequence.js"), quests: require("../core/web/adventure-quests.js"),
};
/* eslint-enable @typescript-eslint/no-require-imports */
type Entry = { kind: string; at: string; date: string; title: string; text: string };
type Token = { id: string; name: string; last: boolean; selected: boolean };
type Action = {
  kind: "choose" | "advance" | "solve" | "resolve"; title: string; step?: string; name?: string; teaser?: string; text?: string; ready?: boolean;
  progress?: string; readyText?: string; label?: string; pending?: string; attempts?: string; submit?: string; free?: string; incomplete?: string;
  feedback?: { correct: boolean; text: string } | null;
  routes?: { id: string; name: string; label: string; reveals: string; tag: string; selected: boolean; select: string }[];
  confirm?: { id: string; title: string; body: string; label: string; back: string } | null;
  slots?: { id: string; label: string; tokens: Token[] }[];
};
type RunView = { run: number; kind: string; active: boolean; unknown: boolean; route: string | null; heading: string; label: string; version: string;
  state: string; stateLabel: string; entries: Entry[]; empty: string; unknownText: string; read: string; hide: string; action: Action | null;
  abandon: { label: string; title: string; body: string; confirm: string; back: string } | null };
type View_ = { state: "empty" | "ready"; title: string; intro: string; empty?: string; eyebrow?: string; arcTitle?: string; active?: string;
  discoveredTitle?: string; discovered?: { route: string; text: string; scene: boolean; outcome: boolean }[]; runs?: RunView[];
  start?: { label: string; note: string } | null; locked?: string; refresh?: string; rules?: string; privacy?: string };
export const chronicles = require("../core/web/adventure-chronicles.js") as { // eslint-disable-line @typescript-eslint/no-require-imports
  view: (payload: unknown, world: string, locale?: string, modules?: unknown, selection?: { route?: string; answer?: string[] }) => View_;
  conflict: (requested: string | null, payload: unknown, world: string) => string; errorText: (code?: string) => string;
};
const box = { padding: space.s3, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.bg2, gap: space.s2 };

function Run({ r, open, toggle, children }: { r: RunView; open: boolean; toggle: () => void; children?: React.ReactNode }) {
  return (
    <View testID={`chronicle-run-${r.run}`} style={[box, r.active ? { borderLeftWidth: 3, borderLeftColor: colors.cy } : null]}>
      <Button kind="ghost" small label={`${r.heading} · ${r.label}${r.version ? ` · ${r.version}` : ""} · ${r.stateLabel}`}
        accessibilityHint={open ? r.hide : r.read} onPress={toggle} testID={`chronicle-run-${r.run}-toggle`} />
      {open ? <View style={{ gap: space.s2 }} testID={`chronicle-run-${r.run}-entries`}>
        {r.unknown ? <T variant="small">{r.unknownText}</T> : null}
        {r.entries.length ? r.entries.map((e, i) => (
          <View key={`${e.kind}-${i}`} style={{ borderLeftWidth: 2, borderLeftColor: colors.bg3, paddingLeft: space.s3, gap: 2 }} testID={`chronicle-run-${r.run}-entry-${e.kind}`}>
            <T variant="caption" tone="muted">{e.date}</T><T variant="bodyStrong">{e.title}</T>{e.text ? <T variant="small">{e.text}</T> : null}
          </View>
        )) : <T variant="small" tone="muted">{r.empty}</T>}
      </View> : null}
      {children}
    </View>
  );
}

function Step({ a, busy, send, pick, select }: { a: Action; busy: boolean; send: (action: ChronicleAction, p?: ChronicleParams) => void;
  pick: (slot: number, token: string) => void; select: (route: string | null) => void }) {
  if (a.kind === "choose") return (
    <View style={{ gap: space.s2 }} testID="chronicle-choose">
      <T variant="bodyStrong">{a.title}</T>
      {a.routes?.map((x) => (
        <View key={x.id} style={[box, { borderColor: x.selected ? colors.cy : colors.bg2 }]}>
          <T variant="caption" tone="muted">{x.tag}</T><T variant="bodyStrong">{x.label}</T><T variant="small">{x.reveals}</T>
          {a.confirm ? null : <Button small kind="secondary" label={x.select} onPress={() => select(x.id)} testID={`chronicle-select-${x.id}`} />}
        </View>
      ))}
      {a.confirm ? <View style={[box, { borderColor: colors.cy }]} testID="chronicle-confirm">
        <T variant="bodyStrong">{a.confirm.title}</T><T variant="small">{a.confirm.body}</T>
        <Button label={a.confirm.label} loading={busy} onPress={() => send("choose", { route: a.confirm!.id })} testID="chronicle-choose-confirm" />
        <Button kind="ghost" small label={a.confirm.back} onPress={() => select(null)} testID="chronicle-back" />
      </View> : null}
    </View>
  );
  if (a.kind === "solve") {
    const complete = (a.slots ?? []).every((s) => s.tokens.some((t) => t.selected));
    return (
      <View style={{ gap: space.s2 }} testID="chronicle-step-prepare">
        <T variant="caption" tone="muted">{a.title}</T><T>{a.text}</T>
        {a.attempts ? <T variant="small" testID="chronicle-attempts">{a.attempts}</T> : null}
        {a.feedback ? <View style={{ borderLeftWidth: 3, borderLeftColor: colors.am, paddingLeft: space.s3 }} testID="chronicle-feedback-wrong">
          <T accessibilityLiveRegion="polite">{a.feedback.text}</T></View> : null}
        {a.slots?.map((s, i) => (
          <View key={s.id} style={{ gap: space.s2 }} accessibilityRole="radiogroup" accessibilityLabel={s.label}>
            <T variant="bodyStrong">{s.label}</T>
            {s.tokens.map((t) => <Button key={t.id} small kind={t.selected ? "primary" : "secondary"} label={t.selected ? `${t.name} · choisi` : t.name}
              onPress={() => pick(i, t.id)} testID={`chronicle-token-${i}-${t.id}`} />)}
          </View>
        ))}
        <Button label={a.submit ?? ""} disabled={!complete || busy} onPress={() => send("solve")} testID="chronicle-solve" />
        <T variant="small" tone="muted">{complete ? a.free : a.incomplete}</T>
      </View>
    );
  }
  return (
    <View style={{ gap: space.s2 }} testID={`chronicle-step-${a.kind === "resolve" ? "resolve" : a.step}`}>
      <T variant="caption" tone="muted">{a.title}</T><T variant="bodyStrong">{a.name}</T>
      {a.teaser ? <T>{a.teaser}</T> : null}
      {a.feedback ? <View style={{ borderLeftWidth: 3, borderLeftColor: colors.cy, paddingLeft: space.s3 }}><T>{a.feedback.text}</T></View> : null}
      <T variant="small" testID="chronicle-progress">{`${a.progress} · ${a.readyText}`}</T>
      <T variant="small" tone="muted">{a.pending}</T>
      <Button label={a.label ?? ""} disabled={!a.ready || busy} onPress={() => send(a.kind === "resolve" ? "resolve" : "advance", { step: a.step ?? null })}
        testID={a.kind === "resolve" ? "chronicle-resolve" : `chronicle-advance-${a.step}`} />
      {a.ready ? null : <Button kind="ghost" small label="Actualiser mes séances" disabled={busy} onPress={() => send("sync")} testID="chronicle-sync" />}
    </View>
  );
}

/** The access from the map of a world: one tap opens the chronicle. Nothing without a journey here or the V1.5.5 server. */
export function ChronicleMapButton({ owner, world, onOpen }: { owner: string; world: string; onOpen: () => void }) {
  const q = useChronicles(owner);
  const arc = q.data?.owner === owner ? q.data.arcs.find((a) => a.world === world) : null;
  if (!arc) return null;
  const label = `Chroniques · ${arc.runs.length} partie${arc.runs.length > 1 ? "s" : ""}`;
  return <Button kind="secondary" small icon="journal" label={label} accessibilityHint="Relire tes décisions, tes indices et tes issues dans ce monde" onPress={onOpen} testID="chronicle-map" />;
}

/** The chronicle of one world. Nothing without a journey in this world, for a guest, or without the V1.5.5 server. */
export function AdventureChronicles({ owner, world }: { owner: string; world: string }) {
  const q = useChronicles(owner);
  const act = useChronicleAction(owner);
  const online = useOnline();
  const [selection, setSelection] = useState<{ route?: string; answer?: string[] }>({});
  const [notice, setNotice] = useState("");
  const [opened, setOpened] = useState<Record<number, boolean>>({});
  const [abandoning, setAbandoning] = useState(false);
  const [read, setRead] = useState<Record<number, boolean>>({});
  useEffect(() => { setSelection({}); setNotice(""); setOpened({}); setAbandoning(false); setRead({}); }, [owner, world]);
  // Back online (or another device moved the run meanwhile): re-read the server, never replay an action.
  useEffect(() => { const stop = onReconnect(() => { setNotice(""); void q.refetch(); }); return () => { stop(); }; }, [q]);
  const data = q.data?.owner === owner ? q.data : null;
  if (!data?.arcs.some((a) => a.world === world)) return null;
  const v = chronicles.view(data, world, "fr", modules, selection);
  const runs = v.runs ?? [];
  const send = (action: ChronicleAction, p: ChronicleParams = {}) => {
    if (!online) { setNotice(chronicles.errorText("RPG_OFFLINE")); return; }
    setNotice("");
    const active = runs.find((r) => r.active);
    const params = { ...p, run: action === "abandon" ? active?.run ?? null : p.run ?? null, answer: action === "solve" ? selection.answer ?? null : null };
    act.mutate({ world, action, params }, {
      onSuccess: (d) => { setSelection({}); setAbandoning(false); if (action === "choose") setNotice(chronicles.conflict(p.route ?? null, d, world)); },
      onError: (e) => { setSelection({}); setAbandoning(false); setNotice(chronicles.errorText((e as Error)?.message) || "Les chroniques sont indisponibles pour le moment. Tes parties sont conservées."); },
    });
  };
  const toggle = (r: RunView, last: boolean) => {
    const open = !(opened[r.run] ?? (r.active || last));
    setOpened((x) => ({ ...x, [r.run]: open }));
    // Measurement only: a finished story reopened by the player, once per screen. Never blocks, never retried.
    if (open && !r.active && !read[r.run] && online) { setRead((x) => ({ ...x, [r.run]: true })); act.mutate({ world, action: "read", params: { run: r.run } }); }
  };
  return (
    <Card testID="chronicles">
      <View style={{ gap: space.s3 }}>
        <T variant="h2" accessibilityRole="header">{v.title}</T>
        <T tone="muted">{v.intro}</T>
        <T variant="caption" tone="muted">{v.eyebrow}</T>
        <T variant="h3">{v.arcTitle}</T>
        <View style={[box, { borderLeftWidth: 3, borderLeftColor: colors.am }]} testID="chronicle-active"><T>{v.active}</T></View>
        <T variant="bodyStrong">{v.discoveredTitle}</T>
        {v.discovered?.map((d) => <T key={d.route} variant="small" testID={`chronicle-discovered-${d.route}`}>{`• ${d.text}`}</T>)}
        {runs.map((r, i) => (
          <Run key={r.run} r={r} open={opened[r.run] ?? (r.active || i === runs.length - 1)} toggle={() => toggle(r, i === runs.length - 1)}>
            {r.action ? <Step a={r.action} busy={act.isPending} send={send} select={(route) => { setNotice(""); setSelection((x) => ({ ...x, route: route ?? undefined })); }}
              pick={(slot, token) => setSelection((x) => { const a = [...(x.answer ?? [])]; a[slot] = token; return { ...x, answer: a }; })} /> : null}
            {r.abandon ? (abandoning ? <View style={[box, { borderColor: colors.am }]} testID="chronicle-abandon-confirm">
              <T variant="bodyStrong">{r.abandon.title}</T><T variant="small">{r.abandon.body}</T>
              <Button kind="secondary" label={r.abandon.confirm} loading={act.isPending} onPress={() => send("abandon")} testID="chronicle-abandon" />
              <Button kind="ghost" small label={r.abandon.back} onPress={() => setAbandoning(false)} testID="chronicle-keep" />
            </View> : <Button kind="ghost" small label={r.abandon.label} onPress={() => setAbandoning(true)} testID="chronicle-ask-abandon" />) : null}
          </Run>
        ))}
        {v.start ? <View style={{ gap: space.s2 }}>
          <Button label={v.start.label} disabled={act.isPending} onPress={() => send("start")} testID="chronicle-start" />
          <T variant="small" tone="muted">{v.start.note}</T>
        </View> : v.locked ? <T variant="small" tone="muted" testID="chronicle-locked">{v.locked}</T> : null}
        {notice ? <T variant="small" tone="amber" testID="chronicle-notice" accessibilityLiveRegion="polite">{notice}</T> : null}
        <T variant="small" tone="muted">{v.rules}</T>
        <T variant="small" tone="muted">{v.privacy}</T>
      </View>
    </Card>
  );
}
