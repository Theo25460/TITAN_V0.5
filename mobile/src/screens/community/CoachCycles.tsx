/* V1.9.5 — Bilans de cycle partageables, athlete side on Android (Communauté › « Mes suivis de coaching »). Behind screens.coach_cycle_report.
   The athlete reads the report their coach proposes, validates it item by item (measures, notes and check-ins ticked one by one — never
   for them —, each decision approved or not, a file allowed or not), then reads exactly what the coach sees, retracts an item or the whole
   access, and shares their own file. Paused and ended shares stay readable (ended: one year). One validation is sent at a time, whatever
   the number of taps, with an op_id kept for the retry. Nothing here writes the journal. Wording comes from the website's shared module
   (src/core/web/coach-cycle.js). */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Share, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Alert, ask } from "../../components/Dialog";
import { Field } from "../../components/Field";
import { T } from "../../components/Text";
import { CoachCycle as C, type AthleteReports, type Choice, type CycleSession, type Published, type Report } from "../../core/coachCycle";
import * as api from "../../data/api";
import { useServerFlag } from "../../data/flags";
import { space } from "../../theme/tokens";

const key = (owner: string) => ["coach-cycles", owner] as const;
const codeOf = (e: unknown) => String((e as { message?: string })?.message ?? "");
const tone = (t: string) => (t === "done" ? "ok" : t === "wait" ? "amber" : "default") as "ok" | "amber" | "default";

type Draft = { report: Report; choice: Choice; decisions: Record<string, string>; allowExport: boolean; note: string; understood?: string; op: string };

