/* "Tes questions": the website's sport questions (js/app/semaine.js), same rules and wording, drawn natively. */
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { CadenceNotches } from "../../components/Cadence";
import { Card } from "../../components/Card";
import { BarChart, ShareBar } from "../../components/Charts";
import { T } from "../../components/Text";
import { Format, Progress, Questions, Sports, type Cadence } from "../../core";
import type { TrainingLog } from "../../core/types";
import { colors, familyColors, radius, space } from "../../theme/tokens";

const pace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function QuestionCard({ q, lead, answer, children, basis }: { q: string; lead?: string; answer: string; children?: ReactNode; basis?: string }) {
  return (
    <Card style={{ gap: space.s3 }}>
      <T variant="h3">{q}</T>
      <T variant="body" tone="default">
        {lead ? <T variant="bodyStrong">{lead} </T> : null}
        {answer}
      </T>
      {children}
      {basis ? (
        <T variant="caption" tone="faint">
          {basis}
        </T>
      ) : null}
    </Card>
  );
}

function Volume({ logs }: { logs: TrainingLog[] }) {
  const series = Questions.weeklySeries(logs, { weeks: 12 });
  if (!series.some((w) => w.sessions)) return null;
  const t = Questions.volumeTrend(series);
  const [lead, answer] = !t
    ? ["", "Encore quelques semaines et la tendance sera fiable : il en faut huit complètes."]
    : t.direction === "up"
      ? ["Oui.", `${Format.duration(t.recent)} par semaine sur le dernier mois, contre ${Format.duration(t.before)} le mois d’avant.`]
      : t.direction === "down"
        ? ["Un peu moins.", `${Format.duration(t.recent)} par semaine sur le dernier mois, contre ${Format.duration(t.before)} avant. Une baisse peut être voulue : récupération, saison, vie.`]
        : t.direction === "new"
          ? ["", "Tu as repris récemment : la comparaison démarre."]
          : ["Au même niveau.", `Autour de ${Format.duration(t.recent)} par semaine depuis deux mois.`];
  return (
    <QuestionCard q="Est-ce que je m’entraîne plus qu’avant ?" lead={lead} answer={answer} basis="Temps par semaine sur 12 semaines ; la dernière colonne est la semaine en cours.">
      <BarChart
        data={series.map((w) => ({ label: w.current ? "Sem." : w.start.toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" }), detail: w.current ? "Cette semaine" : `Semaine du ${w.start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`, value: w.minutes, highlight: w.current }))}
        format={(v) => Format.duration(v)}
        average
        height={140}
        accessibilityLabel="Temps de pratique par semaine"
      />
    </QuestionCard>
  );
}

function Share({ logs }: { logs: TrainingLog[] }) {
  const f = Questions.familyShare(logs, { days: 84 });
  if (!f.sessions || !f.families.length) return null;
  const [first, second] = f.families;
  const label = (id: string) => Sports.FAMILY_LABEL[id as keyof typeof Sports.FAMILY_LABEL] ?? id;
  return (
    <QuestionCard
      q="Où va mon temps ?"
      lead={label(first.id)}
      answer={`occupe ${Math.round(first.share * 100)} % de ton temps sur 12 semaines${second ? `, puis ${label(second.id).toLowerCase()} (${Math.round(second.share * 100)} %)` : ""}.`}
      basis="Temps déclaré ou estimé par famille de sports, 12 dernières semaines."
    >
      <ShareBar parts={f.families.map((x) => ({ id: x.id, label: `${label(x.id)} · ${Format.duration(x.minutes)}`, share: x.share, color: familyColors[x.id] ?? colors.tx3 }))} />
      <View style={{ gap: 6 }}>
        {f.sports.map((s) => (
          <View key={s.sport} style={styles.line}>
            <T variant="small" tone="default" style={{ flex: 1 }} numberOfLines={1}>
              {s.label}
            </T>
            <T variant="small">
              {Format.plural(s.sessions, "séance", "séances")} · {Format.duration(s.minutes)}
            </T>
          </View>
        ))}
      </View>
    </QuestionCard>
  );
}

function Pace({ logs }: { logs: TrainingLog[] }) {
  const p = Questions.paceTrend(logs);
  if (!p || !p.points.length) return null;
  const q = `Est-ce que j’avance en ${Sports.label(p.sport).toLowerCase()} ?`;
  const basis = "Allure médiane par mois, séances de 3 km et plus. Une barre plus haute est plus rapide.";
  if (!p.enough || !p.first || !p.last || p.delta === undefined) return <QuestionCard q={q} answer="Il faut au moins deux mois avec deux sorties de 3 km ou plus pour répondre sans se tromper." basis={basis} />;
  const d = p.delta;
  const [lead, answer] =
    Math.abs(d) < 3
      ? ["Stable :", `allure médiane autour de ${pace(p.last.pace)} /km.`]
      : d < 0
        ? ["Oui.", `Ton allure médiane passe de ${pace(p.first.pace)} à ${pace(p.last.pace)} /km (${p.first.label} → ${p.last.label}).`]
        : ["Allure plus lente :", `${pace(p.first.pace)} → ${pace(p.last.pace)} /km. Sorties plus longues, plus de dénivelé ou plus faciles ? Le contexte compte.`];
  const max = Math.max(...p.points.map((x) => x.pace));
  const min = Math.min(...p.points.map((x) => x.pace));
  return (
    <QuestionCard q={q} lead={lead} answer={answer} basis={basis}>
      <BarChart
        data={p.points.map((x, i) => ({ label: x.label, detail: `${x.label} · ${Format.plural(x.sessions, "sortie", "sorties")}`, display: `${pace(x.pace)} /km`, value: max === min ? 1 : 0.25 + (0.75 * (max - x.pace)) / (max - min), highlight: i === p.points.length - 1 }))}
        scale={false}
        height={120}
        accessibilityLabel="Allure médiane par mois"
      />
    </QuestionCard>
  );
}

function Strength({ logs }: { logs: TrainingLog[] }) {
  const s = Questions.strengthTrend(logs);
  if (!s || !s.points.length) return null;
  const firstW = s.points[0].weight;
  const lastW = s.points[s.points.length - 1].weight;
  const [lead, answer] = !s.enough
    ? ["", `Ton exercice le plus pratiqué est ${s.name}. Encore un mois de données pour voir l’évolution.`]
    : (s.delta ?? 0) > 0
      ? ["Oui.", `${s.name} : charge maximale de ${Format.number(firstW)} à ${Format.number(lastW)} kg.`]
      : s.delta === 0
        ? ["Stable", `sur ${s.name} : ${Format.number(firstW)} kg. Répétitions et volume peuvent progresser sans changer la charge.`]
        : ["", `${s.name} : charge maximale en baisse (${Format.number(firstW)} → ${Format.number(lastW)} kg). Cycle plus léger ou reprise ?`];
  return (
    <QuestionCard q="Est-ce que je deviens plus fort ?" lead={lead} answer={answer} basis={`Charge la plus lourde déclarée par mois sur ${s.name}${s.variant ? ` (${s.variant})` : ""}. Ce n’est pas un 1RM estimé.`}>
      <BarChart data={s.points.map((x, i) => ({ label: x.label, value: x.weight, highlight: i === s.points.length - 1 }))} format={(v) => `${Format.number(v)} kg`} height={120} accessibilityLabel={`Charge maximale par mois, ${s.name}`} />
    </QuestionCard>
  );
}

function Climb({ logs }: { logs: TrainingLog[] }) {
  const c = Questions.climbingTrend(logs);
  if (!c || !c.points.length) return null;
  const last = c.points[c.points.length - 1];
  const [lead, answer] = !c.enough ? ["Meilleure réussite récente :", `${last.grade} (${c.system}).`] : c.up ? ["Oui.", `De ${c.points[0].grade} à ${last.grade} en ${c.system}.`] : ["", `Meilleure réussite stable autour de ${last.grade} (${c.system}).`];
  return (
    <QuestionCard q="Est-ce que je grimpe plus dur ?" lead={lead} answer={answer} basis="Meilleure cotation réussie par mois, comparée dans un seul système.">
      <View style={styles.grades}>
        {c.points.map((p, i) => (
          <View key={p.month} style={[styles.grade, i === c.points.length - 1 && styles.gradeLast]}>
            <T variant="caption" tone="faint">
              {p.label}
            </T>
            <T variant="num" tone={i === c.points.length - 1 ? "amber" : "default"}>
              {p.grade}
            </T>
          </View>
        ))}
      </View>
    </QuestionCard>
  );
}

function Load({ logs }: { logs: TrainingLog[] }) {
  const l = Questions.load(logs);
  const q = "Ma semaine est-elle plus chargée que d’habitude ?";
  if (!l.enough) return <QuestionCard q={q} answer="Renseigne ton ressenti (RPE) sur la plupart de tes séances : TITAN pourra comparer ta charge avec tes semaines habituelles." basis="Charge = durée × ressenti. Il faut un ressenti sur au moins 60 % des séances." />;
  const pct = Math.round(l.ratio * 100);
  const [lead, answer] = l.level === "high" ? ["Oui, nettement :", `${pct} % de ta charge habituelle. Si la fatigue s’accumule, une journée plus calme aide à absorber le travail.`] : l.level === "low" ? ["Plus légère :", `${pct} % de ta charge habituelle.`] : ["Dans ta zone habituelle :", `${pct} % de ta moyenne des 4 semaines précédentes.`];
  return (
    <QuestionCard q={q} lead={lead} answer={answer} basis="Durée × ressenti de la semaine en cours, comparée à la moyenne des 4 semaines précédentes. Repère d’entraînement, pas un avis médical.">
      <View style={styles.gauge} accessible accessibilityLabel={`${pct} % de la charge habituelle`}>
        <View style={[styles.gaugeFill, { width: `${Math.min(100, Math.round((l.ratio / 2) * 100))}%`, backgroundColor: l.level === "high" ? colors.am : colors.cy }]} />
        <View style={styles.gaugeMark} />
      </View>
    </QuestionCard>
  );
}

function Held({ cadence, target }: { cadence: Cadence; target: number }) {
  if (!cadence.lifetimeHeld && !cadence.currentDays) return null;
  return (
    <QuestionCard q="Combien de semaines ai-je tenues ?" lead={`${cadence.held} sur ${cadence.window}`} answer={`ces 8 dernières semaines, ${cadence.lifetimeHeld} depuis le début.`} basis={`Une semaine est tenue avec ${Format.plural(target, "jour actif", "jours actifs")}. Les semaines en pause ne comptent pas.`}>
      <CadenceNotches cadence={cadence} />
    </QuestionCard>
  );
}

export function SportQuestions({ logs, cadenceTarget, pauses }: { logs: TrainingLog[]; cadenceTarget: number; pauses: string[] }) {
  const cadence = Progress.cadence(logs, { target: cadenceTarget, pauses });
  return (
    <View style={{ gap: space.s3 }}>
      <Volume logs={logs} />
      <Share logs={logs} />
      <Pace logs={logs} />
      <Strength logs={logs} />
      <Climb logs={logs} />
      <Load logs={logs} />
      <Held cadence={cadence} target={cadenceTarget} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  grades: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  grade: { minWidth: 64, gap: 2, padding: space.s2, borderRadius: radius.r1, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line },
  gradeLast: { borderColor: "rgba(244,187,84,0.5)" },
  gauge: { height: 12, borderRadius: 6, backgroundColor: colors.bg4, overflow: "hidden", justifyContent: "center" },
  gaugeFill: { height: 12, borderRadius: 6 },
  gaugeMark: { position: "absolute", left: "50%", width: 2, height: 16, backgroundColor: colors.tx2 },
});
