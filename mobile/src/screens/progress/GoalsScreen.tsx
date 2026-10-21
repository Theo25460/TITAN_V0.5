import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { ProgressBar } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { Segmented } from "../../components/Segmented";
import { Sheet } from "../../components/Sheet";
import { SportSearch } from "../../components/SportPicker";
import { EmptyState, ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Insights, Sports } from "../../core";
import { localDateKey, num } from "../../core/session";
import type { Goal } from "../../core/types";
import { useGoals, useLogs, useSaveGoal } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { colors, space } from "../../theme/tokens";

const DAY = 86400000;
const METRICS: Record<Goal["metric"], { label: string; unit: (n: number) => string; fmt: (v: number) => string }> = {
  sessions: { label: "Séances", unit: (n) => (n > 1 ? "séances" : "séance"), fmt: (v) => Format.number(v) },
  days: { label: "Jours actifs", unit: (n) => (n > 1 ? "jours actifs" : "jour actif"), fmt: (v) => Format.number(v) },
  minutes: { label: "Temps", unit: () => "min", fmt: (v) => (v > 0 ? Format.duration(v) : "0 min") },
  distance: { label: "Distance", unit: () => "km", fmt: (v) => (v > 0 ? Format.distance(v) : "0 km") },
};
const TEMPLATES = [
  { title: "Un mois en mouvement", metric: "days" as const, target: 12, days: 28, sport: null, text: "12 jours actifs en 4 semaines, tous sports." },
  { title: "Mes 100 km du mois", metric: "distance" as const, target: 100, days: 30, sport: "running", text: "Course, à ajuster à ton niveau." },
  { title: "10 heures pour moi", metric: "minutes" as const, target: 600, days: 30, sport: null, text: "Du temps cumulé : seules les durées renseignées comptent." },
  { title: "Retour régulier", metric: "sessions" as const, target: 8, days: 28, sport: null, text: "8 séances en 4 semaines." },
];

type EditorState = { old: Goal | null; title: string; metric: Goal["metric"]; sport: string | null; target: string; start: string; end: string };

