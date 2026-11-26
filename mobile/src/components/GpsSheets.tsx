/* V1.7.7 — the sheets of the GPS outing: the « Plus » menu, back to the start, a personal point, the goal, the structured session
   and the settings. Each one says what it does and what it cannot do: no computed road is promised where none is wired, a way
   back is the athlete's own trace walked backwards, an estimate is a range. Nothing here prescribes an intensity, nothing speaks. */
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { GpsEngine, GpsNav, GpsSession, type GpsAnalysis, type GpsFieldKey, type GpsGoal, type GpsStep, type GpsStepInput } from "../core";
import { fieldsFor, type GpsPrefs } from "../lib/gpsPrefs";
import { backtrackOf, type Recording } from "../lib/gpsRecorder";
import { PLACE_KINDS, type PlaceKind } from "../lib/places";
import { tilesConfigured } from "../lib/tiles";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Field } from "./Field";
import { ListRow } from "./ListRow";
import { Segmented } from "./Segmented";
import { Sheet } from "./Sheet";
import { T } from "./Text";
import { ToggleRow } from "./Toggle";

export type GpsSheetName = "more" | "back" | "place" | "goal" | "plan" | "settings";
type SheetProps = { visible: boolean; onClose: () => void };
const group = { backgroundColor: colors.bg3, borderRadius: radius.r3, overflow: "hidden" } as const;
const block = { backgroundColor: colors.bg3, borderRadius: radius.r3, padding: space.s4, gap: space.s2 } as const;
const num = (s: string) => {
  const n = Number(String(s).replace(",", ".").trim());
  return String(s).trim() !== "" && Number.isFinite(n) ? n : null;
};
const minutesRange = (lowS: number, highS: number) => {
  const lo = Math.max(1, Math.round(lowS / 60)), hi = Math.max(lo, Math.round(highS / 60));
  return hi >= 100 ? `${GpsSession.span(lowS)} à ${GpsSession.span(highS)}` : lo === hi ? `${lo} min` : `${lo}–${hi} min`;
};

/* ---- Plus ---- */
export function GpsMoreSheet({ visible, onClose, onPick, backOn }: SheetProps & { onPick: (s: GpsSheetName) => void; backOn: boolean }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Plus">
      <View style={group}>
        <ListRow icon="flag" title="Retour au départ" subtitle={backOn ? "Retour par le même chemin en cours" : "Par le même chemin, ou la direction à vol d’oiseau"} onPress={() => onPick("back")} testID="gps-more-back" />
        <ListRow icon="pin" title="Ajouter un point ici" subtitle="Point d’eau, abri, réparation… pour toi seul" onPress={() => onPick("place")} testID="gps-more-place" />
        <ListRow icon="target" title="Objectif" subtitle="Distance, durée ou heure de retour" onPress={() => onPick("goal")} testID="gps-more-goal" />
        <ListRow icon="timer" title="Séance structurée" subtitle="Échauffement, répétitions, retour au calme" onPress={() => onPick("plan")} testID="gps-more-plan" />
        <ListRow icon="settings" title="Réglages" subtitle="Pause automatique, chiffres affichés, carte, voix" onPress={() => onPick("settings")} testID="gps-more-settings" last />
      </View>
    </Sheet>
  );
}

