import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "../../components/Card";
import { ShareBar } from "../../components/Charts";
import { RANK_ACCENT, RankCrest, rankIdOf } from "../../components/Crest";
import { Icon, type IconName } from "../../components/Icon";
import { Tap } from "../../components/Pressable";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { Segmented } from "../../components/Segmented";
import { EmptyState, ErrorState, LoadingCards } from "../../components/States";
import { T } from "../../components/Text";
import { Format, type Career, type CareerRange } from "../../core";
import { useCareer } from "../../data/career";
import { colors, familyColors, radius, space } from "../../theme/tokens";

const RANGES: { value: CareerRange; label: string }[] = [
  { value: "7d", label: "7 jours" },
  { value: "30d", label: "30 jours" },
  { value: "year", label: "Année" },
  { value: "all", label: "Depuis le début" },
];

const nf = (n: number) => Format.number(n);
const when = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** A big number with its caption. Never rendered for a figure the data does not prove. */
function Big({ value, label, tone, testID }: { value: string; label: string; tone?: "accent" | "amber"; testID?: string }) {
  return (
    <View style={styles.big} testID={testID} accessible accessibilityLabel={`${value} ${label}`}>
      <T variant="h1" tone={tone} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </T>
      <T variant="caption" tone="faint" numberOfLines={2}>
        {label}
      </T>
    </View>
  );
}

function Lens({ icon, title, color, children }: { icon: IconName; title: string; color: string; children: React.ReactNode }) {
  return (
    <Card style={{ gap: space.s3 }}>
      <View style={styles.lensHead}>
        <View style={[styles.lensIcon, { borderColor: color }]}>
          <Icon name={icon} size={18} color={color} />
        </View>
        <T variant="h3" style={{ flex: 1 }}>
          {title}
        </T>
      </View>
      {children}
    </Card>
  );
}

function Lenses({ c }: { c: Career }) {
  const d = c.distance;
  const foot = c.lenses.includes("run") || c.lenses.includes("hike");
  return (
    <>
      {foot && d.footKm > 0 ? (
        <Lens icon="run" title="À pied" color={familyColors.endurance}>
          <View style={styles.grid}>
            <Big value={Format.distance(d.footKm)} label="parcourus en séance" tone="accent" />
            <Big value={String(d.footSessions)} label={d.footSessions > 1 ? "séances avec distance" : "séance avec distance"} />
            {d.footPace ? <Big value={Format.pace(d.runKm, d.runMinutes)} label="allure moyenne en course" /> : null}
            {d.footElevation > 0 ? <Big value={`${nf(d.footElevation)} m`} label="de dénivelé positif" /> : null}
          </View>
        </Lens>
      ) : null}
      {c.lenses.includes("bike") && d.bikeKm > 0 ? (
        <Lens icon="bike" title="À vélo" color={colors.am}>
          <View style={styles.grid}>
            <Big value={Format.distance(d.bikeKm)} label="parcourus en séance" tone="amber" />
            <Big value={String(d.bikeSessions)} label={d.bikeSessions > 1 ? "sorties avec distance" : "sortie avec distance"} />
            {d.bikeKmh ? <Big value={`${Format.number(d.bikeKmh, 1)} km/h`} label="vitesse moyenne" /> : null}
            {d.bikeMinutes ? <Big value={Format.hours(d.bikeMinutes)} label="en selle" /> : null}
            {d.bikeElevation > 0 ? <Big value={`${nf(d.bikeElevation)} m`} label="de dénivelé positif" /> : null}
          </View>
        </Lens>
      ) : null}
      {c.lenses.includes("swim") && d.swimMeters > 0 ? (
        <Lens icon="wave" title="À la nage" color="#5AB8FF">
          <View style={styles.grid}>
            <Big value={d.swimMeters >= 1000 ? `${Format.number(d.swimMeters / 1000, 1)} km` : `${nf(d.swimMeters)} m`} label="nagés en séance" />
            <Big value={String(d.swimSessions)} label={d.swimSessions > 1 ? "séances" : "séance"} />
            {d.swimMinutes ? <Big value={Format.duration(d.swimMinutes)} label="dans l’eau" /> : null}
          </View>
        </Lens>
      ) : null}
      {c.lenses.includes("strength") && c.strength.sessions > 0 ? (
        <Lens icon="weight" title="Renforcement" color={familyColors.force}>
          <View style={styles.grid}>
            <Big value={String(c.strength.sessions)} label={c.strength.sessions > 1 ? "séances détaillées" : "séance détaillée"} />
            <Big value={nf(c.strength.sets)} label="séries" />
            <Big value={nf(c.strength.reps)} label="répétitions" />
            {c.strength.loadedSets > 0 ? <Big value={`${nf(c.strength.volumeKg)} kg`} label="de volume (séries chargées)" tone="accent" /> : null}
          </View>
        </Lens>
      ) : null}
      {c.lenses.includes("multi") ? (
        <Lens icon="layers" title="Tes pratiques" color={colors.cy}>
          <ShareBar parts={c.families.map((f) => ({ id: f.id, label: `${f.label} · ${f.sessions}`, share: f.share || 1 / c.families.length, color: familyColors[f.id] ?? colors.cy }))} />
          {c.sports.slice(0, 5).map((s) => (
            <View key={s.sport} style={styles.rowLine}>
              <T variant="small" tone="default" style={{ flex: 1 }} numberOfLines={1}>
                {s.label}
              </T>
              <T variant="small">
                {s.sessions} séance{s.sessions > 1 ? "s" : ""}
                {s.minutes ? ` · ${Format.duration(s.minutes)}` : ""}
              </T>
            </View>
          ))}
        </Lens>
      ) : null}
    </>
  );
}

