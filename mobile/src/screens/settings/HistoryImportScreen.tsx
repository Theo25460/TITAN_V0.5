/* V1.6.4 — « Importer mon historique ». The same reader of history files as the website (src/core/web/history-migration.js): the TITAN
   export (journal CSV, « toutes mes données » JSON), the CSV profile « TITAN historique v1 » and the activities.csv of a Strava archive.
   The athlete sees what each row will become against the journal, classifies the unknown sports, sends the batch in chunks the server
   records row by row (titan_import_batch_rows_v1), and reads the batch report back from the server — on this phone or the website —
   with a withdrawal whose effects are shown before anything changes. Nothing is kept on the phone: reopening the same file resumes it. */
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { ask } from "../../components/Dialog";
import { ProgressBar } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { Segmented } from "../../components/Segmented";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format, Migration, Sports, type ImportBatch, type ImportBatchRow, type MigrationParsed, type MigrationPreview } from "../../core";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { keys, useLogs } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { useOnline } from "../../lib/network";
import { space } from "../../theme/tokens";

const PLAN = { add: "À ajouter", link: "Déjà au journal", review: "À vérifier", skip: "Ignorées" } as const;
const STATUS = { open: "En cours", done: "Terminé", withdrawn: "Retiré" } as const;
const OUTCOMES = [{ value: "", label: "Toutes" }, { value: "added", label: "Ajoutées" }, { value: "linked", label: "Associées" }, { value: "skipped", label: "Ignorées" }] as const;
const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris"; } catch { return "Europe/Paris"; } };
const n = (v: number) => Format.number(v);
/** « 1 ajoutée », « 3 ajoutées »: the count and its word agree. */
const pl = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v > 1 ? many : one}`;
const when = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; };
const serverMessage = (e: unknown) => {
  const m = String((e as { message?: string })?.message || "");
  if (m === "RATE_LIMITED") return "Trop d’envois en peu de temps. Réessaie dans une heure : l’import reprendra où il s’est arrêté.";
  if (m === "IMPORT_BATCH_TOO_MANY") return "Tu as déjà 5 imports en cours. Termine-les ou retire-les avant d’en commencer un autre.";
  if ((e as { code?: string })?.code === "PGRST202") return "L’import d’historique n’est pas encore ouvert sur le serveur.";
  return `${errorMessage(e)} Rien n’est perdu : l’import reprend à la ligne où il s’est arrêté.`;
};

export function HistoryImportScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const { logs } = useLogs();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [sportMap, setSportMap] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState<"" | "limited" | "busy">("");
  const [report, setReport] = useState<(ImportBatch & { rows: ImportBatchRow[] }) | null>(null);
  const [filter, setFilter] = useState<"" | "added" | "linked" | "skipped">("");
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);

  const loadBatches = useCallback(() => {
    api.importBatches(owner).then(setBatches).catch(() => setBatches([]));
  }, [owner]);
  useEffect(loadBatches, [loadBatches]);

  const { parsed, parseError } = useMemo((): { parsed: MigrationParsed | null; parseError: string } => {
    if (!file) return { parsed: null, parseError: "" };
    try {
      return { parsed: Migration.parse(file.text, { name: file.name, tz: deviceTz(), sportMap }), parseError: "" };
    } catch (e) {
      // A layout the profile does not recognise: the website lets the athlete map the columns; here the message names them.
      return { parsed: null, parseError: `${e instanceof Error ? e.message : "Ce fichier est illisible."} Utilise les noms de colonnes du profil « TITAN historique v1 », ou indique-les depuis le site (Journal › Importer un historique).` };
    }
  }, [file, sportMap]);
  const preview: MigrationPreview | null = useMemo(() => (parsed ? Migration.preview(parsed, logs.filter((l) => !l.archived_at)) : null), [parsed, logs]);

  async function pick() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "application/json", "text/plain", "application/octet-stream"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if ((asset.size ?? 0) > Migration.LIMITS.maxBytes) return toast({ kind: "warn", title: "Fichier trop lourd", message: "Le fichier doit faire moins de 20 Mo : découpe-le en plusieurs fichiers." });
      setFile({ name: (asset.name || "historique.csv").slice(0, 120), text: await FileSystem.readAsStringAsync(asset.uri) });
      setSportMap({});
      setBatch(null);
      setReport(null);
      setPaused("");
    } catch (e) {
      toast({ kind: "err", title: "Lecture impossible", message: errorMessage(e) });
    }
  }

  async function openReport(id: string, outcome: "" | "added" | "linked" | "skipped" = "") {
    try {
      setFilter(outcome);
      setReport(await api.importBatchReport(owner, id, outcome || null));
    } catch (e) {
      toast({ kind: "err", title: "Rapport indisponible", message: serverMessage(e) });
    }
  }

  async function run() {
    if (!parsed || !file || busy) return;
    setBusy(true);
    setPaused("");
    let changed = false;
    try {
      let b = await api.importBatchOpen(owner, { format: parsed.format, hash: Migration.fileHash(file.text), total: parsed.total, name: file.name });
      const resumed = !!b.resumed;
      setBatch(b);
      outer: while (b.status === "open") {
        const list = Migration.chunks(parsed, b.next_row);
        if (!list.length) break;
        for (const items of list) {
          const r = await api.importBatchRows(owner, b.id, items);
          if (r.processed) changed = true;
          b = { ...r, resumed };
          setBatch(b);
          if (r.limited || r.busy) { setPaused(r.limited ? "limited" : "busy"); break outer; }
        }
      }
      if (b.status !== "open") {
        await openReport(b.id);
        toast({ kind: "ok", title: "Historique importé", message: `${n(b.counts.added)} séances ajoutées, ${n(b.counts.linked)} déjà dans ton journal.` });
      }
    } catch (e) {
      toast({ kind: "err", title: "Import interrompu", message: serverMessage(e) });
    } finally {
      setBusy(false);
      loadBatches();
      if (changed) qc.invalidateQueries({ queryKey: keys.logs(owner) });
    }
  }

  async function withdraw() {
    if (!report) return;
    try {
      const p = await api.importBatchWithdraw(owner, report.id, false);
      const ok = await ask("Retirer ce lot ?", [...Migration.withdrawText(p.effects), "Tes séances déjà présentes et tes corrections restent telles quelles."].join("\n"), { confirmLabel: "Retirer", cancelLabel: "Annuler" });
      if (!ok) return;
      await api.importBatchWithdraw(owner, report.id, true);
      qc.invalidateQueries({ queryKey: keys.logs(owner) });
      loadBatches();
      await openReport(report.id);
    } catch (e) {
      toast({ kind: "err", title: "Retrait impossible", message: serverMessage(e) });
    }
  }

  const unknown = parsed ? Object.entries(parsed.unknownSports) : [];
  const total = batch ? batch.total_rows : parsed?.total ?? 0;
  const done = batch ? batch.done_rows : 0;
  return (
    <Screen>
      <T tone="muted">Fais entrer des années de pratique dans TITAN. Les séances de plus de 30 jours entrent comme historique : comptées dans tes totaux et tes records, sans XP ni crédit. Une séance déjà au journal n’est jamais doublée et tes corrections ne sont jamais remplacées.</T>
      <Card style={{ gap: space.s2 }}>
        <T variant="bodyStrong">Fichiers acceptés</T>
        <T variant="small">Export TITAN : le CSV du journal ou le JSON « toutes mes données ». CSV « TITAN historique v1 » : date, heure, sport, durée, distance, unité, ressenti, note, identifiant. Strava : activities.csv de l’archive de ton compte (strava.com › Paramètres › Mon compte › Télécharger ou supprimer votre compte).</T>
        <Button kind="secondary" icon="upload" label="Choisir un fichier" onPress={pick} disabled={busy} testID="history-pick" />
        {parseError ? <T variant="small" tone="warn" testID="history-parse-error">{parseError}</T> : null}
      </Card>

      {parsed && preview && !report ? (
        <Card style={{ gap: 6 }} testID="history-summary">
          <T variant="bodyStrong">{file?.name} · {Migration.FORMATS[parsed.format]} · {n(parsed.total)} lignes</T>
          <T variant="small">{parsed.format === "csv_profile" ? `Heures lues dans le fuseau de ce téléphone (${deviceTz()}).` : parsed.format === "strava_csv" ? "Heures lues en UTC, comme Strava les exporte." : "Heures lues avec le fuseau écrit dans l’export."} Distances en m ou en miles converties.</T>
          <T variant="small" testID="history-counts">{n(preview.counts.add)} à ajouter · {n(preview.counts.link)} déjà au journal · {n(preview.counts.review)} à vérifier · {pl(preview.counts.skip, "ignorée")}</T>
          {Object.entries(preview.reasons).map(([k, v]) => <T key={k} variant="small" tone="muted">{n(v)} · {Migration.REASONS[k] || k}</T>)}
          {unknown.map(([raw, count]) => (
            <View key={raw} style={{ gap: 4 }} testID={`history-sport-${raw}`}>
              <T variant="small">Sport à classer : « {raw} » · {n(count)} ligne{count > 1 ? "s" : ""}</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {Sports.search(raw, { limit: 3 }).map((s) => <Chip key={s.id} label={s.label} onPress={() => setSportMap((m) => ({ ...m, [raw]: s.id }))} testID={`history-sport-${raw}-${s.id}`} />)}
                <Chip label="Ignorer" onPress={() => setSportMap((m) => ({ ...m, [raw]: "skip" }))} testID={`history-sport-${raw}-skip`} />
              </View>
            </View>
          ))}
          {(["add", "link", "review", "skip"] as const).map((plan) => {
            const rows = preview.rows.filter((r) => r.plan === plan);
            if (!rows.length) return null;
            return (
              <View key={plan} style={{ gap: 2 }} testID={`history-plan-${plan}`}>
                <T variant="bodyStrong">{PLAN[plan]} · {n(rows.length)}</T>
                {rows.slice(0, 20).map((r) => (
                  <T key={r.row} variant="small" tone="muted">
                    {r.item ? `Ligne ${r.row} · ${Sports.label(r.item.sport)} · ${when(r.item.startedAt)} · ${r.item.minutes} min${r.item.km ? ` · ${r.item.km} km` : ""}` : `Ligne ${r.row} · ${Migration.REASONS[r.reason || ""] || r.reason}`}
                  </T>
                ))}
                {rows.length > 20 ? <T variant="small" tone="muted">… et {n(rows.length - 20)} autres, toutes dans le rapport final.</T> : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      {parsed && !report ? (
        <Card style={{ gap: space.s2 }}>
          {batch ? <ProgressBar value={done / Math.max(1, total)} accessibilityLabel="Import de l’historique" /> : null}
          {batch ? <T variant="small" testID="history-progress">{n(done)} / {n(total)} lignes · {pl(batch.counts.added, "ajoutée")} · {pl(batch.counts.linked, "associée")} · {pl(batch.counts.duplicate, "déjà importée")} · {pl(batch.counts.skipped, "ignorée")}</T> : null}
          {paused === "limited" && batch ? <T variant="small" tone="warn" testID="history-paused">Limite du jour atteinte : 300 séances d’historique par jour. Reviens demain et choisis à nouveau ce fichier : l’import reprend à la ligne {n(batch.next_row)}, ici ou sur le site.</T> : null}
          {paused === "busy" ? <T variant="small" tone="warn">Une séance de ton journal est en cours de modification. Reprends dans un instant.</T> : null}
          <Button label={done ? "Reprendre l’import" : `Importer ${n(parsed.total)} lignes`} loading={busy} disabled={!online} onPress={run} testID="history-run" />
        </Card>
      ) : null}

      {report ? (
        <Card style={{ gap: 6 }} testID="history-report">
          <T variant="bodyStrong">{report.file_name || Migration.FORMATS[report.format]} · {STATUS[report.status]}</T>
          <T variant="small" testID="history-report-counts">{pl(report.counts.added, "ajoutée")} · {pl(report.counts.linked, "associée")}{report.counts.review ? ` (dont ${n(report.counts.review)} à vérifier)` : ""} · {pl(report.counts.duplicate, "déjà importée")} · {pl(report.counts.skipped, "ignorée")}</T>
          {(() => { const m = Migration.measure(report); return <T variant="small" tone="muted">{n(m.explained)} / {n(m.total)} lignes importées ou expliquées ({m.rate} %)</T>; })()}
          {report.status === "withdrawn" ? Migration.withdrawText(report.withdraw_report).map((t) => <T key={t} variant="small" testID="history-withdrawn">{t}</T>) : null}
          <Segmented options={OUTCOMES.map((o) => ({ ...o }))} value={filter} onChange={(v) => openReport(report.id, v)} accessibilityLabel="Lignes du rapport" />
          {report.rows.slice(0, 200).map((r) => (
            <T key={r.row} variant="small" tone="muted">
              Ligne {r.row} · {Migration.OUTCOMES[r.outcome]}{r.session ? ` · ${Sports.label(r.session.sport)} · ${when(r.session.date)}` : ""}{r.reason ? ` · ${Migration.REASONS[r.reason] || r.reason}` : ""}
            </T>
          ))}
          <View style={{ flexDirection: "row", gap: space.s2 }}>
            <Button kind="secondary" label="Mes imports" onPress={() => { setReport(null); setFile(null); setBatch(null); loadBatches(); }} testID="history-back" />
            {report.status !== "withdrawn" ? <Button kind="danger" label="Retirer ce lot" onPress={withdraw} disabled={!online} testID="history-withdraw" /> : null}
          </View>
        </Card>
      ) : null}

      {!file && !report ? (
        <Card style={{ gap: 6 }} testID="history-batches">
          <T variant="bodyStrong">Mes imports</T>
          {batches === null ? <T variant="small" tone="muted">Chargement…</T> : !batches.length ? <T variant="small" tone="muted">Aucun import pour le moment.</T> : batches.map((b) => (
            <View key={b.id} style={{ gap: 4 }}>
              <T variant="small">{b.file_name || Migration.FORMATS[b.format]} · {STATUS[b.status]}{b.status === "open" ? ` (${n(b.done_rows)}/${n(b.total_rows)} lignes) : choisis à nouveau ce fichier pour reprendre` : ""}</T>
              <Button kind="ghost" small label="Rapport" onPress={() => openReport(b.id)} testID={`history-report-${b.id}`} />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