export function GoalsScreen() {
  const goals = useGoals();
  const { logs } = useLogs();
  const save = useSaveGoal();
  const toast = useToast();
  const online = useOnline();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickSport, setPickSport] = useState(false);
  const list = goals.data ?? [];
  const active = list.filter((g) => !g.archived_at);
  const archived = list.filter((g) => g.archived_at);

  const progress = useMemo(() => new Map(list.map((g) => [g.id, Insights.goalProgress(g, logs, new Date())])), [list, logs]);

  function openNew(t?: (typeof TEMPLATES)[number]) {
    const start = new Date();
    setError(null);
    setEditor({ old: null, title: t?.title ?? "", metric: t?.metric ?? "sessions", sport: t?.sport ?? null, target: t ? String(t.target) : "", start: localDateKey(start), end: localDateKey(new Date(start.getTime() + ((t?.days ?? 28) - 1) * DAY)) });
  }
  function openEdit(g: Goal) {
    setError(null);
    setEditor({ old: g, title: g.title, metric: g.metric, sport: g.sport, target: String(g.target), start: g.start_date, end: g.end_date });
  }
  function pickDate(which: "start" | "end") {
    if (!editor) return;
    DateTimePickerAndroid.open({
      value: new Date(`${editor[which]}T12:00:00`),
      mode: "date",
      onChange: (e, d) => {
        if (e.type === "set" && d) setEditor((s) => (s ? { ...s, [which]: localDateKey(d) } : s));
      },
    });
  }

  async function submit() {
    if (!editor) return;
    const title = editor.title.replace(/\s+/g, " ").trim().slice(0, 80);
    const target = num(editor.target);
    if (title.length < 2) return setError("Donne un nom à ton objectif (2 caractères minimum).");
    if (!(target && target > 0) || target > 1000000) return setError("Choisis une cible supérieure à zéro, au maximum 1 000 000.");
    if (editor.metric === "distance" && editor.sport && Sports.unitOf(editor.sport) !== "km") return setError("La distance se mesure avec un sport en kilomètres.");
    if (editor.end < editor.start) return setError("La fin doit suivre le début.");
    if ((new Date(editor.end).getTime() - new Date(editor.start).getTime()) / DAY > 730) return setError("Une période dure au maximum deux ans.");
    if (!editor.old && active.length >= 50) return setError("Tu as déjà 50 objectifs actifs. Archive ceux que tu n’utilises plus.");
    if (!online) return setError("Hors ligne : les objectifs s’enregistrent avec une connexion. Réessaie au retour du réseau.");
    try {
      await save.mutateAsync({ fields: { title, metric: editor.metric, sport: editor.sport, target, start_date: editor.start, end_date: editor.end }, old: editor.old });
      setEditor(null);
      toast({ kind: "ok", title: editor.old ? "Objectif ajusté" : "Objectif créé" });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function toggleArchive(g: Goal) {
    Alert.alert(g.archived_at ? "Restaurer cet objectif ?" : "Archiver cet objectif ?", g.archived_at ? "Il revient dans tes objectifs en cours." : "Il quitte la liste et reste dans les archives, avec sa progression.", [
      { text: "Annuler", style: "cancel" },
      {
        text: g.archived_at ? "Restaurer" : "Archiver",
        onPress: () => save.mutateAsync({ fields: { archived_at: g.archived_at ? null : new Date().toISOString() }, old: g }).catch((e) => toast({ kind: "err", title: "Modification impossible", message: errorMessage(e) })),
      },
    ]);
  }

  const card = (g: Goal) => {
    const p = progress.get(g.id)!;
    const m = METRICS[g.metric];
    const remainingDays = Math.max(0, Math.ceil((new Date(`${g.end_date}T23:59:59`).getTime() - Date.now()) / DAY));
    return (
      <Card key={g.id} tone={p.complete ? "accent" : "default"} style={{ gap: space.s3 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Chip label={g.sport ? Sports.label(g.sport) : "Tous les sports"} />
          <T variant="caption" tone="faint">
            {g.archived_at ? "Archivé" : p.ended ? "Terminé" : p.upcoming ? `Commence le ${new Date(`${g.start_date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : `${remainingDays} jour${remainingDays > 1 ? "s" : ""} restant${remainingDays > 1 ? "s" : ""}`}
          </T>
        </View>
        <T variant="h3">{g.title}</T>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <T variant="num" tone={p.complete ? "accent" : "default"}>
            {m.fmt(p.value)}
          </T>
          <T variant="small">
            / {m.fmt(Number(g.target))} {g.metric === "sessions" || g.metric === "days" ? m.unit(Number(g.target)) : ""}
          </T>
        </View>
        <ProgressBar value={p.ratio} color={p.complete ? colors.ok : colors.cy} accessibilityLabel={`${g.title} : ${Math.round(p.ratio * 100)} %`} />
        {p.complete ? <T variant="small" tone="ok">Objectif atteint.</T> : g.metric === "minutes" && p.measured < p.sources.length ? <T variant="caption" tone="faint">{Format.plural(p.sources.length - p.measured, "séance sans durée ne compte", "séances sans durée ne comptent")} pas.</T> : null}
        <View style={{ flexDirection: "row", gap: space.s2 }}>
          {!g.archived_at ? <Button small kind="secondary" icon="edit" label="Ajuster" onPress={() => openEdit(g)} style={{ flex: 1 }} /> : null}
          <Button small kind="ghost" icon={g.archived_at ? "restore" : "archive"} label={g.archived_at ? "Restaurer" : "Archiver"} onPress={() => toggleArchive(g)} style={{ flex: 1 }} disabled={!online} />
        </View>
      </Card>
    );
  };

  return (
    <>
      <Screen refreshing={goals.isRefetching} onRefresh={() => goals.refetch()} footer={<Button label="Nouvel objectif" icon="plus" onPress={() => openNew()} testID="goal-new" />}>
        {goals.isLoading && !goals.data ? (
          <LoadingCards />
        ) : goals.error && !goals.data ? (
          <ErrorState error={goals.error} onRetry={() => goals.refetch()} />
        ) : !active.length ? (
          <>
            <EmptyState icon="target" title="Fixe-toi un cap" text="Un objectif daté, à ton rythme : séances, jours actifs, temps ou distance. Ta progression se calcule avec ton journal." />
            <Section title="Idées pour commencer">
              {TEMPLATES.map((t) => (
                <Card key={t.title} onPress={() => openNew(t)} accessibilityLabel={`Créer l’objectif ${t.title}`} style={{ gap: 4 }}>
                  <T variant="bodyStrong">{t.title}</T>
                  <T variant="small">{t.text}</T>
                </Card>
              ))}
            </Section>
          </>
        ) : (
          <Section title={`En cours (${active.length})`}>{active.map(card)}</Section>
        )}
        {archived.length ? <Section title={`Archives (${archived.length})`}>{archived.slice(0, 20).map(card)}</Section> : null}
      </Screen>

      <Sheet
        visible={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.old ? "Ajuster l’objectif" : "Nouvel objectif"}
        footer={
          <View style={{ gap: 6 }}>
            {error ? <T variant="small" tone="err" accessibilityRole="alert">{error}</T> : null}
            <Button label={editor?.old ? "Enregistrer" : "Créer l’objectif"} loading={save.isPending} onPress={submit} testID="goal-save" />
          </View>
        }
      >
        {editor ? (
          <>
            <Field label="Nom" value={editor.title} onChangeText={(title) => setEditor({ ...editor, title })} maxLength={80} placeholder="Mon mois en mouvement" testID="goal-title" />
            <Segmented value={editor.metric} onChange={(metric) => setEditor({ ...editor, metric })} options={(Object.keys(METRICS) as Goal["metric"][]).map((k) => ({ value: k, label: METRICS[k].label }))} accessibilityLabel="Mesure" />
            <Field label={`Cible (${editor.metric === "minutes" ? "minutes" : editor.metric === "distance" ? "km" : METRICS[editor.metric].unit(2)})`} value={editor.target} onChangeText={(target) => setEditor({ ...editor, target })} keyboardType="decimal-pad" testID="goal-target" />
            <View style={{ gap: 6 }}>
              <T variant="caption" tone="muted">
                Sport
              </T>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                <Chip label="Tous les sports" selected={!editor.sport} onPress={() => setEditor({ ...editor, sport: null })} />
                {editor.sport ? <Chip label={Sports.label(editor.sport)} selected onPress={() => setPickSport(true)} /> : <Chip label="Choisir un sport" icon="search" onPress={() => setPickSport(true)} />}
              </View>
              {pickSport ? (
                <SportSearch
                  onPick={(s) => {
                    setEditor({ ...editor, sport: s });
                    setPickSport(false);
                  }}
                />
              ) : null}
            </View>
            <View style={{ flexDirection: "row", gap: space.s2 }}>
              <Button kind="secondary" small icon="calendar" label={`Du ${new Date(`${editor.start}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`} onPress={() => pickDate("start")} style={{ flex: 1 }} />
              <Button kind="secondary" small icon="flag" label={`Au ${new Date(`${editor.end}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}`} onPress={() => pickDate("end")} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