/* ---- Retour au départ ---- */
export function GpsBackSheet({ visible, onClose, rec, analysis, onToggle, busy }: SheetProps & { rec: Recording; analysis: GpsAnalysis; onToggle: (on: boolean) => void; busy: boolean }) {
  const last = rec.track.segs.at(-1)?.at(-1) ?? null;
  const points = rec.track.segs.reduce((n, s) => n + s.length, 0);
  // Computed when the sheet opens (and when the trace grew), not at every tick of the clock.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const way = useMemo(() => (visible && last ? backtrackOf(rec, last.t) : null), [visible, points, last?.t]);
  const first = rec.track.segs.find((s) => s.length)?.[0] ?? null;
  const here = rec.live && Number.isFinite(rec.live.lat) && Number.isFinite(rec.live.lon) && (rec.live.acc ?? 0) <= GpsEngine.MAX_ACCURACY_M ? { lat: rec.live.lat as number, lon: rec.live.lon as number } : last;
  const straight = first && here ? GpsNav.straight(here, first) : null;
  const eta = way ? GpsNav.eta(way.route.distanceM, analysis) : null;
  const on = !!rec.back;
  return (
    <Sheet visible={visible} onClose={onClose} title="Retour au départ">
      <View style={block} testID="gps-back-same">
        <T variant="title">Par le même chemin</T>
        <T tone="muted">TITAN te fait suivre, à l’envers, la trace que tu viens d’enregistrer : le chemin que tu as réellement pris, pas une route calculée.</T>
        {way ? (
          <>
            <T>Distance par ce chemin : {GpsSession.km(way.route.distanceM)} km</T>
            <T tone="muted">{eta ? `Temps estimé : ${minutesRange(eta.lowS, eta.highS)}, à ton rythme en mouvement, hors arrêts ; le relief n’est pas pris en compte.` : "Temps estimé disponible après 5 min de mouvement."}</T>
            {way.holes > 0 ? <T variant="small" tone="warn">{way.holes} trou{way.holes > 1 ? "s" : ""} non enregistré{way.holes > 1 ? "s" : ""} (pause ou signal perdu), environ {GpsSession.km(way.holesStraightM)} km à vol d’oiseau : le chemin entre les tronçons n’est pas connu et n’est pas dessiné.</T> : null}
            <Button label={on ? "Arrêter le retour guidé" : "Suivre ce chemin"} kind={on ? "secondary" : "primary"} icon={on ? "close" : "flag"} disabled={busy} onPress={() => onToggle(!on)} testID={on ? "gps-back-off" : "gps-back-on"} />
          </>
        ) : (
          <T tone="muted">Pas encore assez de trace enregistrée pour revenir sur tes pas.</T>
        )}
      </View>
      <View style={block} testID="gps-back-routed">
        <T variant="title">Itinéraire calculé</T>
        <T tone="muted">Calcul d’itinéraire indisponible ici : il demande une connexion et un service de routage configuré.</T>
      </View>
      {straight ? <T tone="muted" testID="gps-back-straight">Départ à {straight.distanceM < 1000 ? `${straight.distanceM} m` : `${GpsSession.km(straight.distanceM)} km`} à vol d’oiseau, direction {straight.cardinal} — indication, pas un chemin.</T> : <T tone="muted">Le point de départ sera connu dès la première position fiable.</T>}
      <T variant="small" tone="faint">Indication seulement : TITAN ne garantit ni l’état ni la sécurité du chemin.</T>
    </Sheet>
  );
}

/* ---- Ajouter un point ---- */
export function GpsPlaceSheet({ visible, onClose, position, onAdd, busy }: SheetProps & { position: { lat: number; lon: number; acc: number | null } | null; onAdd: (name: string, kind: PlaceKind) => void; busy: boolean }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PlaceKind>("water");
  useEffect(() => {
    if (visible) { setName(""); setKind("water"); }
  }, [visible]);
  const clean = name.replace(/\s+/g, " ").trim();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Ajouter un point ici"
      footer={<Button label="Ajouter ce point" icon="pin" disabled={!clean || !position || busy} onPress={() => onAdd(clean, kind)} testID="gps-place-add" />}
    >
      {position ? (
        <T tone="muted">Le point est posé sur ta dernière position fiable{position.acc !== null ? ` (± ${Math.round(position.acc)} m)` : ""}.</T>
      ) : (
        <T tone="warn" accessibilityRole="alert">Aucune position fiable pour l’instant : attends que le GPS te situe pour poser un point.</T>
      )}
      <Field label="Nom du point" value={name} onChangeText={setName} maxLength={60} placeholder="Fontaine du col" testID="gps-place-name" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }} accessibilityRole="radiogroup" accessibilityLabel="Type de point">
        {(Object.keys(PLACE_KINDS) as PlaceKind[]).map((k) => <Chip key={k} label={PLACE_KINDS[k]} selected={kind === k} onPress={() => setKind(k)} testID={`gps-place-kind-${k}`} />)}
      </View>
      <T variant="small" tone="faint">Privé : ce point reste sur ton téléphone et ton compte. Il n’est jamais partagé.</T>
    </Sheet>
  );
}