/** « Ma carrière sportive »: everything the account has accomplished, from its own journal. Only what the data proves is shown: no calories
    (TITAN records none), no distance for a sport that measured none, steps apart from session distances, one count per session. */
export function CareerScreen() {
  const navigation = useNavigation();
  const [range, setRange] = useState<CareerRange>("all");
  const { career: c, loading, stepsLoading, error } = useCareer(range);
  const level = c.rpg.level;
  const rank = level ? rankIdOf(level) : null;
  const accent = rank ? RANK_ACCENT[rank] : colors.cy;

  return (
    <Screen>
      {rank ? (
        <Card tone="accent" style={styles.hero} testID="career-hero">
          <RankCrest rank={rank} size={150} />
          <T variant="eyebrow" color={accent}>
            Niveau {level} · {c.rpg.name}
          </T>
          <T variant="h2" center>
            Ma carrière sportive
          </T>
          {c.first ? (
            <T variant="small" center>
              Depuis le {when(c.first)}
            </T>
          ) : null}
        </Card>
      ) : (
        <T variant="h1">Ma carrière sportive</T>
      )}
      <Segmented value={range} onChange={setRange} options={RANGES} accessibilityLabel="Période" />
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorState error={error} onRetry={() => navigation.goBack()} />
      ) : c.empty ? (
        <EmptyState brand icon="trophy" title={range === "all" ? "Ta carrière commence ici" : "Rien sur cette période"} text={range === "all" ? "Enregistre une séance : tes chiffres, tes records et tes grands moments s’écrivent avec ton journal." : "Une période calme ne t’enlève rien. Essaie « Depuis le début » pour revoir tout ton parcours."} />
      ) : (
        <>
          <Card style={{ gap: space.s3 }}>
            <View style={styles.grid}>
              <Big value={nf(c.totals.sessions)} label={c.totals.sessions > 1 ? "séances" : "séance"} tone="accent" testID="career-sessions" />
              <Big value={Format.hours(c.totals.minutes)} label="de pratique" testID="career-time" />
              <Big value={String(c.totals.sports)} label={c.totals.sports > 1 ? "sports pratiqués" : "sport pratiqué"} />
              <Big value={String(c.totals.activeDays)} label={c.totals.activeDays > 1 ? "jours actifs" : "jour actif"} />
            </View>
            {c.totals.unmeasuredSessions > 0 ? (
              <T variant="caption" tone="faint">
                {c.totals.unmeasuredSessions} séance{c.totals.unmeasuredSessions > 1 ? "s" : ""} sans durée renseignée {c.totals.unmeasuredSessions > 1 ? "ne comptent" : "ne compte"} pas dans le temps.
              </T>
            ) : null}
          </Card>

          {c.distance.footKm + c.distance.bikeKm + c.distance.swimMeters + c.elevation.meters > 0 ? (
            <Card style={{ gap: space.s3 }} testID="career-distances">
              <T variant="eyebrow">Distances en séance</T>
              <View style={styles.grid}>
                {c.distance.footKm > 0 ? <Big value={Format.distance(c.distance.footKm)} label="à pied" /> : null}
                {c.distance.bikeKm > 0 ? <Big value={Format.distance(c.distance.bikeKm)} label="à vélo" /> : null}
                {c.distance.swimMeters > 0 ? <Big value={c.distance.swimMeters >= 1000 ? `${Format.number(c.distance.swimMeters / 1000, 1)} km` : `${nf(c.distance.swimMeters)} m`} label="à la nage" /> : null}
                {c.elevation.meters > 0 ? <Big value={`${nf(c.elevation.meters)} m`} label="de dénivelé positif" tone="amber" /> : null}
              </View>
              <T variant="caption" tone="faint">
                Seulement les distances mesurées pendant tes séances : un sport sans distance n’en reçoit jamais.
              </T>
            </Card>
          ) : null}

          <Card style={{ gap: space.s2 }} testID="career-steps">
            <T variant="eyebrow">Pas</T>
            {c.steps ? (
              <>
                <T variant="h2">{nf(c.steps.total)} pas</T>
                <T variant="small">
                  Comptés sur {c.steps.days} jour{c.steps.days > 1 ? "s" : ""} avec un chiffre (compteur TITAN ou Santé Connect, un seul nombre par jour, jamais additionnés).
                </T>
                <T variant="caption" tone="faint">
                  ≈ {Format.number(c.steps.estimatedKm, 0)} km estimés d’après les pas. Cette estimation n’est jamais ajoutée aux distances de séance.
                </T>
              </>
            ) : (
              <T variant="small">{stepsLoading ? "Lecture de tes pas…" : "Pas de pas comptés sur cette période. Active le compteur de pas pour les voir ici."}</T>
            )}
          </Card>

          <Lenses c={c} />

          {c.records.length ? (
            <Section title="Records personnels">
              <Card style={{ gap: space.s2 }} testID="career-records">
                {c.records.slice(0, 6).map((r) => (
                  <View key={r.id} style={styles.rowLine}>
                    <Icon name="trophy" size={16} color={colors.am} />
                    <T variant="small" tone="default" style={{ flex: 1 }}>
                      {r.label} · {r.sportLabel}
                    </T>
                    <T variant="bodyStrong">{typeof r.value === "number" ? Format.recordValue(r.unit, r.value) : r.value}</T>
                  </View>
                ))}
                <Tap onPress={() => navigation.navigate("Records")} accessibilityLabel="Voir tous les records" style={styles.more}>
                  <T variant="small" tone="accent">
                    Tous les records
                  </T>
                  <Icon name="chevron" size={16} color={colors.cy} />
                </Tap>
              </Card>
            </Section>
          ) : null}

          <Section title="Grands moments">
            {c.milestones.length ? (
              <Card style={{ gap: space.s3 }} testID="career-milestones">
                {c.milestones.slice(0, 8).map((m) => (
                  <View key={m.id} style={styles.moment}>
                    <View style={[styles.dot, { backgroundColor: m.tone === "amber" ? colors.am : colors.cy }]} />
                    <View style={{ flex: 1 }}>
                      <T variant="bodyStrong">{m.title}</T>
                      <T variant="caption" tone="faint">
                        {when(m.date)} · {m.detail}
                      </T>
                    </View>
                  </View>
                ))}
              </Card>
            ) : (
              <T variant="small">Les grands moments apparaissent quand tes séances les prouvent : premiers kilomètres, caps de séances, dénivelé.</T>
            )}
          </Section>

          <Section title="Dernières séances">
            <Card style={{ gap: space.s1 }} testID="career-timeline">
              {c.timeline.map((s) => (
                <Tap key={s.id} onPress={() => navigation.navigate("SessionDetail", { id: s.id })} accessibilityLabel={`${s.label}, ${Format.relativeDay(s.date)}`} style={styles.session}>
                  <View style={{ flex: 1 }}>
                    <T variant="bodyStrong" numberOfLines={1}>
                      {s.label}
                    </T>
                    <T variant="caption" tone="faint">
                      {Format.relativeDay(s.date)}
                    </T>
                  </View>
                  <T variant="small">{[s.km ? Format.distance(s.km) : null, s.minutes ? Format.duration(s.minutes) : null].filter(Boolean).join(" · ") || "—"}</T>
                </Tap>
              ))}
            </Card>
          </Section>

          <T variant="caption" tone="faint">
            Calories : TITAN n’en affiche pas tant qu’une source fiable ne les fournit pas. Aucun chiffre n’est inventé. Une séance n’est comptée qu’une seule fois, quelle que soit sa source (saisie, GPS, Santé Connect, Garmin).
            {c.excluded > 0 ? ` ${c.excluded} séance${c.excluded > 1 ? "s" : ""} en cours de vérification ne ${c.excluded > 1 ? "sont" : "est"} pas comptée${c.excluded > 1 ? "s" : ""}.` : ""}
          </T>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.s2, paddingVertical: space.s5 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: space.s4, columnGap: space.s3 },
  big: { width: "47%", flexGrow: 1, minWidth: 120, gap: 2 },
  lensHead: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  lensIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg3 },
  rowLine: { flexDirection: "row", alignItems: "center", gap: space.s2, minHeight: 28 },
  more: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", minHeight: 40 },
  moment: { flexDirection: "row", alignItems: "flex-start", gap: space.s3 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  session: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: 48, borderRadius: radius.r2 },
});
