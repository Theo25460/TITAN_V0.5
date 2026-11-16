/* The sport view of a live session: one panel per kind of practice. Big targets (≥ 56 dp) because hands are sweaty and
   eyes are busy; nothing here asks for a tap while the safety class forbids it (the screen says why instead). */
import { useState } from "react";
import { View } from "react-native";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { Tap } from "../../components/Pressable";
import { T } from "../../components/Text";
import { Format, Sports } from "../../core";
import type { LiveConfig, LiveInput, LiveView } from "../../core/live";
import { colors, radius, space } from "../../theme/tokens";

export type PanelProps = { view: LiveView; config: LiveConfig; send: (input: LiveInput) => void; known: string[] };

export const clock = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
};

function BigTap({ label, sub, onPress, tone = "default", testID, disabled }: { label: string; sub?: string; onPress: () => void; tone?: "default" | "accent" | "muted"; testID?: string; disabled?: boolean }) {
  const bg = tone === "accent" ? colors.cySoft : colors.bg2;
  const border = tone === "accent" ? colors.cyLine : colors.line2;
  return (
    <Tap onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={sub ? `${label}, ${sub}` : label} accessibilityState={{ disabled: !!disabled }} testID={testID}
      style={{ flex: 1, minHeight: 72, borderRadius: radius.r3, backgroundColor: bg, borderWidth: 1, borderColor: border, padding: space.s3, justifyContent: "center", alignItems: "center", opacity: disabled ? 0.45 : 1 }}>
      <T variant="title" center>{label}</T>
      {sub ? <T variant="caption" tone="muted" center>{sub}</T> : null}
    </Tap>
  );
}

function Locked({ view }: { view: LiveView }) {
  if (view.tapsAllowed) return null;
  return <T variant="small" tone="muted" center>Pendant l’effort, rien à toucher. Mets en pause pour noter, ou note tout à la fin.</T>;
}

/** Endurance with a route: distance, pace or speed, elevation; the trail does the rest. */
export function RoutePanel({ view, config }: PanelProps) {
  const km = view.gps.distanceM / 1000;
  const minutes = view.activeS / 60;
  const pace = km > 0.05 ? (Sports.paceMode(config.sport) === "pace" ? Format.pace(km, minutes) : `${((km / Math.max(minutes, 0.1)) * 60).toFixed(1).replace(".", ",")} km/h`) : "–";
  return (
    <View style={{ flexDirection: "row", gap: space.s3 }}>
      <Metric label="Distance" value={view.gps.available ? `${km.toFixed(2).replace(".", ",")} km` : "sans GPS"} />
      <Metric label={Sports.paceMode(config.sport) === "pace" ? "Allure moy." : "Vitesse moy."} value={view.gps.available ? pace : "–"} />
      <Metric label="Montée" value={view.gps.elevationM ? `${Math.round(view.gps.elevationM)} m` : "–"} />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line }}>
      <T variant="caption" tone="muted">{label}</T>
      <T variant="num">{value}</T>
    </View>
  );
}

/** Strength and bodyweight: one tap per set, rest as the cooling ember. */
export function SetsPanel({ view, config, send, known }: PanelProps) {
  const [exercise, setExercise] = useState(known[0] || "");
  const [reps, setReps] = useState("8");
  const [load, setLoad] = useState("");
  const [rir, setRir] = useState<number | null>(2);
  const hold = config.voie === "corps";
  const log = () => {
    const data: Record<string, unknown> = { exercise: exercise.trim().slice(0, 40) || "Exercice", reps: Number(reps.replace(",", ".")) || 0 };
    if (load) data.load = Number(load.replace(",", ".")) || 0;
    if (rir !== null) data.rir = rir;
    send({ type: "beat", kind: "set", data });
  };
  return (
    <View style={{ gap: space.s3 }}>
      {view.restLeftS !== null ? (
        <View style={{ alignItems: "center", gap: space.s1 }}>
          <T variant="eyebrow" tone={view.restLeftS > 0 ? "muted" : "accent"}>{view.restLeftS > 0 ? "La braise refroidit" : "Prêt pour la frappe suivante"}</T>
          <T variant="numLarge">{clock(view.restLeftS)}</T>
          <View style={{ flexDirection: "row", gap: space.s2 }}>
            <Chip label="+15 s" onPress={() => send({ type: "rest_start", targetS: (view.restLeftS ?? 0) + 15 })} />
            <Chip label="Passer" onPress={() => send({ type: "rest_start", targetS: 10 })} />
          </View>
        </View>
      ) : null}
      <Field label="Exercice" value={exercise} onChangeText={setExercise} placeholder={hold ? "Pompes, gainage…" : "Squat, développé couché…"} testID="live-exercise" />
      {known.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>{known.slice(0, 6).map((k) => <Chip key={k} label={k} selected={k === exercise} onPress={() => setExercise(k)} />)}</View> : null}
      <View style={{ flexDirection: "row", gap: space.s2 }}>
        <View style={{ flex: 1 }}><Field compact label={hold ? "Répétitions ou secondes" : "Répétitions"} value={reps} onChangeText={setReps} keyboardType="number-pad" /></View>
        {!hold ? <View style={{ flex: 1 }}><Field compact label="Charge" value={load} onChangeText={setLoad} keyboardType="decimal-pad" suffix="kg" placeholder="–" /></View> : null}
      </View>
      <T variant="caption" tone="muted">Répétitions en réserve (une frappe nette en garde 1 à 3)</T>
      <View style={{ flexDirection: "row", gap: space.s2 }}>
        {[0, 1, 2, 3, 4].map((r) => <Chip key={r} label={r === 4 ? "4+" : String(r)} selected={rir === r} onPress={() => setRir(rir === r ? null : r)} />)}
      </View>
      <Button label={`Valider la ${config.beat.one}`} icon="check" onPress={log} testID="live-log-set" />
      <T variant="caption" tone="faint" center>{view.beats} {view.beatLabel}{view.planCount ? ` sur ${view.planCount} prévues` : ""}</T>
    </View>
  );
}