/* ---- Objectif ---- */
type GoalKind = "none" | GpsGoal["kind"];
const two = (n: number) => String(n).padStart(2, "0");
/** The goal typed in the sheet, or the reason it cannot be used. « Être rentré pour » is today at that hour, or tomorrow when it has passed. */
export function goalFromInput(kind: GoalKind, v: { km: string; hours: string; minutes: string; hh: string; mm: string }, now = Date.now()): { goal: GpsGoal | null; error: string | null } {
  if (kind === "none") return { goal: null, error: null };
  if (kind === "distance") {
    const goal = GpsSession.goalOf({ kind, km: num(v.km) });
    return goal ? { goal, error: null } : { goal: null, error: "Indique une distance entre 0,1 et 1 000 km." };
  }
  if (kind === "time") {
    const goal = GpsSession.goalOf({ kind, minutes: (num(v.hours) ?? 0) * 60 + (num(v.minutes) ?? 0) });
    return goal ? { goal, error: null } : { goal: null, error: "Indique une durée entre 1 min et 24 h." };
  }
  const h = num(v.hh), m = num(v.mm) ?? 0;
  if (h === null || !Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) return { goal: null, error: "Indique une heure valide, par exemple 18 h 30." };
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return { goal: { kind: "return", at: at.getTime() }, error: null };
}

export function GpsGoalSheet({ visible, onClose, goal, onChange, planned }: SheetProps & { goal: GpsGoal | null; onChange: (g: GpsGoal | null) => void; planned?: { goal: GpsGoal; label: string } | null }) {
  const [kind, setKind] = useState<GoalKind>("none");
  const [v, setV] = useState({ km: "", hours: "", minutes: "", hh: "", mm: "" });
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setTried(false);
    setKind(goal?.kind ?? "none");
    const at = goal?.kind === "return" ? new Date(goal.at) : null;
    setV({
      km: goal?.kind === "distance" ? String(goal.km).replace(".", ",") : "",
      hours: goal?.kind === "time" && goal.minutes >= 60 ? String(Math.floor(goal.minutes / 60)) : "",
      minutes: goal?.kind === "time" ? String(goal.minutes % 60) : "",
      hh: at ? String(at.getHours()) : "",
      mm: at ? two(at.getMinutes()) : "",
    });
  }, [visible, goal]);
  const parsed = goalFromInput(kind, v);
  const apply = () => {
    setTried(true);
    if (parsed.error) return;
    onChange(parsed.goal);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Objectif" footer={<Button label={kind === "none" ? "Sortie sans objectif" : "Valider l’objectif"} icon="check" onPress={apply} testID="gps-goal-apply" />}>
      <T tone="muted">Facultatif. Un objectif ne change rien à l’enregistrement : il affiche où tu en es.</T>
      {planned ? (
        <View style={block}>
          <T variant="bodyStrong">{planned.label}</T>
          <T variant="small" tone="muted">D’après ta semaine planifiée, pour ce sport.</T>
          <Button small kind="secondary" label="Utiliser comme objectif" onPress={() => { onChange(planned.goal); onClose(); }} testID="gps-goal-planned" />
        </View>
      ) : null}
      <Segmented<GoalKind> accessibilityLabel="Type d’objectif" value={kind} onChange={setKind} options={[{ value: "none", label: "Aucun" }, { value: "distance", label: "Distance" }, { value: "time", label: "Durée" }, { value: "return", label: "Retour" }]} />
      {kind === "distance" ? <Field label="Distance visée" value={v.km} onChangeText={(km) => setV({ ...v, km })} keyboardType="decimal-pad" suffix="km" placeholder="20" testID="gps-goal-km" /> : null}
      {kind === "time" ? (
        <>
          <View style={{ flexDirection: "row", gap: space.s2 }}>
            <Field compact label="Heures" value={v.hours} onChangeText={(hours) => setV({ ...v, hours })} keyboardType="number-pad" suffix="h" placeholder="1" testID="gps-goal-hours" />
            <Field compact label="Minutes" value={v.minutes} onChangeText={(minutes) => setV({ ...v, minutes })} keyboardType="number-pad" suffix="min" placeholder="30" testID="gps-goal-minutes" />
          </View>
          <T variant="small" tone="faint">Compté sur le temps en mouvement (ou avec les arrêts si la pause automatique est désactivée).</T>
        </>
      ) : null}
      {kind === "return" ? (
        <>
          <View style={{ flexDirection: "row", gap: space.s2 }}>
            <Field compact label="Être rentré pour" value={v.hh} onChangeText={(hh) => setV({ ...v, hh })} keyboardType="number-pad" suffix="h" placeholder="18" testID="gps-goal-hh" />
            <Field compact label="Minutes" value={v.mm} onChangeText={(mm) => setV({ ...v, mm })} keyboardType="number-pad" suffix="min" placeholder="30" testID="gps-goal-mm" />
          </View>
          <T variant="small" tone="faint">{parsed.goal?.kind === "return" ? `Retour visé : ${new Date(parsed.goal.at).toDateString() === new Date().toDateString() ? "aujourd’hui" : "demain"} à ${GpsSession.hhmm(parsed.goal.at)}. ` : ""}TITAN compare le temps qu’il reste au retour par le même chemin, à ton rythme : une estimation, garde une marge.</T>
        </>
      ) : null}
      {tried && parsed.error ? <T tone="err" accessibilityRole="alert">{parsed.error}</T> : null}
    </Sheet>
  );
}

