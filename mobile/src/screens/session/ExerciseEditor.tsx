import { useCallback, useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { Segmented } from "../../components/Segmented";
import { T } from "../../components/Text";
import { Format } from "../../core";
import { COMMON_EXERCISES, COMMON_MOVES, emptyExercise, emptySet, type ExerciseDraft, type LastPerformance } from "../../core/session";
import { haptic } from "../../lib/haptics";
import { cancelRestEnd, scheduleRestEnd } from "../../lib/restNotify";
import { adjustRest, DEFAULT_REST, REST_PRESETS, restDone, restLabel, restLeft, startRest, type RestState } from "../../lib/restTimer";
import { useSpace } from "../../theme/space";
import { colors, radius, space, TOUCH } from "../../theme/tokens";

const COL_GAP = 6;
/** A compact field's padding and border, and the width of four digits and a decimal mark at the default text size. */
const FIELD_CHROME = 22;
const FIELD_DIGITS = 44;

/** Countdown between sets: a tap on "Fait" starts it, a gentle haptic ends it. Nothing is stored. */
function RestBar({ rest, onChange, preset, onPreset }: { rest: RestState; onChange: (r: RestState) => void; preset: number; onPreset: (s: number) => void }) {
  const theme = useSpace();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (restDone(rest, t)) {
        haptic("success");
        onChange(null);
      }
    }, 250);
    return () => clearInterval(id);
  }, [rest, onChange]);
  return (
    <View style={styles.rest} accessibilityRole="timer" accessibilityLabel={rest ? `Repos, ${restLeft(rest, now)} secondes restantes` : "Chrono de repos"}>
      <Icon name="timer" size={20} color={theme.accent} />
      {rest ? (
        <>
          <T variant="bodyStrong" style={{ flex: 1 }}>
            Repos {restLabel(restLeft(rest, now))}
          </T>
          <Button label="+15 s" kind="ghost" small onPress={() => onChange(adjustRest(rest, Date.now(), 15))} />
          <Button label="Passer" kind="ghost" small onPress={() => onChange(null)} />
        </>
      ) : (
        <View style={styles.wrap}>
          {REST_PRESETS.map((sec) => (
            <Chip key={sec} label={restLabel(sec)} selected={preset === sec} onPress={() => onPreset(sec)} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Exercises with per-set rows (charge, répétitions, RIR) or holds in seconds, like the website. */
export function ExerciseEditor({ exercises, onChange, bodyweight, error, suggestions = [], lastFor }: { exercises: ExerciseDraft[]; onChange: (e: ExerciseDraft[]) => void; bodyweight: boolean; error?: boolean; suggestions?: string[]; lastFor?: (name: string) => LastPerformance | null }) {
  const theme = useSpace();
  const names = [...new Set([...suggestions, ...(bodyweight ? COMMON_MOVES : COMMON_EXERCISES)])].slice(0, 16);
  const [rest, setRestState] = useState<RestState>(null);
  // AUD-28: every change of the rest moves (or cancels) its end-of-rest notification.
  const setRest = useCallback((r: RestState) => {
    setRestState(r);
    if (r) void scheduleRestEnd(r.endsAt);
    else void cancelRestEnd();
  }, []);
  useEffect(() => () => void cancelRestEnd(), []);
  const [preset, setPreset] = useState<number>(DEFAULT_REST);
  const update = (i: number, patch: Partial<ExerciseDraft>) => onChange(exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  // A set field must show four digits (« 102.5 », « 1000 ») at the person's text size. The fields ask for that width; when the row
  // cannot give it (narrow phone, large text), the two set actions move to a second line instead of squeezing the fields.
  const { fontScale } = useWindowDimensions();
  const fieldMin = FIELD_CHROME + FIELD_DIGITS * Math.min(Math.max(fontScale, 1), 2);
  return (
    <View style={{ gap: space.s3 }}>
      {bodyweight ? null : <RestBar rest={rest} onChange={setRest} preset={preset} onPreset={setPreset} />}
      {exercises.map((ex, i) => (
        <View key={i} style={[styles.card, error && !ex.name.trim() && i === 0 && { borderColor: colors.err }]}>
          <View style={styles.head}>
            <T variant="eyebrow" style={{ flex: 1 }}>
              {bodyweight ? "Mouvement" : "Exercice"} {i + 1}
            </T>
            {exercises.length > 1 ? (
              <Tap onPress={() => onChange(exercises.filter((_, j) => j !== i))} accessibilityLabel={`Retirer ${ex.name || `l’exercice ${i + 1}`}`} style={styles.iconBtn}>
                <Icon name="trash" size={18} color={colors.tx3} />
              </Tap>
            ) : null}
          </View>
          <Field value={ex.name} onChangeText={(name) => update(i, { name })} placeholder={bodyweight ? "Pompes, tractions…" : "Squat, développé couché…"} accessibilityLabel={`Nom de l’exercice ${i + 1}`} maxLength={80} testID={`exercise-${i}-name`} />
          {!ex.name.trim() ? (
            <View style={styles.wrap}>
              {names.slice(0, 8).map((n) => (
                <Chip key={n} label={n} onPress={() => update(i, { name: n })} />
              ))}
            </View>
          ) : null}
          {(() => {
            // AUD-16: what was done last time on this exercise, one tap to reuse it as the starting point.
            const last = ex.name.trim() && lastFor ? lastFor(ex.name) : null;
            if (!last) return null;
            return (
              <View style={styles.last} testID={`exercise-${i}-last`}>
                <View style={{ flex: 1 }}>
                  <T variant="caption" tone="faint">La dernière fois · {Format.relativeDay(last.date)}</T>
                  <T variant="small">{last.summary}</T>
                </View>
                <Button small kind="ghost" label="Reprendre" accessibilityHint="Remplit les séries avec celles de la dernière fois" onPress={() => { haptic("light"); update(i, { sets: last.sets.map((x) => ({ ...x })) }); }} testID={`exercise-${i}-reuse`} />
              </View>
            );
          })()}
          {bodyweight ? (
            <Segmented
              value={ex.kind === "hold" ? "hold" : "reps"}
              onChange={(v) => update(i, { kind: v === "hold" ? "hold" : "bodyweight" })}
              options={[
                { value: "reps", label: "Répétitions" },
                { value: "hold", label: "Maintien (s)" },
              ]}
              accessibilityLabel="Type de mouvement"
            />
          ) : null}
          <View style={styles.setsHead}>
            <T variant="caption" tone="faint" style={styles.colN}>
              #
            </T>
            <View style={[styles.fields, { flexBasis: ex.kind === "hold" ? fieldMin : fieldMin * 3 + 2 * COL_GAP }]}>
              {ex.kind === "hold" ? (
                <T variant="caption" tone="faint" numberOfLines={1} style={styles.col}>
                  Secondes
                </T>
              ) : (
                <>
                  <T variant="caption" tone="faint" numberOfLines={1} style={styles.col}>
                    {bodyweight ? "Lest kg" : "kg"}
                  </T>
                  <T variant="caption" tone="faint" numberOfLines={1} style={styles.col}>
                    rép.
                  </T>
                  <T variant="caption" tone="faint" numberOfLines={1} style={styles.col}>
                    RIR
                  </T>
                </>
              )}
            </View>
            <View style={styles.setActionsSpace} />
          </View>
          {ex.sets.map((s, k) => (
            <View key={k} style={styles.setRow}>
              <T variant="bodyStrong" style={styles.colN}>
                {k + 1}
              </T>
              <View style={[styles.fields, { flexBasis: ex.kind === "hold" ? fieldMin : fieldMin * 3 + 2 * COL_GAP }]}>
                {ex.kind === "hold" ? (
                  <View style={styles.col}>
                    <Field compact value={s.seconds} onChangeText={(v) => update(i, { sets: ex.sets.map((x, m) => (m === k ? { ...x, seconds: v } : x)) })} keyboardType="number-pad" placeholder="30" accessibilityLabel={`Série ${k + 1}, secondes`} />
                  </View>
                ) : (
                  <>
                    <View style={styles.col}>
                      <Field compact value={s.weight} onChangeText={(v) => update(i, { sets: ex.sets.map((x, m) => (m === k ? { ...x, weight: v } : x)) })} keyboardType="decimal-pad" placeholder="0" accessibilityLabel={`Série ${k + 1}, charge en kilos`} testID={`exercise-${i}-set-${k}-weight`} />
                    </View>
                    <View style={styles.col}>
                      <Field compact value={s.reps} onChangeText={(v) => update(i, { sets: ex.sets.map((x, m) => (m === k ? { ...x, reps: v } : x)) })} keyboardType="number-pad" placeholder="10" accessibilityLabel={`Série ${k + 1}, répétitions`} testID={`exercise-${i}-set-${k}-reps`} />
                    </View>
                    <View style={styles.col}>
                      <Field compact value={s.rir} onChangeText={(v) => update(i, { sets: ex.sets.map((x, m) => (m === k ? { ...x, rir: v } : x)) })} keyboardType="number-pad" placeholder="–" accessibilityLabel={`Série ${k + 1}, répétitions en réserve (facultatif)`} />
                    </View>
                  </>
                )}
              </View>
              <View style={styles.setActions}>
                <Tap onPress={() => { haptic("light"); setRest(startRest(Date.now(), preset)); }} accessibilityLabel={`Série ${k + 1} faite, lancer le repos`} style={styles.iconBtn}>
                  <Icon name="check" size={18} color={theme.accent} />
                </Tap>
                <Tap onPress={() => update(i, { sets: ex.sets.length > 1 ? ex.sets.filter((_, m) => m !== k) : [emptySet()] })} accessibilityLabel={`Retirer la série ${k + 1}`} style={styles.iconBtn}>
                  <Icon name="minus" size={18} color={colors.tx3} />
                </Tap>
              </View>
            </View>
          ))}
          <Button
            label="Ajouter une série"
            kind="ghost"
            small
            icon="plus"
            disabled={ex.sets.length >= 30}
            onPress={() => update(i, { sets: [...ex.sets, { ...(ex.sets.at(-1) ?? emptySet()) }] })}
          />
        </View>
      ))}
      <Button label={bodyweight ? "Ajouter un mouvement" : "Ajouter un exercice"} kind="secondary" icon="plus" disabled={exercises.length >= 30} onPress={() => onChange([...exercises, emptyExercise(bodyweight ? "bodyweight" : "weighted")])} />
      <T variant="caption" tone="faint">
        La charge la plus élevée de chaque exercice devient un record.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.s3, padding: space.s3, borderRadius: radius.r3, backgroundColor: colors.bg2 },
  head: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // One line when the fields get their width, two otherwise: the actions wrap as a block, on the right.
  setsHead: { flexDirection: "row", flexWrap: "wrap", columnGap: COL_GAP, alignItems: "center" },
  setRow: { flexDirection: "row", flexWrap: "wrap", columnGap: COL_GAP, alignItems: "center" },
  fields: { flexGrow: 1, flexShrink: 1, flexDirection: "row", gap: COL_GAP, alignItems: "center" },
  setActions: { flexDirection: "row", marginLeft: "auto" },
  // The header keeps the columns of the rows under it: the same room as the two actions, with no height of its own.
  setActionsSpace: { width: 2 * TOUCH, height: 0, marginLeft: "auto" },
  rest: { flexDirection: "row", alignItems: "center", gap: space.s2, padding: space.s2, borderRadius: radius.r3, backgroundColor: colors.bg2 },
  colN: { width: 24, textAlign: "center" },
  col: { flex: 1, minWidth: 0 },
  iconBtn: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: "center", justifyContent: "center" },
  last: { flexDirection: "row", alignItems: "center", gap: space.s2, paddingVertical: space.s1, paddingHorizontal: space.s2, borderRadius: radius.r2, backgroundColor: colors.bg3 },
});