/** Climbing: between attempts only. */
export function WallPanel({ view, send }: PanelProps) {
  const [grade, setGrade] = useState("");
  const [project, setProject] = useState(false);
  const log = (result: "flash" | "send" | "fall") => send({ type: "beat", kind: "attempt", data: { result, grade: grade.trim().slice(0, 8), project } });
  return (
    <View style={{ gap: space.s3 }}>
      {view.restLeftS ? <T variant="small" tone="muted" center>Repos conseillé : encore {clock(view.restLeftS)}</T> : null}
      <View style={{ flexDirection: "row", gap: space.s2 }}>
        <View style={{ flex: 1 }}><Field compact label="Cotation (facultatif)" value={grade} onChangeText={setGrade} autoCapitalize="none" placeholder="6a, V3…" /></View>
        <View style={{ justifyContent: "flex-end" }}><Chip label="Projet" selected={project} onPress={() => setProject(!project)} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: space.s2 }}>
        <BigTap label="Flash" sub="du premier coup" onPress={() => log("flash")} tone="accent" testID="live-flash" />
        <BigTap label="Réussite" onPress={() => log("send")} testID="live-send" />
        <BigTap label="Chute" sub="prise révélée" onPress={() => log("fall")} testID="live-fall" />
      </View>
      <T variant="caption" tone="faint" center>{view.beats} {view.beatLabel} · {Number(view.fields.sends || 0)} réussites · {Number(view.fields.falls || 0)} prises révélées</T>
    </View>
  );
}

/** Rackets (points and games), teams (periods), precision (score per unit). */
export function ScorePanel({ view, config, send }: PanelProps) {
  const [score, setScore] = useState("");
  if (config.voie === "escouade") {
    return (
      <View style={{ gap: space.s3 }}>
        <Locked view={view} />
        <BigTap label={`${capital(config.beat.one)} terminée`} sub={`${view.beats}${view.planCount ? ` sur ${view.planCount}` : ""}`} onPress={() => send({ type: "beat", kind: "period" })} disabled={!view.tapsAllowed} testID="live-period" />
      </View>
    );
  }
  if (config.voie === "cible") {
    return (
      <View style={{ gap: space.s3 }}>
        <T variant="small" tone="muted" center>TITAN se tait pendant le tir. Note ta {config.beat.one} quand elle est terminée.</T>
        <Field label={`Score de la ${config.beat.one} (facultatif)`} value={score} onChangeText={setScore} keyboardType="decimal-pad" testID="live-end-score" />
        <Button label={`${capital(config.beat.one)} terminée`} icon="target" onPress={() => { const s = Number(score.replace(",", ".")); send({ type: "beat", kind: "end", data: Number.isFinite(s) && score ? { score: s } : {} }); setScore(""); }} testID="live-end" />
        <T variant="caption" tone="faint" center>{view.beats} {view.beatLabel} · constellation la plus longue : {Number(view.fields.steadyEnds || 0)}</T>
      </View>
    );
  }
  const won = Number(view.fields.pointsWon || 0), lost = Number(view.fields.pointsLost || 0);
  return (
    <View style={{ gap: space.s3 }}>
      <View style={{ flexDirection: "row", gap: space.s2 }}>
        <BigTap label={`Point pour moi · ${won}`} onPress={() => send({ type: "beat", kind: "point", data: { won: true } })} tone="accent" testID="live-point-won" />
        <BigTap label={`Point adverse · ${lost}`} onPress={() => send({ type: "beat", kind: "point", data: { won: false } })} testID="live-point-lost" />
      </View>
      <View style={{ flexDirection: "row", gap: space.s2 }}>
        <Button small kind="secondary" label={`${capital(config.beat.one)} gagnée`} onPress={() => send({ type: "beat", kind: "game", data: { won: true, trailing: lost > won } })} style={{ flex: 1 }} />
        <Button small kind="secondary" label={`${capital(config.beat.one)} perdue`} onPress={() => send({ type: "beat", kind: "game", data: { won: false } })} style={{ flex: 1 }} />
      </View>
      <T variant="caption" tone="faint" center>Facultatif : sans score, la séance se découpe en {config.beat.many} de 10 minutes.</T>
    </View>
  );
}