/* ---- Séance structurée ---- */
export type PlanPart = { by: "none" | GpsStepInput["by"]; text: string };
export type PlanForm = { warmup: PlanPart; reps: string; work: PlanPart; recover: PlanPart; cooldown: PlanPart; alerts: boolean };
export const EMPTY_PLAN_FORM: PlanForm = { warmup: { by: "none", text: "" }, reps: "1", work: { by: "none", text: "" }, recover: { by: "none", text: "" }, cooldown: { by: "none", text: "" }, alerts: true };

/** « 5:30 » or « 5 » (minutes) → seconds; « 400 », « 400 m » or « 1,5 km » → metres. Null when it cannot be read. */
export function parsePart(p: PlanPart): { input: GpsStepInput | null; error: string | null } {
  if (p.by === "none") return { input: null, error: null };
  if (p.by === "manual") return { input: { by: "manual" }, error: null };
  const raw = p.text.trim().toLowerCase();
  if (p.by === "time") {
    const m = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(raw.replace(/\s*min$/, ""));
    const value = m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : NaN;
    return value >= 5 && value <= 21600 ? { input: { by: "time", value }, error: null } : { input: null, error: "Durée en min:s, de 0:05 à 360:00 (6 h)." };
  }
  const m = /^(\d+(?:[.,]\d+)?)\s*(km|m)?$/.exec(raw);
  const value = m ? Math.round(Number(m[1]!.replace(",", ".")) * (m[2] === "km" ? 1000 : 1)) : NaN;
  return value >= 50 && value <= 200000 ? { input: { by: "distance", value }, error: null } : { input: null, error: "Distance de 50 m à 200 km, par exemple « 400 » ou « 1,5 km »." };
}
/** The steps the form describes (the engine builds them), and whether a typed value could not be read. */
export function stepsOfForm(f: PlanForm): { steps: GpsStep[]; invalid: boolean } {
  const parts = { warmup: parsePart(f.warmup), work: parsePart(f.work), recover: parsePart(f.recover), cooldown: parsePart(f.cooldown) };
  const reps = Math.max(1, Math.min(30, Math.round(num(f.reps) ?? 1)));
  return {
    steps: GpsSession.buildPlan({ warmup: parts.warmup.input, reps: parts.work.input ? reps : 0, work: parts.work.input, recover: parts.recover.input, cooldown: parts.cooldown.input }),
    invalid: Object.values(parts).some((p) => p.error),
  };
}

