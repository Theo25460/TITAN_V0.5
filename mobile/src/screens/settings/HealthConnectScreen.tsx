import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Sports } from "../../core";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { invalidateAfterSession } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { healthConnect, type Access, type Availability, type DaySteps, type SessionCandidate } from "../../lib/healthConnect";
import { useOnline } from "../../lib/network";

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const timeLabel = (iso: string) => new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
type Row = SessionCandidate & { minutesText: string; state: "idle" | "busy" | "imported" | "linked" | "duplicate" | "error" };

/** Android Health Connect: explicit consent, a reading only when the user taps, the last seven days, steps and exercise sessions only. Steps never create a session or a reward. */
export function HealthConnectScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const hc = healthConnect();
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [access, setAccess] = useState<Access>({ steps: false, exercise: false });
  const [consent, setConsent] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<DaySteps[] | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A change of account (or leaving the screen) cancels what is in flight: an answer is applied only for the account that asked.
  const live = useRef({ owner, mounted: true });
  live.current.owner = owner;
  useEffect(() => () => { live.current.mounted = false; }, []);
  const current = (asked: string) => live.current.mounted && live.current.owner === asked;

  const refresh = useCallback(async () => {
    const asked = owner;
    const [a, g] = await Promise.all([hc.availability(), hc.granted()]);
    let granted: boolean | null = null;
    try {
      const list = (await api.sourcesStatus()) as { source: string; granted: boolean }[];
      granted = Array.isArray(list) ? list.some((s) => s.source === "health_connect" && s.granted) : false;
    } catch { granted = null; }
    if (!current(asked)) return;
    setAvailability(a); setAccess(g); setConsent(granted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, hc]);
  useEffect(() => { setSteps(null); setRows(null); setNotice(null); setConsent(null); refresh(); }, [owner, refresh]);

  const run = async (job: (asked: string) => Promise<void>) => {
    if (busy) return;
    const asked = owner;
    setBusy(true); setNotice(null);
    try { await job(asked); } catch (e) { if (current(asked)) setNotice(errorMessage(e)); } finally { if (live.current.mounted) setBusy(false); }
  };

  const authorize = () => run(async (asked) => {
    const granted = await hc.request();
    if (!current(asked)) return;
    setAccess(granted);
    if (!granted.steps && !granted.exercise) { setNotice("Aucune autorisation donnée dans Santé Connect : rien n’est lu."); return; }
    await api.sourceConsent("health_connect", true);
    if (current(asked)) { setConsent(true); toast({ kind: "ok", title: "Santé Connect autorisé", message: "TITAN ne lit rien tant que tu n’appuies pas sur un bouton." }); }
  });

  const syncSteps = () => run(async (asked) => {
    const days = await hc.readSteps();
    if (!current(asked)) return;
    setSteps(days);
    let sent = 0;
    for (const d of days) { await api.importDailySteps(d.day, d.steps); if (!current(asked)) return; sent++; }
    invalidateAfterSession(qc, asked);
    toast({ kind: "ok", title: sent ? `${sent} jour${sent > 1 ? "s" : ""} de pas enregistré${sent > 1 ? "s" : ""}` : "Aucun pas trouvé", message: "Les pas ne créent ni séance, ni XP, ni récompense." });
  });

  const findSessions = () => run(async (asked) => {
    const list = await hc.readSessions();
    if (!current(asked)) return;
    setRows(list.map((s) => ({ ...s, minutesText: String(s.minutes), state: "idle" })));
  });

  const importRow = async (externalId: string) => {
    const asked = owner;
    const row = rows?.find((r) => r.externalId === externalId);
    if (!row || row.state === "busy") return;
    const minutes = Math.round(Number(row.minutesText.replace(",", ".")));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) { setRows((rs) => rs && rs.map((r) => (r.externalId === externalId ? { ...r, state: "error" } : r))); return; }
    setRows((rs) => rs && rs.map((r) => (r.externalId === externalId ? { ...r, state: "busy" } : r)));
    try {
      const res = await api.importActivity({ externalId, sport: row.sport, startedAt: row.startedAt, minutes });
      if (!current(asked)) return;
      setRows((rs) => rs && rs.map((r) => (r.externalId === externalId ? { ...r, state: res.status } : r)));
      invalidateAfterSession(qc, asked);
    } catch (e) {
      if (!current(asked)) return;
      setRows((rs) => rs && rs.map((r) => (r.externalId === externalId ? { ...r, state: "error" } : r)));
      setNotice(errorMessage(e));
    }
  };

  const stop = () => run(async (asked) => {
    await api.sourceConsent("health_connect", false);
    try { await hc.revoke(); } catch { /* the system screen stays available below */ }
    if (!current(asked)) return;
    setConsent(false); setAccess({ steps: false, exercise: false }); setSteps(null); setRows(null);
    toast({ kind: "ok", title: "Synchronisation arrêtée", message: "Tes séances déjà importées restent dans le journal : tu peux les archiver ci-dessous." });
  });

  const archive = () => run(async (asked) => {
    const n = (await api.archiveImported("health_connect")) as unknown as number;
    if (!current(asked)) return;
    invalidateAfterSession(qc, asked);
    toast({ kind: "ok", title: `${Number(n) || 0} séance${Number(n) > 1 ? "s" : ""} archivée${Number(n) > 1 ? "s" : ""}` });
  });

  if (availability === null) return <Screen><T tone="muted">Vérification de Santé Connect…</T></Screen>;
  if (availability === "unsupported") return <Screen><T>Santé Connect n’est disponible que dans l’application Android.</T></Screen>;
  if (availability === "unavailable") return <Screen><Card style={{ gap: 8 }}><T variant="bodyStrong">Santé Connect n’est pas disponible sur ce téléphone</T><T variant="small">Il faut Android 9 ou plus avec l’application Santé Connect. Tu peux continuer à saisir tes séances à la main.</T></Card></Screen>;
  if (availability === "update_required") return <Screen><Card style={{ gap: 8 }}><T variant="bodyStrong">Mets à jour Santé Connect</T><T variant="small">TITAN a besoin d’une version plus récente de Santé Connect.</T><Button label="Ouvrir Santé Connect" kind="secondary" onPress={() => hc.openSettings()} /></Card></Screen>;

  const connected = consent === true && (access.steps || access.exercise);
  return (
    <Screen>
      <Card style={{ gap: 8 }}>
        <T variant="bodyStrong">Ce que TITAN lit, seulement quand tu le demandes</T>
        <T variant="small">Tes pas et tes séances d’exercice des 7 derniers jours. Rien en arrière-plan, ni fréquence cardiaque, sommeil, poids, calories ou position. Rien n’est envoyé aux statistiques ni à la publicité.</T>
        <T variant="small">Les pas s’affichent, sans jamais créer de séance, d’XP ni de récompense. Une séance importée passe par les mêmes règles que celles saisies à la main : aucune récompense en plus.</T>
      </Card>
      {!connected ? (
        <Button label="Autoriser la lecture dans Santé Connect" onPress={authorize} loading={busy} disabled={!online} testID="hc-authorize" accessibilityHint="Android te demande ensuite ton accord pour les pas et les séances" />
      ) : (
        <>
          <Section title="Mes pas">
            <Button label="Synchroniser mes pas (7 jours)" kind="secondary" onPress={syncSteps} loading={busy} disabled={!access.steps || !online} testID="hc-steps" />
            {!access.steps ? <T variant="caption" tone="warn">L’accès aux pas n’est pas accordé dans Santé Connect.</T> : null}
            {steps ? (steps.length ? steps.map((d) => <T key={d.day} variant="small">{`${dayLabel(d.day)} · ${d.steps.toLocaleString("fr-FR")} pas`}</T>) : <T variant="small" tone="muted">Aucun pas trouvé sur les 7 derniers jours.</T>) : null}
          </Section>
          <Section title="Mes séances">
            <Button label="Chercher mes séances (7 jours)" kind="secondary" onPress={findSessions} loading={busy} disabled={!access.exercise || !online} testID="hc-sessions" />
            {!access.exercise ? <T variant="caption" tone="warn">L’accès aux séances n’est pas accordé dans Santé Connect.</T> : null}
            {rows ? (rows.length ? rows.map((r) => (
              <Card key={r.externalId} style={{ gap: 8 }} testID={`hc-row-${r.externalId}`}>
                <T variant="bodyStrong">{`${Sports.label(r.sport)}${r.title ? ` · ${r.title}` : ""}`}</T>
                <T variant="small">{timeLabel(r.startedAt)}</T>
                {r.state === "imported" || r.state === "linked" || r.state === "duplicate" ? (
                  <T variant="small" tone="ok">{r.state === "imported" ? "Importée dans ton journal." : r.state === "linked" ? "Déjà dans ton journal : rapprochée, comptée une seule fois." : "Déjà importée."}</T>
                ) : (
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-end" }}>
                    <Field compact label="Durée (min)" keyboardType="numeric" value={r.minutesText} onChangeText={(v) => setRows((rs) => rs && rs.map((x) => (x.externalId === r.externalId ? { ...x, minutesText: v, state: "idle" } : x)))} error={r.state === "error" ? "Entre 1 et 1 440 minutes" : null} testID={`hc-minutes-${r.externalId}`} />
                    <Button label="Importer" small onPress={() => importRow(r.externalId)} loading={r.state === "busy"} disabled={!online} testID={`hc-import-${r.externalId}`} />
                  </View>
                )}
              </Card>
            )) : <T variant="small" tone="muted">Aucune séance reconnue sur les 7 derniers jours (running, marche, vélo, natation, randonnée, yoga, pilates, rameur, danse, elliptique, musculation).</T>) : null}
          </Section>
          <Section title="Arrêter">
            <Button label="Arrêter la synchronisation" kind="danger" onPress={stop} loading={busy} testID="hc-stop" />
            <Button label="Archiver les séances importées" kind="ghost" onPress={archive} loading={busy} testID="hc-archive" accessibilityHint="Les retire du journal sans les supprimer" />
          </Section>
        </>
      )}
      {consent === false || !connected ? null : <Button label="Gérer dans Santé Connect" kind="ghost" small onPress={() => hc.openSettings()} />}
      {notice ? <T variant="small" tone="warn" testID="hc-notice">{notice}</T> : null}
      {!online ? <T variant="caption" tone="warn">Hors ligne : la synchronisation se fait avec une connexion.</T> : null}
    </Screen>
  );
}