/** Combat rounds and intervals: the bell counts for you. Track and field: attempts with full recovery. */
export function RoundsPanel({ view, config, send }: PanelProps) {
  const [mark, setMark] = useState("");
  if (config.voie === "stade") {
    return (
      <View style={{ gap: space.s3 }}>
        {view.restLeftS ? <T variant="small" tone="muted" center>Récupération : encore {clock(view.restLeftS)} pour une tentative pleine</T> : null}
        <Field label="Marque (facultatif)" value={mark} onChangeText={setMark} keyboardType="decimal-pad" placeholder="12,4 s · 5,20 m" />
        <Button label="Tentative notée" icon="flag" onPress={() => { send({ type: "beat", kind: "attempt", data: mark ? { mark: Number(mark.replace(",", ".")) || 0 } : {} }); setMark(""); }} testID="live-attempt" />
      </View>
    );
  }
  const bell = view.bell;
  return (
    <View style={{ alignItems: "center", gap: space.s2 }}>
      {bell ? (
        <>
          <T variant="eyebrow" tone={bell.phase === "work" ? "accent" : "muted"}>{bell.phase === "work" ? `${capital(config.beat.one)} ${bell.round} sur ${bell.of}` : bell.phase === "rest" ? "Repos · rempart" : "Format terminé"}</T>
          <T variant="numLarge">{clock(bell.leftS)}</T>
        </>
      ) : <T tone="muted">Sans cloche : note tes {config.beat.many} à la fin.</T>}
      {config.voie === "dojo" ? <TechniqueNote send={send} /> : null}
    </View>
  );
}

function TechniqueNote({ send }: { send: PanelProps["send"] }) {
  const [t, setT] = useState("");
  return (
    <View style={{ alignSelf: "stretch", flexDirection: "row", gap: space.s2, alignItems: "flex-end" }}>
      <View style={{ flex: 1 }}><Field compact label="Technique travaillée (facultatif)" value={t} onChangeText={setT} placeholder="Jab-cross, o-soto-gari…" /></View>
      <Button small kind="secondary" label="Noter" onPress={() => { if (t.trim()) send({ type: "field", id: "technique_note", value: t.trim().slice(0, 40) }); setT(""); }} />
    </View>
  );
}

/** Mind-body (breath pacer) and stage practices (runs of a routine). */
export function FlowPanel({ view, config, send }: PanelProps) {
  if (config.voie === "scene") {
    return (
      <View style={{ flexDirection: "row", gap: space.s2 }}>
        <BigTap label="Passage complet" sub="sans arrêt" tone="accent" onPress={() => send({ type: "beat", kind: "routine", data: { clean: true } })} testID="live-routine-clean" />
        <BigTap label="Passage travaillé" sub="avec arrêts" onPress={() => send({ type: "beat", kind: "routine", data: { clean: false } })} testID="live-routine" />
      </View>
    );
  }
  const phase = view.activeS % 10 < 4 ? "Inspire" : "Expire";
  return (
    <View style={{ alignItems: "center", gap: space.s2, paddingVertical: space.s4 }}>
      <T variant="h2" tone="accent">{phase}</T>
      <T variant="caption" tone="muted">Guide facultatif : 4 temps pour inspirer, 6 pour expirer.</T>
    </View>
  );
}

/** Practices where TITAN stays silent: the timer runs, everything is noted afterwards. */
export function LogPanel({ config }: PanelProps) {
  return (
    <View style={{ gap: space.s2, padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.bg2 }}>
      <T variant="bodyStrong">{config.safetyLabel}</T>
      <T variant="small" tone="muted">{config.safetyWhy}</T>
      <T variant="small" tone="muted">Le chrono tourne même écran verrouillé. Tes {config.beat.many} se notent au retour.</T>
    </View>
  );
}

export function LegsPanel({ view, send }: PanelProps) {
  return <BigTap label="Segment suivant" sub={`segment ${view.beats + 1}`} onPress={() => send({ type: "beat", kind: "leg" })} disabled={!view.tapsAllowed} testID="live-leg" />;
}

export const PANELS = { route: RoutePanel, sets: SetsPanel, wall: WallPanel, score: ScorePanel, rounds: RoundsPanel, flow: FlowPanel, log: LogPanel, legs: LegsPanel } as const;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