function PartEditor({ id, label, part, onChange }: { id: string; label: string; part: PlanPart; onChange: (p: PlanPart) => void }) {
  const parsed = parsePart(part);
  return (
    <View style={{ gap: space.s2 }} testID={`gps-plan-${id}`}>
      <T variant="bodyStrong">{label}</T>
      <Segmented<PlanPart["by"]> accessibilityLabel={`${label} : mesurée par`} value={part.by} onChange={(by) => onChange({ by, text: by === part.by ? part.text : "" })} options={[{ value: "none", label: "Aucun" }, { value: "time", label: "Temps" }, { value: "distance", label: "Distance" }, { value: "manual", label: "Au signal" }]} />
      {part.by === "time" ? <Field value={part.text} onChangeText={(text) => onChange({ ...part, text })} keyboardType="numbers-and-punctuation" suffix="min:s" placeholder="5:00" accessibilityLabel={`${label}, durée en minutes et secondes`} error={part.text && parsed.error ? parsed.error : null} testID={`gps-plan-${id}-value`} /> : null}
      {part.by === "distance" ? <Field value={part.text} onChangeText={(text) => onChange({ ...part, text })} suffix="m ou km" placeholder="400" accessibilityLabel={`${label}, distance en mètres ou en kilomètres`} error={part.text && parsed.error ? parsed.error : null} testID={`gps-plan-${id}-value`} /> : null}
      {part.by === "manual" ? <T variant="small" tone="faint">Sans durée fixée : tu passes à la suite avec « Étape suivante ».</T> : null}
    </View>
  );
}

export function GpsPlanSheet({ visible, onClose, form, onForm, current, onApply, onRemove }: SheetProps & { form: PlanForm; onForm: (f: PlanForm) => void; current: { steps: GpsStep[]; position: string } | null; onApply: (plan: { steps: GpsStep[]; alerts: boolean }) => void; onRemove: () => void }) {
  const built = stepsOfForm(form);
  const set = (patch: Partial<PlanForm>) => onForm({ ...form, ...patch });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Séance structurée"
      footer={
        <View style={{ gap: space.s2 }}>
          <Button label={current ? "Remplacer par cette séance" : "Valider la séance"} icon="check" disabled={!built.steps.length || built.invalid} onPress={() => { onApply({ steps: built.steps, alerts: form.alerts }); onClose(); }} testID="gps-plan-apply" />
          {current ? <Button kind="ghost" label="Retirer la séance structurée" onPress={() => { onRemove(); onClose(); }} testID="gps-plan-remove" /> : null}
        </View>
      }
    >
      <T tone="muted">Tes durées et tes distances, enchaînées pour toi. TITAN signale le changement d’étape ; il ne prescrit aucune intensité.</T>
      {current ? (
        <View style={block} testID="gps-plan-current">
          <T variant="bodyStrong">Séance en cours · étape {current.position || "–"}</T>
          {current.steps.map((s, i) => <T key={i} variant="small" tone="muted">{GpsSession.describeStep(s)}</T>)}
        </View>
      ) : null}
      <PartEditor id="warmup" label="Échauffement" part={form.warmup} onChange={(warmup) => set({ warmup })} />
      <PartEditor id="work" label="Effort" part={form.work} onChange={(work) => set({ work })} />
      {form.work.by !== "none" ? (
        <>
          <Field label="Répétitions" value={form.reps} onChangeText={(reps) => set({ reps })} keyboardType="number-pad" suffix="×" placeholder="1" hint="De 1 à 30" testID="gps-plan-reps" />
          <PartEditor id="recover" label="Récupération entre les efforts" part={form.recover} onChange={(recover) => set({ recover })} />
        </>
      ) : null}
      <PartEditor id="cooldown" label="Retour au calme" part={form.cooldown} onChange={(cooldown) => set({ cooldown })} />
      <View style={block} testID="gps-plan-preview">
        <T variant="bodyStrong">{built.steps.length ? `${built.steps.length} étape${built.steps.length > 1 ? "s" : ""}` : "Aucune étape pour l’instant"}</T>
        {built.steps.length ? built.steps.map((s, i) => <T key={i} variant="small" tone="muted">{GpsSession.describeStep(s)}</T>) : <T variant="small" tone="muted">Choisis au moins une partie mesurée par le temps, la distance ou au signal.</T>}
        {built.invalid ? <T variant="small" tone="warn">Une valeur n’est pas lisible : corrige-la pour valider.</T> : null}
      </View>
      <View style={group}>
        <ToggleRow label="Alerte par vibration à chaque étape" hint="Deux vibrations courtes au changement d’étape. Aucun son, aucune voix." value={form.alerts} onChange={(alerts) => set({ alerts })} last testID="gps-plan-alerts" />
      </View>
    </Sheet>
  );
}