export function CoachCycles({ owner, online }: { owner: string; online: boolean }) {
  const enabled = useServerFlag("screens.coach_cycle_report");
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key(owner), queryFn: () => api.coachCycle<AthleteReports>(owner, "athlete"), enabled: enabled && online, retry: false, staleTime: 30_000 });
  const [open, setOpen] = useState<Record<string, Report>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  if (!enabled || !online) return null;
  if (q.isError) return <View style={{ gap: space.s2 }}><T>{C.message(codeOf(q.error)) || "Les bilans sont indisponibles pour le moment."}</T><Button label="Réessayer" kind="secondary" small onPress={() => q.refetch()} /></View>;
  if (!q.data) return <T accessibilityLiveRegion="polite">Lecture des bilans…</T>;
  if (q.data.owner !== owner || !q.data.reports.length) return null;

  async function run(label: string, fn: () => Promise<void>, failTitle: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    try { await fn(); } catch (e) {
      Alert.alert(failTitle, C.message(codeOf(e)) || "La demande n’a pas abouti. Réessaie.");
    } finally {
      lock.current = false;
      setBusy(null);
      await qc.invalidateQueries({ queryKey: key(owner) });
    }
  }
  const detail = (r: Report) => run("open" + r.id, async () => {
    const d = await api.coachCycle<Report>(owner, "report", { id: r.id });
    setOpen((o) => ({ ...o, [r.id]: d }));
  }, "Bilan indisponible");
  const startValidation = (r: Report) => run("open" + r.id, async () => {
    const d = await api.coachCycle<Report>(owner, "report", { id: r.id });
    setOpen((o) => ({ ...o, [r.id]: d }));
    if (d.proposal) setDraft({ report: d, choice: C.choices(d.proposal), decisions: {}, allowExport: !!d.allow_export, note: "", op: C.opId() });
  }, "Bilan indisponible");
  const validate = (d: Draft) => run("validate", async () => {
    // The op_id belongs to this reading: a retry after a lost answer replays the same validation, never a second version.
    const r = await api.coachCycle<{ already: boolean; version: number; report: Report }>(owner, "validate", { id: d.report.id,
      ...C.validation(d.report.proposal!, d.choice, { opId: d.op, decisions: d.decisions, allowExport: d.allowExport, note: d.note, understood: d.understood }) });
    setOpen((o) => ({ ...o, [d.report.id]: r.report }));
    setDraft(null);
    Alert.alert(r.already ? "Déjà validé" : `Bilan publié · version ${r.version}`, "Ton coach lit cette version. Tu peux en retirer un élément ou l’accès à tout moment.");
  }, "Validation non confirmée");
  const retract = (r: Report, kind: string, k: string) => run(`retract-${kind}-${k}`, async () => {
    const x = await api.coachCycle<{ report: Report }>(owner, "retract", { id: r.id, items: [{ kind, key: k }] });
    setOpen((o) => ({ ...o, [r.id]: x.report }));
    Alert.alert("Retiré de la version en ligne", "Les prochains fichiers ne le contiendront pas. Un fichier déjà téléchargé ne peut pas être repris.");
  }, "Retrait non confirmé");
  const withdraw = async (r: Report) => {
    const ok = await ask("Retirer l’accès de ton coach ?", `${r.coach_name || "Ton coach"} ne lira plus cette version dans TITAN, même avec un lien direct. Tu la gardes. Un fichier déjà téléchargé ne peut pas être repris.`, { confirmLabel: "Retirer l’accès" });
    if (!ok) return;
    await run("withdraw" + r.id, async () => {
      const x = await api.coachCycle<{ report: Report }>(owner, "withdraw", { id: r.id });
      setOpen((o) => ({ ...o, [r.id]: x.report }));
    }, "Retrait non confirmé");
  };
  const share = (r: Report) => run("export" + r.id, async () => {
    const file = C.exportFile(await api.coachCycle(owner, "export", { id: r.id }));
    await Share.share({ title: file.filename, message: file.text });
  }, "Fichier indisponible");

  function sessionRow(s: CycleSession, report: Report | null) {
    const v = C.session(s);
    return (
      <View key={s.key} style={{ gap: space.s1, paddingVertical: space.s1 }} testID={`cy-session-${s.key}`}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2, alignItems: "center" }}>
          <T variant="bodyStrong" style={{ flexShrink: 1 }}>{v.title}</T>
          <Chip label={v.label} tone={tone(v.tone)} />
        </View>
        <T variant="small" tone="muted">{v.dates.map((d) => `${d.label} ${d.text}`).join(" · ")}</T>
        {v.measure ? <T variant="small" testID={`cy-measure-${s.key}`}>{v.measure}</T> : null}
        {v.text ? <T variant="small" tone="muted">{v.text}</T> : null}
        {v.note ? <T variant="small" testID={`cy-note-${s.key}`}>Note · « {v.note} »</T> : null}
        {report && report.can_act !== undefined && (v.note || v.measure) ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
          {v.note ? <Button label="Retirer cette note" kind="ghost" small loading={busy === `retract-note-${s.key}`} onPress={() => retract(report, "note", s.key)} testID={`cy-retract-note-${s.key}`} /> : null}
          {v.measure ? <Button label="Retirer cette mesure" kind="ghost" small loading={busy === `retract-measure-${s.key}`} onPress={() => retract(report, "measure", s.key)} testID={`cy-retract-measure-${s.key}`} /> : null}
        </View> : null}
      </View>
    );
  }

  function publishedView(r: Report, pub: Published) {
    const t = C.totals(pub.totals, pub.sessions);
    return (
      <View style={{ gap: space.s2 }} testID={`cy-published-${r.id}`}>
        <T variant="bodyStrong">{r.hosted === "online" ? "Ce que mon coach voit" : "La version que j’ai validée"}</T>
        <T variant="small" tone="muted">Période : {t.period} · {t.weeksCount} semaine(s). Chaque chiffre indique sa source.</T>
        {t.figures.map((f) => (
          <View key={f.id + (f.unit ?? "")} style={{ gap: 2 }} testID={`cy-figure-${f.id}${f.unit ? "-" + f.unit : ""}`}>
            <T variant="bodyStrong">{f.label} · {f.value}</T>
            <T variant="caption" tone="muted">{f.count ? `${f.count} · ` : ""}{f.period}</T>
            <T variant="caption" tone="faint">{f.source}{f.sources.length ? ` Séances : ${f.sources.map((s) => s.text).join(" ; ")}.` : ""}</T>
          </View>
        ))}
        {t.weeks.map((w) => <T key={w.week} variant="small" testID={`cy-week-${w.week}`}>{w.label} ({w.period}) : {w.planned} prévue(s), {w.done} réalisée(s), {w.moved} reportée(s)</T>)}
        <T variant="bodyStrong">Séances du cycle</T>
        {pub.sessions.map((s) => sessionRow(s, r))}
        {pub.checkins.map((c) => C.checkin(c)).map((c) => (
          <View key={c.week} style={{ gap: space.s1 }} testID={`cy-checkin-${c.week}`}>
            <T variant="small">{c.label} · {c.scores}{c.note ? ` · « ${c.note} »` : ""}</T>
            <Button label="Retirer ce check-in" kind="ghost" small onPress={() => retract(r, "checkin", c.week)} />
          </View>
        ))}
        {pub.observations.map((o) => C.observation(o, pub.sessions)).map((o) => <T key={o.key} variant="small" testID={`cy-observation-${o.key}`}>Constat · {o.text}{o.sources.length ? ` (séances : ${o.sources.map((s) => s.text).join(" ; ")})` : ""}</T>)}
        {pub.decisions.map((d) => C.decision(d)).map((d) => <T key={d.key} variant="small" testID={`cy-decision-${d.key}`}>{d.kindLabel} · {d.text} — {d.stateLabel}</T>)}
        {pub.athlete_note ? <View style={{ gap: space.s1 }}><T variant="small">Mon mot · « {pub.athlete_note} »</T><Button label="Retirer mon mot" kind="ghost" small onPress={() => retract(r, "word", "word")} /></View> : null}
        {pub.retracted.length ? <T variant="caption" tone="muted" testID={`cy-retracted-${r.id}`}>Retiré depuis la validation : {pub.retracted.map((x) => C.retractedLine(x)).join(" ; ")}.</T> : null}
        <T variant="caption" tone="faint">{C.SHARE_NOTICE}</T>
        {(r.exports ?? []).map((x, i) => <T key={i} variant="caption" tone="muted" testID={`cy-export-${i}`}>{C.exportLine(x)}</T>)}
      </View>
    );
  }

  function validationView(d: Draft) {
    const p = d.report.proposal!;
    const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
    const tick = (kind: keyof Choice, k: string) => {
      const choice = { measures: { ...d.choice.measures }, notes: { ...d.choice.notes }, checkins: { ...d.choice.checkins } };
      choice[kind][k] = !choice[kind][k];
      if (kind === "measures" && !choice.measures[k]) choice.notes[k] = false;
      set({ choice });
    };
    return (
      <View style={{ gap: space.s2 }} testID="cy-validate">
        <T variant="bodyStrong">Décisions proposées par ton coach</T>
        {p.decisions.map((x) => C.decision(x)).map((x) => (
          <View key={x.key} style={{ gap: space.s1 }}>
            <T variant="small">{x.kindLabel} · {x.text}</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
              <Chip label="J’approuve" selected={d.decisions[x.key] === "approve"} onPress={() => set({ decisions: { ...d.decisions, [x.key]: "approve" } })} testID={`cy-approve-${x.key}`} />
              <Chip label="Je ne retiens pas" selected={d.decisions[x.key] === "decline"} onPress={() => set({ decisions: { ...d.decisions, [x.key]: "decline" } })} testID={`cy-decline-${x.key}`} />
            </View>
          </View>
        ))}
        <T variant="bodyStrong">Ce que je partage</T>
        <T variant="small" tone="muted">Tes notes et tes check-ins ne sont jamais ajoutés d’office : choisis ceux que tu veux partager.</T>
        {p.sessions.filter((s) => s.measure).map((s) => {
          const v = C.session(s);
          return (
            <View key={s.key} style={{ gap: space.s1 }}>
              <T variant="small">{v.name} · {v.measure}</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
                <Chip label="Partager la mesure" selected={!!d.choice.measures[s.key]} onPress={() => tick("measures", s.key)} testID={`cy-pick-measure-${s.key}`} />
                {s.note && d.choice.measures[s.key] ? <Chip label={`Partager ma note : « ${s.note} »`} selected={!!d.choice.notes[s.key]} onPress={() => tick("notes", s.key)} testID={`cy-pick-note-${s.key}`} /> : null}
              </View>
            </View>
          );
        })}
        {p.checkins.map((c) => C.checkin(c)).map((c) => (
          <Chip key={c.week} label={`${c.label} · ${c.scores}${c.note ? ` · « ${c.note} »` : ""}`} selected={!!d.choice.checkins[c.week]} onPress={() => tick("checkins", c.week)} testID={`cy-pick-checkin-${c.week}`} />
        ))}
        <T variant="small" testID="cy-share-summary" accessibilityLiveRegion="polite">{C.shareSummary(p, d.choice)}</T>
        <Chip label={`Autoriser ${d.report.coach_name || "mon coach"} à télécharger un fichier`} selected={d.allowExport} onPress={() => set({ allowExport: !d.allowExport })} testID="cy-allow-export" />
        <T variant="caption" tone="faint">{C.SHARE_NOTICE}</T>
        <Field label="Mon mot sur ce cycle (facultatif)" maxLength={300} value={d.note} onChangeText={(note) => set({ note })} testID="cy-note" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
          <Chip label="Ce que mon coach verra est clair" selected={d.understood === "clear"} onPress={() => set({ understood: "clear" })} testID="cy-understood-clear" />
          <Chip label="Pas tout à fait" selected={d.understood === "unsure"} onPress={() => set({ understood: "unsure" })} />
        </View>
        <Button label="Valider et publier" loading={busy === "validate"} onPress={() => validate(d)} testID="cy-validate-go" />
        <Button label="Annuler" kind="ghost" small onPress={() => setDraft(null)} />
      </View>
    );
  }

  function card(row: Report) {
    const r = open[row.id] ?? row;
    const h = C.head(r, "athlete");
    const asks = r.can_act && (r.state === "proposed" || r.hosted === "withdrawn" || r.hosted === "revalidate");
    return (
      <Card key={r.id} style={{ gap: space.s2 }} testID={`cy-report-${r.id}`}>
        <T variant="eyebrow">{row.coach_name || "Mon coach"} · {h.hostedLabel || h.stateLabel}</T>
        <T variant="title">Bilan · {h.title}</T>
        <T variant="small" tone="muted">{h.dates}</T>
        {h.versionText ? <T variant="small">{h.versionText}</T> : null}
        {h.hostedText ? <T variant="small" testID={`cy-hosted-${r.id}`}>{h.hostedText}</T> : null}
        {h.link ? <T variant="small" tone="muted" testID={`cy-readonly-${r.id}`}>{h.link}</T> : null}
        {h.next ? <T variant="small">{h.next}</T> : null}
        {draft?.report.id === r.id ? validationView(draft) : <>
          {r.published ? publishedView(r, r.published) : null}
          {!open[row.id] ? <Button label={asks ? (r.state === "proposed" ? "Relire et valider" : "Valider à nouveau") : "Ouvrir le bilan"} kind={asks ? "primary" : "secondary"} small loading={busy === "open" + r.id}
            onPress={() => (asks ? startValidation(r) : detail(r))} testID={`cy-open-${r.id}`} /> : null}
          {open[row.id] && r.proposal && r.can_act ? <Button label={asks ? (r.state === "proposed" ? "Relire et valider" : "Valider à nouveau") : "Modifier ce que je partage"} kind={asks ? "primary" : "secondary"} small
            onPress={() => setDraft({ report: r, choice: C.choices(r.proposal!), decisions: {}, allowExport: !!r.allow_export, note: "", op: C.opId() })} testID={`cy-revalidate-${r.id}`} /> : null}
          {open[row.id] && r.published ? <Button label="Partager mon fichier" kind="secondary" small loading={busy === "export" + r.id} onPress={() => share(r)} testID={`cy-share-${r.id}`} /> : null}
          {open[row.id] && r.published && r.hosted === "online" ? <Button label="Retirer l’accès de mon coach" kind="ghost" small loading={busy === "withdraw" + r.id} onPress={() => withdraw(r)} testID={`cy-withdraw-${r.id}`} /> : null}
        </>}
      </Card>
    );
  }

  return (
    <View style={{ gap: space.s3 }} testID="coach-cycles">
      <T variant="h3">Bilans de cycle</T>
      {q.data.reports.map(card)}
      <T variant="caption" tone="faint">Tu choisis ce que tu partages. Ton journal ne change pas.</T>
    </View>
  );
}
