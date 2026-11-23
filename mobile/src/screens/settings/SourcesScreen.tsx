import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { ask } from "../../components/Dialog";
import { Group } from "../../components/ListRow";
import { Icon, type IconName } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Sources, Sports, type SourceAction, type SourceDevice, type SourceDiagnosis, type SourceEntry } from "../../core";
import * as api from "../../data/api";
import { useOwner } from "../../data/auth";
import { invalidateAfterSession } from "../../data/hooks";
import { useSteps } from "../../data/steps";
import { errorMessage } from "../../lib/errors";
import { healthConnect } from "../../lib/healthConnect";
import { readGarmin } from "../../lib/nativeConnections";
import { useOnline } from "../../lib/network";
import { importRead, readForResume, summaryText, type ReadResult, type SyncDeps } from "../../lib/sourceSync";
import { garminStatus, healthConnectStatus, ownCounterStatus, type SourceStatus } from "../../lib/sources";
import { colors, space } from "../../theme/tokens";

/** Title and status on one line, the explanation under them: a long name never gets squeezed by the status. */
function SourceRow({ icon, title, status, onPress, testID, last }: { icon: IconName; title: string; status: SourceStatus; onPress: () => void; testID: string; last?: boolean }) {
  return (
    <Tap onPress={onPress} testID={testID} accessibilityLabel={`${title}, ${status.label}. ${status.detail}`}>
      <View style={[styles.row, !last && styles.border]}>
        <View style={styles.icon}>
          <Icon name={icon} size={20} color={colors.cy} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.titleLine}>
            <T variant="bodyStrong" style={{ flexShrink: 1 }}>
              {title}
            </T>
            <Chip label={status.label} tone={status.tone} />
          </View>
          <T variant="small">{status.detail}</T>
        </View>
        <Icon name="chevron" size={18} color={colors.tx4} />
      </View>
    </Tap>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
type Resume = { source: "health_connect"; stage: "reading" | "ready" | "importing" | "done" | "blocked"; read?: Extract<ReadResult, { status: "read" }>; text?: string };

/** V1.6.5 — one source of the center: its state, what it really sends, where it stopped, and the action that matches. */
function SourceCard({ d, entry, busy, resume, onAction, onWithdraw, onArchive }: {
  d: SourceDiagnosis; entry: SourceEntry | null; busy: boolean; resume: Resume | null;
  onAction: (a: SourceAction) => void; onWithdraw: () => void; onArchive: () => void;
}) {
  const got = d.coverage.fields.filter((f) => f.covered).map((f) => f.label);
  const missing = d.coverage.fields.filter((f) => !f.covered && f.note).map((f) => `${f.label} (${f.note!.replace(/\.$/, "")})`);
  return (
    <Card style={{ gap: 8 }} testID={`center-${d.source}`}>
      <View style={styles.titleLine}>
        <T variant="bodyStrong" style={{ flexShrink: 1 }}>{d.name}</T>
        <View testID={`center-${d.source}-state-${d.state}`}><Chip label={d.label} tone={d.tone} /></View>
      </View>
      <T variant="small">{d.detail}</T>
      {d.kind !== "file_batch" ? (
        <View style={{ gap: 2 }}>
          <T variant="caption" tone="muted">{`Dernière réussite : ${d.lastSuccessText ?? "aucune"}${d.lastAttemptText && d.lastAttemptText !== d.lastSuccessText ? ` · dernière tentative : ${d.lastAttemptText}` : ""}`}</T>
          <T variant="caption" tone="muted">{`Reçu : ${got.join(", ")}`}</T>
          {missing.length ? <T variant="caption" tone="muted">{`Non transmis : ${missing.join(" ; ")}`}</T> : null}
          {d.coverage.sports.length ? <T variant="caption" tone="muted">{`Sports reçus : ${d.coverage.sports.map((s) => `${Sports.label(s.sport)} (${s.n})`).join(", ")}`}</T> : null}
          {d.exclusions.length ? <T variant="caption" tone="warn" testID={`center-${d.source}-excluded`}>{`Exclues à la dernière lecture : ${d.exclusions.map((x) => `${x.n} ${x.label}`).join(", ")}`}</T> : null}
          <T variant="caption" tone="muted">{d.replayNote}</T>
        </View>
      ) : null}
      {resume?.stage === "ready" && resume.read ? (
        <Card tone="flat" style={{ gap: 6, padding: space.s3 }} testID="center-resume-preview">
          <T variant="bodyStrong">{`Du ${day(resume.read.window.from)} au ${day(resume.read.window.to)}`}</T>
          <T variant="small">{`${resume.read.candidates.length} séance${resume.read.candidates.length > 1 ? "s" : ""} trouvée${resume.read.candidates.length > 1 ? "s" : ""} dans Santé Connect. Celles déjà dans ton journal ne seront pas importées de nouveau, et une séance que tu as corrigée reste telle quelle.`}</T>
          {Object.keys(resume.read.excluded).length ? <T variant="small" tone="warn">{`Exclues : ${Object.entries(resume.read.excluded).map(([k, n]) => `${n} ${Sources.EXCLUSIONS[k] ?? k}`).join(", ")}.`}</T> : null}
          {resume.read.window.unavailableBefore ? <T variant="small" tone="warn">{`Avant le ${day(resume.read.window.unavailableBefore)}, Santé Connect ne peut plus rien donner : saisis ces séances ou importe leur fichier.`}</T> : null}
          {!resume.read.complete ? <T variant="small" tone="warn">Plus de 1 000 enregistrements : la période n’a pas été lue jusqu’au bout. Reprends-la ensuite une seconde fois.</T> : null}
          {resume.read.candidates.length ? <Button label={`Importer les ${resume.read.candidates.length} séances`} onPress={() => onAction({ id: "import_read", label: "" })} loading={busy} testID="center-resume-import" /> : null}
        </Card>
      ) : null}
      {resume?.text ? <T variant="small" tone={resume.stage === "blocked" ? "warn" : "ok"} testID="center-resume-result">{resume.text}</T> : null}
      <View style={styles.actions}>
        {d.actions.map((a, i) => (
          <Button key={`${a.id}-${i}`} small kind={i === 0 ? "secondary" : "ghost"} label={a.id === "review" ? `${a.label} (${a.n})` : a.label} onPress={() => onAction(a)} loading={busy && a.id === "replay"} disabled={busy} testID={`center-${d.source}-${a.id}`} />
        ))}
        {entry?.consent?.granted && d.source === "health_connect" ? <Button small kind="ghost" label="Retirer l’accès" onPress={onWithdraw} disabled={busy} testID="center-health_connect-withdraw" /> : null}
        {entry?.consent?.granted && d.source === "garmin" ? <Button small kind="ghost" label="Gérer Garmin" onPress={() => onAction({ id: "connect_garmin", label: "" })} disabled={busy} testID="center-garmin-manage" /> : null}
        {d.counts.imported > 0 && (d.source === "health_connect" || d.source === "garmin") ? <Button small kind="ghost" label={`Archiver ce que ${d.name} a apporté`} onPress={onArchive} disabled={busy} testID={`center-${d.source}-archive`} /> : null}
      </View>
    </Card>
  );
}

/** Every way data reaches TITAN, with the same vocabulary and the same place (V12-43, V12-10), and since V1.6.5 the center of the
    connected sources: what each one really provides, where it stopped, and an explicit, bounded resume for Santé Connect. */
export function SourcesScreen() {
  const owner = useOwner();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const navigation = useNavigation() as unknown as { navigate: (n: string, p?: unknown) => void };
  const steps = useSteps();
  const hc = healthConnect();
  const garmin = useQuery({ queryKey: ["garmin", owner], queryFn: () => readGarmin(owner), retry: false });
  const center = useQuery({ queryKey: ["sourceCenter", owner], queryFn: () => api.sourceCenter(owner), retry: false });
  const device = useQuery({
    queryKey: ["hcDevice", owner],
    queryFn: async (): Promise<SourceDevice> => ({ availability: await hc.availability(), access: await hc.granted() }),
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState<Resume | null>(null);
  const scope = useMemo(() => ({ active: true }), [owner]);
  const latest = useRef(scope);
  latest.current = scope;
  const current = useCallback(() => latest.current === scope && scope.active, [scope]);
  useEffect(() => { scope.active = true; setResume(null); setBusy(false); return () => { scope.active = false; }; }, [scope]);

  const own = ownCounterStatus(steps.own);
  const hcSteps = healthConnectStatus(steps.connected, steps.view.lastUpdate);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["sourceCenter", owner] });
    void qc.invalidateQueries({ queryKey: ["hcDevice", owner] });
  };

  const data = center.data && Array.isArray(center.data.sources) ? center.data : null;
  const entryOf = (s: string) => data?.sources.find((x) => x.source === s) ?? null;
  // Garmin is listed once the account knows it or the server opened it (screens.garmin); never announced otherwise.
  const order: ("health_connect" | "garmin" | "archive")[] = ["health_connect", ...(entryOf("garmin") || garmin.data?.enabled ? ["garmin" as const] : []), "archive"];
  const list = data ? Sources.center(data, { now: Date.now(), device: device.data ?? null, here: true, order }) : [];

  const deps = (asked: string): SyncDeps => ({
    hc,
    consent: async () => {
      // Read again just before reading: a withdrawal on another device blocks this reading too.
      const fresh = await api.sourceCenter(asked, current);
      const c = fresh?.sources?.find((x) => x.source === "health_connect")?.consent;
      return c ? c.granted : null;
    },
    report: (run) => api.reportSourceRun(asked, run, current),
    importOne: (c) => api.importActivity(asked, { externalId: c.externalId, sport: c.sport, startedAt: c.startedAt, minutes: c.minutes }, current),
    newId: randomUUID,
    active: current,
  });

  const run = async (job: (asked: string) => Promise<void>) => {
    if (busy || !current()) return;
    setBusy(true);
    try { await job(owner); } catch (e) { if (current()) toast({ kind: "warn", title: "Action impossible", message: errorMessage(e) }); }
    finally { if (current()) { setBusy(false); refresh(); } }
  };

  const onAction = (d: SourceDiagnosis) => (a: SourceAction) => {
    if (a.id === "replay" && a.window) {
      const w = a.window;
      return run(async (asked) => {
        setResume({ source: "health_connect", stage: "reading" });
        const r = await readForResume(deps(asked), w, a.label === "Relire maintenant" ? "read" : "replay");
        if (!current()) return;
        if (r.status === "read") setResume({ source: "health_connect", stage: "ready", read: r });
        else setResume({ source: "health_connect", stage: "blocked", text: r.status === "withdrawn" ? "Santé Connect est retirée : rien n’a été lu." : r.status === "denied" ? "Android n’accorde plus la lecture à TITAN : rien n’a été lu." : r.status === "failed" ? `La lecture a échoué : ${Sources.ERRORS[r.code] ?? r.code}` : "Autorise d’abord Santé Connect." });
      });
    }
    if (a.id === "import_read" && resume?.read) {
      const read = resume.read;
      return run(async (asked) => {
        setResume({ ...resume, stage: "importing" });
        const s = await importRead(deps(asked), read);
        if (!current()) return;
        invalidateAfterSession(qc, asked);
        setResume({ source: "health_connect", stage: s.outcome === "partial" ? "blocked" : "done", text: summaryText(s) });
      });
    }
    if (a.id === "reauthorize") {
      return run(async () => {
        const granted = await hc.request();
        if (current()) toast({ kind: granted.exercise ? "ok" : "warn", title: granted.exercise ? "Accès rétabli" : "Accès toujours refusé", message: granted.exercise ? "Tu peux reprendre la période manquante." : "Android n’a pas accordé la lecture des séances." });
      });
    }
    if (a.id === "open_settings" || a.id === "update") return hc.openSettings();
    if (a.id === "authorize") return navigation.navigate("HealthConnect");
    if (a.id === "connect_garmin" || a.id === "finish_garmin") return navigation.navigate("Garmin");
    if (a.id === "review") return navigation.navigate("Journal");
    if (a.id === "resume_batch" || a.id === "open_import") return navigation.navigate("HistoryImport");
    return undefined;
  };

  const withdraw = (d: SourceDiagnosis) => async () => {
    const lines = Sources.withdrawText(d.source, entryOf(d.source));
    if (!(await ask(`Retirer ${d.name} ?`, lines.join("\n\n"), { confirmLabel: "Retirer l’accès", cancelLabel: "Annuler" }))) return;
    await run(async (asked) => {
      await api.sourceConsent(asked, "health_connect", false, current);
      try { await hc.revoke(); } catch { /* the Android screen stays available */ }
      if (current()) { setResume(null); toast({ kind: "ok", title: "Santé Connect retirée", message: "Plus rien n’est lu. Tes séances déjà importées restent dans ton journal : tu peux les archiver." }); }
    });
  };
  const archive = (d: SourceDiagnosis) => () => run(async (asked) => {
    const n = await api.archiveImported(asked, d.source as "health_connect" | "garmin", current);
    if (!current()) return;
    invalidateAfterSession(qc, asked);
    toast({ kind: "ok", title: `${Number(n) || 0} séance${Number(n) > 1 ? "s" : ""} archivée${Number(n) > 1 ? "s" : ""}` });
  });

  const gm = garminStatus(garmin.data, !!garmin.error);
  return (
    <Screen>
      <T tone="muted">Tes pas et tes activités peuvent arriver de plusieurs sources. Tu choisis lesquelles, et tu peux les retirer quand tu veux.</T>
      <Group title="Pas">
        <SourceRow icon="run" title="Compteur TITAN" status={own} onPress={() => navigation.navigate("Steps")} testID="source-own" />
        <SourceRow icon="heart" title="Santé Connect" status={hcSteps} onPress={() => navigation.navigate("HealthConnect")} testID="source-hc" last />
      </Group>
      {data ? (
        <View style={{ gap: space.s3 }} testID="source-center">
          <T variant="h3">Centre des sources</T>
          <T variant="small" tone="muted">Ce que chaque source fournit vraiment, où elle s’est arrêtée et comment reprendre. « Connecté » n’est dit que pour un accès qui fonctionne.</T>
          {list.map((d) => (
            <SourceCard key={d.source} d={d} entry={entryOf(d.source)} busy={busy || !online} resume={resume?.source === d.source ? resume : null}
              onAction={onAction(d)} onWithdraw={withdraw(d)} onArchive={archive(d)} />
          ))}
          {!online ? <T variant="caption" tone="warn">Hors ligne : la reprise se fait avec une connexion.</T> : null}
        </View>
      ) : (
        <>
          <Group title="Activités">
            <SourceRow icon="cloud" title="Garmin" status={gm} onPress={() => navigation.navigate("Garmin")} testID="source-garmin" />
            <SourceRow icon="upload" title="Importer mon historique" status={{ label: "Archive Strava", tone: "default", detail: "Toutes tes anciennes séances dans ton journal, en historique." }} onPress={() => navigation.navigate("HistoryImport")} testID="source-history" last />
          </Group>
          {center.error ? <T variant="caption" tone="muted" testID="source-center-closed">Le suivi des synchronisations n’est pas encore ouvert sur le serveur.</T> : null}
        </>
      )}
      <Group title="Fichiers">
        <SourceRow icon="route" title="Parcours GPS" status={{ label: "Sur ton compte, en privé", tone: "default", detail: "Tes sorties enregistrées avec le GPS sont gardées sur ton compte, visibles de toi seul." }} onPress={() => navigation.navigate("Routes")} testID="source-gps" last />
      </Group>
      <Card tone="flat" style={styles.note}>
        <T variant="bodyStrong">Autorisé, reçu, intégré</T>
        <T variant="small">Autoriser une source ne veut pas dire que des données sont arrivées, et des données reçues ne sont pas encore dans ton journal. TITAN le dit toujours séparément, et ne compte jamais deux fois le même effort.</T>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { gap: 6, padding: space.s4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingHorizontal: space.s4, paddingVertical: space.s3, minHeight: 64 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.line },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.cySoft, alignItems: "center", justifyContent: "center" },
  titleLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