/* ---- Réglages ---- */
export function GpsSettingsSheet({ visible, onClose, sport, prefs, onPrefs, basemap, onBasemap, voice, onVoice }: SheetProps & { sport: string; prefs: GpsPrefs; onPrefs: (patch: Partial<GpsPrefs>) => void; basemap: boolean; onBasemap: (on: boolean) => void; voice: boolean; onVoice: (on: boolean) => void }) {
  const family = GpsEngine.familyOf(sport);
  const lay = GpsSession.layout(sport, fieldsFor(prefs, sport));
  const own = fieldsFor(prefs, sport);
  const label = (k: GpsFieldKey) => (lay.pace && k === "speed" ? "Allure" : lay.pace && k === "avgMoving" ? "Allure moy. en mouvement" : lay.pace && k === "avgOverall" ? "Allure moy. globale" : GpsSession.FIELDS[k].label);
  const toggle = (k: GpsFieldKey) => {
    const cur = lay.more;
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : cur.length < 4 ? [...cur, k] : cur;
    onPrefs({ fields: { ...prefs.fields, [family]: next.length ? next : undefined } });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Réglages de la sortie">
      <View style={group}>
        <ToggleRow
          label="Pause automatique"
          hint={prefs.autoPause ? "Activée : la durée de la séance est ton temps en mouvement. Les arrêts détectés sont mesurés à part." : "Désactivée : les arrêts détectés restent dans la durée de la séance."}
          value={prefs.autoPause}
          onChange={(autoPause) => onPrefs({ autoPause })}
          testID="gps-auto-pause"
        />
        <ToggleRow label="Vibration hors parcours" hint="Une vibration longue quand tu quittes le parcours suivi." value={prefs.offRouteAlert} onChange={(offRouteAlert) => onPrefs({ offRouteAlert })} testID="gps-off-alert" />
        <ToggleRow label="Voix à chaque kilomètre" hint="Annonce vocale du temps et de l’allure à chaque kilomètre." value={voice} onChange={onVoice} last testID="gps-voice" />
      </View>
      <T variant="small" tone="faint">Dans tous les cas, les pauses que tu demandes, les interruptions et les périodes sans position ne comptent jamais dans la durée. La distance et les arrêts mesurés ne changent pas.</T>
      <View style={{ gap: space.s2 }}>
        <T variant="bodyStrong">Chiffres secondaires du compteur</T>
        <T variant="small" tone="muted">{own ? `${lay.more.length} sur 4 choisis` : "Sélection du sport"} · 4 au maximum. Les deux grands chiffres dépendent du sport.</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2 }}>
          {lay.options.map((k) => <Chip key={k} label={label(k)} selected={lay.more.includes(k)} onPress={() => toggle(k)} testID={`gps-field-${k}`} />)}
        </View>
        {own ? <Button small kind="ghost" label="Revenir à la sélection du sport" onPress={() => onPrefs({ fields: { ...prefs.fields, [family]: undefined } })} testID="gps-fields-reset" /> : null}
      </View>
      {tilesConfigured() ? (
        <View style={group}>
          <ToggleRow label="Fond de carte" hint="Affiche une carte sous ta trace. Le fournisseur de tuiles voit alors la zone regardée." value={basemap} onChange={onBasemap} last testID="gps-basemap" />
        </View>
      ) : (
        <T variant="small" tone="muted" testID="gps-basemap-off">Fond de carte non configuré dans cette version : la carte montre ta trace sur fond neutre.</T>
      )}
    </Sheet>
  );
}
