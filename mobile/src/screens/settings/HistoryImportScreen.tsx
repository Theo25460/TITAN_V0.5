/* AUD-43: « Importer mon historique » — the activities.csv of a Strava export becomes past sessions in the journal (history: no XP,
   no credit), in batches of 50. When the daily history budget is reached, what remains is kept on the phone and resumes tomorrow. */
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ProgressBar } from "../../components/Progress";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format } from "../../core";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { keys } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { chunk, parseStravaActivities, type HistoryItem, type ParsedHistory } from "../../lib/historyImport";
import { useOnline } from "../../lib/network";
import { ownerKey, readJSON, writeJSON } from "../../lib/storage";
import { space } from "../../theme/tokens";

type Totals = { imported: number; linked: number; duplicate: number; skipped: number };

export function HistoryImportScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const store = ownerKey("historyImport", owner);
  const [parsed, setParsed] = useState<ParsedHistory | null>(null);
  const [queue, setQueue] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    readJSON<HistoryItem[]>(store, []).then((rest) => rest.length && setQueue(rest));
  }, [store]);

  async function pick() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "text/plain", "application/octet-stream"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];
      if ((file.size ?? 0) > 20 * 1024 * 1024) return toast({ kind: "warn", title: "Fichier trop lourd", message: "activities.csv doit faire moins de 20 Mo." });
      const p = parseStravaActivities(await FileSystem.readAsStringAsync(file.uri));
      setParsed(p);
      setQueue(p.items);
      setTotals(null);
      setPaused(false);
      setSent(0);
    } catch (e) {
      toast({ kind: "err", title: "Lecture impossible", message: errorMessage(e) });
    }
  }

  async function run() {
    if (!queue.length || busy) return;
    setBusy(true);
    setPaused(false);
    const acc: Totals = totals ?? { imported: 0, linked: 0, duplicate: 0, skipped: 0 };
    let rest = queue.slice();
    try {
      for (const batch of chunk(queue, 50)) {
        const r = await api.importHistory(owner, batch);
        acc.imported += r.imported; acc.linked += r.linked; acc.duplicate += r.duplicate; acc.skipped += r.skipped;
        rest = rest.slice(r.done);
        setSent((n) => n + r.done);
        setTotals({ ...acc });
        await writeJSON(store, rest);
        if (r.limited) {
          setPaused(true);
          break;
        }
      }
      setQueue(rest);
      if (!rest.length) toast({ kind: "ok", title: "Historique importé", message: `${Format.number(acc.imported)} séances ajoutées à ton journal.` });
    } catch (e) {
      setQueue(rest);
      toast({ kind: "err", title: "Import interrompu", message: `${errorMessage(e)} Ce qui reste est gardé : tu pourras reprendre.` });
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: keys.logs(owner) });
    }
  }

  const total = sent + queue.length;
  return (
    <Screen>
      <T tone="muted">Amène toute ta vie sportive dans TITAN : tes Rétros, tes souvenirs et ton livre d’or des records se remplissent dès aujourd’hui. Les séances importées entrent comme historique : sans XP ni crédit, comptées une seule fois.</T>
      <Card style={{ gap: space.s2 }}>
        <T variant="bodyStrong">Depuis Strava</T>
        <T variant="small">Sur strava.com : Paramètres › Mon compte › Télécharger ou supprimer votre compte › Demander une archive. Dans le fichier reçu, choisis activities.csv.</T>
        <Button kind="secondary" icon="upload" label="Choisir activities.csv" onPress={pick} disabled={busy} testID="history-pick" />
      </Card>
      {parsed ? (
        <Card style={{ gap: 6 }} testID="history-summary">
          <T variant="bodyStrong">{Format.number(parsed.items.length)} séances prêtes à importer</T>
          {parsed.recent ? <T variant="small">{parsed.recent} des 30 derniers jours laissées de côté (ajoute-les via Santé Connect ou à la main).</T> : null}
          {parsed.unknown ? <T variant="small">{parsed.unknown} d’un type non reconnu laissées de côté.</T> : null}
          {parsed.invalid ? <T variant="small">{parsed.invalid} illisibles laissées de côté.</T> : null}
        </Card>
      ) : null}
      {queue.length || totals ? (
        <Card style={{ gap: space.s2 }}>
          {total ? <ProgressBar value={sent / Math.max(1, total)} accessibilityLabel="Import de l’historique" /> : null}
          {totals ? <T variant="small">{Format.number(totals.imported)} ajoutées · {Format.number(totals.linked)} déjà dans ton journal · {Format.number(totals.duplicate)} déjà importées</T> : null}
          {paused ? <T variant="small" tone="warn">Limite du jour atteinte ({Format.number(queue.length)} restantes). Reprends demain : tout est gardé sur ce téléphone.</T> : null}
          {queue.length ? <Button label={sent ? `Reprendre l’import (${Format.number(queue.length)} restantes)` : `Importer ${Format.number(queue.length)} séances`} loading={busy} disabled={!online} onPress={run} testID="history-run" /> : <T variant="bodyStrong">Import terminé.</T>}
        </Card>
      ) : null}
    </Screen>
  );
}
