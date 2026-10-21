import { StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Field } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { Segmented } from "../../components/Segmented";
import { T } from "../../components/Text";
import { COMMON_EXERCISES, COMMON_MOVES, emptyExercise, emptySet, type ExerciseDraft } from "../../core/session";
import { colors, radius, space, TOUCH } from "../../theme/tokens";

/** Exercises with per-set rows (charge, répétitions, RIR) or holds in seconds, like the website. */
export function ExerciseEditor({ exercises, onChange, bodyweight, error, suggestions = [] }: { exercises: ExerciseDraft[]; onChange: (e: ExerciseDraft[]) => void; bodyweight: boolean; error?: boolean; suggestions?: string[] }) {
  const names = [...new Set([...suggestions, ...(bodyweight ? COMMON_MOVES : COMMON_EXERCISES)])].slice(0, 16);
  const update = (i: number, patch: Partial<ExerciseDraft>) => onChange(exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <View style={{ gap: space.s3 }}>
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
              Série
            </T>
            {ex.kind === "hold" ? (
              <T variant="caption" tone="faint" style={styles.col}>
                Secondes
              </T>
            ) : (
              <>
                <T variant="caption" tone="faint" style={styles.col}>
                  {bodyweight ? "Lest (kg)" : "Charge (kg)"}
                </T>
                <T variant="caption" tone="faint" style={styles.col}>
                  Répét.
                </T>
                <T variant="caption" tone="faint" style={styles.colSmall}>
                  RIR
                </T>
              </>
            )}
            <View style={{ width: 40 }} />
          </View>
          {ex.sets.map((s, k) => (
            <View key={k} style={styles.setRow}>
              <T variant="bodyStrong" style={styles.colN}>
                {k + 1}
              </T>
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
                  <View style={styles.colSmall}>
                    <Field compact value={s.rir} onChangeText={(v) => update(i, { sets: ex.sets.map((x, m) => (m === k ? { ...x, rir: v } : x)) })} keyboardType="number-pad" placeholder="–" accessibilityLabel={`Série ${k + 1}, répétitions en réserve (facultatif)`} />
                  </View>
                </>
              )}
              <Tap onPress={() => update(i, { sets: ex.sets.length > 1 ? ex.sets.filter((_, m) => m !== k) : [emptySet()] })} accessibilityLabel={`Retirer la série ${k + 1}`} style={styles.iconBtn}>
                <Icon name="minus" size={18} color={colors.tx3} />
              </Tap>
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
        La charge la plus élevée par exercice devient un record sourcé. Pas de 1RM estimé.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.s3, padding: space.s3, borderRadius: radius.r3, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  setsHead: { flexDirection: "row", gap: 6, alignItems: "center" },
  setRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  colN: { width: 34, textAlign: "center" },
  col: { flex: 1 },
  colSmall: { flex: 0.7 },
  iconBtn: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: "center", justifyContent: "center" },
});
