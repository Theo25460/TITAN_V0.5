import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { invalidateAfterSteps } from "../../data/steps";
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
  const scope = useMemo(() => ({ active: true, flight: null as object | null }), [owner]);
  const latest = useRef(scope);
  latest.current = scope;
  const current = useCallback(() => latest.current === scope && scope.active, [scope]);
  useEffect(() => {
    scope.active = true;
    return () => { scope.active = false; scope.flight = null; };
  }, [scope]);

  const refresh = useCallback(async () => {
    const [a, g] = await Promise.all([hc.availability(), hc.granted()]);
    if (!current()) return;
    let granted: boolean | null = null;
    try {
      const list = await api.sourcesStatus(owner);
      granted = Array.isArray(list) && list.some(s => s.source === "health_connect" && s.granted);
    } catch { granted = null; }
    if (!current()) return;
    setAvailability(a); setAccess(g); setConsent(granted);
  }, [owner, hc, current]);
  useEffect(() => {
    setBusy(false); setSteps(null); setRows(null); setNotice(null); setConsent(null);
    void refresh();
  }, [owner, refresh]);

  const run = async (job: (asked: string, active: () => boolean) => Promise<void>) => {
    if (!current() || scope.flight) return;
    const flight = {};
    scope.flight = flight;
    const active = () => current() && scope.flight === flight;
    setBusy(true); setNotice(null);
    try {
      await job(owner, active);
    } catch (e) {
      if (active()) setNotice(errorMessage(e));
    } finally {
      if (active()) { scope.flight = null; setBusy(false); }
    }
  };

  const authorize = () => run(async (asked, active) => {
    await api.assertOwner(asked);
    if (!active()) return;
    const granted = await hc.request();
    if (!active()) return;
    setAccess(granted);
    if (!granted.steps && !granted.exercise) { setNotice("Aucune autorisation donnée dans Santé Connect : rien n’est lu."); return; }
    await api.sourceConsent(asked, "health_connect", true, active);
    if (active()) { setConsent(true); toast({ kind: "ok", title: "Santé Connect autorisé", message: "Tes pas sont relus à l’ouverture de TITAN et quand tu actualises. Tu peux retirer l’accès à tout moment." }); }
  });

  const syncSteps = () => run(async (asked, active) => {
    await api.assertOwner(asked);
    if (!active()) return;
    const days = await hc.readSteps();
    if (!active()) return;
    setSteps(days);
    let sent = 0;
    try {
      for (const d of days) {
        if (!active()) return;
        await api.importDailySteps(asked, d.day, d.steps, active);
        sent++;
      }
      if (active()) toast({ kind: "ok", title: sent ? `${sent} jour${sent > 1 ? "s" : ""} de pas enregistré${sent > 1 ? "s" : ""}` : "Aucun pas trouvé", message: "Les pas ne créent ni séance, ni XP, ni récompense." });
    } finally {
      if (sent > 0) invalidateAfterSteps(qc, asked);
    }
  });

  const findSessions = () => run(async (asked, active) => {
    await api.assertOwner(asked);
    if (!active()) return;
    const list = await hc.readSessions();
    if (!active()) return;
    setRows(list.map((s) => ({ ...s, minutesText: String(s.minutes), state: "idle" })));
  });

  const importRow = async (externalId: string) => {
    const asked = owner;
    const row = rows?.find((r) => r.externalId === externalId);
    if (!current() || !row || row.state === "busy") return;
    const minutes = Math.round(Number(row.minutesText.replace(",", ".")));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) { setRows((rs) => rs && rs.map((r) => (r.externalId === externalId ? { ...r, state: "error" } : r))); return; }
    setRows((rs) => rs && rs.map((r) => (r.externalId === externalId ? { ...r, state: "busy" } : r)));
    try {
      const res = await api.importActivity(asked, { externalId, sport: row.sport, startedAt: row.startedAt, minutes }, current);
      if (!current()) return;
      setRows((rs) => rs && rs.map((r) => (r.externalId === externalId ? { ...r, state: res.status } : r)));
      invalidateAfterSession(qc, asked);
    } catch (e) {
      if (!current()) return;
      setRows((rs) => rs && rs.map((r) => (r.externalId === externalId ? { ...r, state: "error" } : r)));
      setNotice(errorMessage(e));
    }
  };

  const stop = () => run(async (asked, active) => {
    await api.sourceConsent(asked, "health_connect", false, active);
    await api.assertOwner(asked);
    if (!active()) return;
    try { await hc.revoke(); } catch { /* the system screen stays available below */ }
    if (!active()) return;
    setConsent(false); setAccess({ steps: false, exercise: false }); setSteps(null); setRows(null);
    toast({ kind: "ok", title: "Synchronisation arrêtée", message: "Tes séances déjà importées restent dans le journal : tu peux les archiver ci-dessous." });
  });

  const archive = () => run(async (asked, active) => {
    const n = await api.archiveImported(asked, "health_connect", active);
    if (!active()) return;
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
        <T variant="bodyStrong">Ce que TITAN lit, seulement avec ton accord</T>
        <T variant="small">Tes pas et tes séances d’exercice des 7 derniers jours. Une fois autorisés, tes pas sont relus à l’ouverture de TITAN (au plus toutes les 30 minutes) et quand tu appuies sur Actualiser ; tes séances, seulement quand tu les importes. Rien en arrière-plan, ni fréquence cardiaque, sommeil, poids, calories ou position. Rien n’est envoyé aux statistiques ni à la publicité.</T>
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
