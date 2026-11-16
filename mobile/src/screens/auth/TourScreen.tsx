import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, BackHandler, Easing, Image, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { RankCrest } from "../../components/Crest";
import { Icon, type IconName } from "../../components/Icon";
import { LiveTrail } from "../../components/LiveTrail";
import { Tap } from "../../components/Pressable";
import { ProgramGrid } from "../../components/ProgramGrid";
import { ProgressBar } from "../../components/Progress";
import { Shade } from "../../components/Shade";
import { T } from "../../components/Text";
import { heroImage, worldImages } from "../../core/images";
import type { ProgramCell, ProgramSpan, ProgramWeek } from "../../core/program";
import { closeFirstVisit, FIRST_VISIT_STEPS, loadFirstVisit, saveFirstVisitStep } from "../../lib/firstVisit";
import { haptic } from "../../lib/haptics";
import { useReducedMotion } from "../../lib/motion";
import type { RootParams } from "../../navigation/types";
import { SpaceProvider } from "../../theme/space";
import { colors, fonts, space, spaces, TOUCH, type SpaceId } from "../../theme/tokens";

/* The guided visit before sign-up: four stops in TITAN's real spaces, under a minute, skippable at every step. Each stop is drawn
   with the app's own components (the QG banner, the programme, the expedition, the profile field) on demonstration figures that
   are labelled as such and never leave this screen: no account, no session, no XP, no permission, no request to the server.
   One element per stop is ringed; touching it (or « Continuer ») moves on. The tab bar under the scene is the real one's twin,
   so the person learns where each space lives before they have an account. */

type Stop = { space: SpaceId; tab: number; title: string; text: string; target: string };
const STOPS: Stop[] = [
  { space: "qg", tab: 0, title: "Tes efforts deviennent une aventure.", text: "Voici ton QG : ton niveau, l’action du jour et ta semaine. Tout y vient de tes séances réelles, jamais d’un achat.", target: "L’action du jour" },
  { space: "seance", tab: 2, title: "Une séance, une minute.", text: "Le bouton + ouvre la Séance : 260 sports, à la main, au GPS ou depuis une montre. Ton journal garde tout, même hors ligne.", target: "Choisir un sport" },
  { space: "aventure", tab: 3, title: "Chaque effort fait avancer ton monde.", text: "Tes jours actifs allument les balises de quatre mondes. En séance, TITAN LIVE te fait gravir l’Expédition, balise après balise ; il s’ouvre progressivement.", target: "Une balise de plus" },
  { space: "profil", tab: 4, title: "Ton parcours t’appartient.", text: "Tes sports, tes records et ton rang se construisent séance après séance, seul ou avec tes amis. Rien ne s’achète : tout se gagne à l’effort.", target: "Ton rang" },
];
const TABS: { label: string; icon: IconName; space: SpaceId }[] = [
  { label: "QG", icon: "home", space: "qg" }, { label: "Progrès", icon: "chart", space: "progres" }, { label: "Séance", icon: "plus", space: "seance" },
  { label: "Aventure", icon: "compass", space: "aventure" }, { label: "Profil", icon: "user", space: "profil" },
];

// Demonstration figures, built once: the same shapes the real screens receive.
const cell = (minutes: number): ProgramCell => (minutes ? { minutes, sessions: 1, level: minutes < 20 ? 1 : minutes < 45 ? 2 : minutes < 75 ? 3 : 4 } : null);
const DAYS = ["L", "M", "M", "J", "V", "S", "D"].map((letter, index) => ({ key: `d${index}`, index, letter, name: "", date: index + 1, today: index === 3, future: index > 3 }));
const DEMO_WEEK: ProgramWeek = {
  kind: "week", from: "", to: "", days: DAYS, more: null, planned: [{ day: 5, sport: "running", label: "Course à pied", family: "endurance", row: 0 }],
  rows: [
    { sport: "running", label: "Course à pied", family: "endurance", minutes: 95, sessions: 2, cells: [cell(50), null, null, cell(45), null, null, null] },
    { sport: "muscu_gym", label: "Musculation", family: "force", minutes: 60, sessions: 1, cells: [null, cell(60), null, null, null, null, null] },
  ],
  totals: { minutes: 155, sessions: 3, activeDays: 3, cells: [50, 60, 0, 45, 0, 0, 0] },
};
const DEMO_SPAN: ProgramSpan = {
  kind: "span", from: "", to: "", more: null, totals: { minutes: 0, sessions: 0, cells: [] },
  columns: Array.from({ length: 8 }, (_, index) => ({ key: `w${index}`, index, date: 8 + index, month: 10, current: index === 7 })),
  rows: [
    { sport: "running", label: "Course à pied", family: "endurance", minutes: 640, sessions: 12, cells: [80, 0, 95, 120, 60, 130, 90, 95].map((m) => (m ? { minutes: m, sessions: 1, days: 1, level: m < 60 ? 1 : m < 120 ? 2 : 3 } : null)) as ProgramCell[] },
    { sport: "bouldering", label: "Escalade bloc", family: "technique", minutes: 360, sessions: 5, cells: [90, 0, 0, 90, 0, 90, 0, 90].map((m) => (m ? { minutes: m, sessions: 1, days: 1, level: 2 } : null)) as ProgramCell[] },
  ],
};

/** The ring around the one element of the stop that can be touched. It breathes; with reduced motion it simply stands. */
function Target({ label, color, onPress, children, testID }: { label: string; color: string; onPress: () => void; children: ReactNode; testID: string }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return (
    <Tap onPress={onPress} testID={testID} accessibilityLabel={`${label}. Toucher pour continuer la visite.`} style={styles.target}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: color, opacity: pulse }]} />
    </Tap>
  );
}

function Scene({ index, onTarget, beats, onBeat }: { index: number; onTarget: () => void; beats: number; onBeat: () => void }) {
  const insets = useSafeAreaInsets();
  if (index === 0)
    return (
      <View>
        <View style={[styles.banner, { paddingTop: insets.top + 56 }]}>
          <Image source={worldImages.valley ?? heroImage} style={styles.art} resizeMode="cover" accessibilityIgnoresInvertColors />
          <Shade from={0.3} start={0.2} to={1} />
          <T variant="h1">Bonjour, toi</T>
          <View style={styles.identity}>
            <View style={{ flex: 1, gap: 6 }}>
              <T variant="title">Niveau 3 · <T variant="title" color={colors.cy2}>Éclaireur</T></T>
              <ProgressBar value={0.42} height={4} track="rgba(241,243,239,0.2)" accessibilityLabel="Exemple de progression" />
            </View>
            <RankCrest rank="eclaireur" size={56} />
          </View>
        </View>
        <View style={styles.pad}>
          <Target label={STOPS[0]!.target} color={colors.tx} onPress={onTarget} testID="tour-target">
            <View style={[styles.slab, { backgroundColor: spaces.qg.accent }]}>
              <T variant="h2" color={spaces.qg.ink}>Ta séance du jour</T>
              <T color={spaces.qg.ink} style={{ opacity: 0.84 }}>Une action à la fois : celle qui fait avancer ta semaine.</T>
            </View>
          </Target>
          <ProgramGrid grid={DEMO_WEEK} />
        </View>
      </View>
    );
  if (index === 1)
    return (
      <View>
        <View style={[styles.field, { backgroundColor: spaces.seance.accent, paddingTop: insets.top + 56 }]}>
          <T variant="display" color={spaces.seance.ink}>Qu’as-tu fait ?</T>
          <T color={spaces.seance.ink} style={{ opacity: 0.8 }}>Choisis ton sport et note l’essentiel.</T>
          <Target label={STOPS[1]!.target} color={spaces.seance.ink} onPress={onTarget} testID="tour-target">
            <View style={[styles.fakeButton, { backgroundColor: spaces.seance.ink }]}>
              <Icon name="search" size={20} color={spaces.seance.accent} />
              <T variant="title" color={spaces.seance.accent}>Choisir un sport</T>
            </View>
          </Target>
        </View>
        <View style={styles.pad}>
          {[["route", "Suivre ma sortie en GPS", "Distance, allure et dénivelé, écran verrouillé"], ["journal", "Mon journal", "Toutes tes séances, modifiables, exportables"], ["chart", "Mes progrès", "Semaine, tendances, records et maîtrise de chaque sport"]].map(([icon, title, text]) => (
            <View key={title} style={styles.row}>
              <Icon name={icon as IconName} size={22} color={colors.tx2} />
              <View style={{ flex: 1 }}>
                <T variant="title">{title}</T>
                <T variant="caption">{text}</T>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  if (index === 2)
    return (
      <View>
        <View style={[styles.banner, { paddingTop: insets.top + 56, minHeight: 230 }]}>
          <Image source={worldImages.valley ?? heroImage} style={styles.art} resizeMode="cover" accessibilityIgnoresInvertColors />
          <Shade from={0.25} start={0.25} to={1} />
          <T variant="title" color={colors.mousse}>La vallée de l’Aube · chapitre 1/9</T>
          <T variant="h1">Le premier feu</T>
        </View>
        <View style={styles.pad}>
          <LiveTrail lit={beats} planned={6} echo={null} beatOne="balise" beatMany="balises" label="L’Expédition" seed="running" family="endurance" elan={{ value: 20 + beats * 10, max: 90 }} />
          <Target label={STOPS[2]!.target} color={colors.mousse} onPress={beats >= 6 ? onTarget : onBeat} testID="tour-target">
            <View style={[styles.fakeButton, { backgroundColor: colors.bg3 }]}>
              <Icon name="plus" size={20} color={colors.mousse} />
              <T variant="title">{beats >= 6 ? "Sommet atteint · continuer" : "Simuler un temps fort"}</T>
            </View>
          </Target>
        </View>
      </View>
    );
  return (
    <View>
      <View style={[styles.field, { backgroundColor: spaces.profil.accent, paddingTop: insets.top + 84 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s4 }}>
          <Avatar id="scout" size={68} />
          <View style={{ flex: 1 }}>
            <T variant="h1" color={spaces.profil.ink}>Toi</T>
            <T variant="title" color={spaces.profil.ink} style={{ opacity: 0.78 }}>Niveau 3 · Éclaireur</T>
          </View>
          <Target label={STOPS[3]!.target} color={spaces.profil.ink} onPress={onTarget} testID="tour-target">
            <RankCrest rank="eclaireur" size={68} />
          </Target>
        </View>
      </View>
      <View style={styles.pad}>
        <T variant="h3">Mes sports</T>
        <ProgramGrid grid={DEMO_SPAN} />
        <View style={styles.row}>
          <Icon name="group" size={22} color={colors.corail} />
          <View style={{ flex: 1 }}>
            <T variant="title">Amis, défis, clubs</T>
            <T variant="caption">Chacun son sport, à égalité : tout se compte en minutes d’effort.</T>
          </View>
        </View>
      </View>
    </View>
  );
}

export function TourScreen({ navigation, route }: NativeStackScreenProps<RootParams, "Tour">) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const replay = route.params?.replay === true;
  const [index, setIndex] = useState(0);
  const [beats, setBeats] = useState(2);
  const fade = useRef(new Animated.Value(1)).current;
  const stop = STOPS[index]!;
  const theme = spaces[stop.space];

  // An interrupted first visit resumes where it stopped. A replay always starts at the beginning and never changes the state.
  useEffect(() => {
    if (replay) return;
    let alive = true;
    loadFirstVisit().then((v) => alive && !v.seen && v.step > 0 && setIndex(v.step));
    return () => {
      alive = false;
    };
  }, [replay]);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Étape ${index + 1} sur ${FIRST_VISIT_STEPS}. ${stop.title} ${stop.text}`);
    if (reduced) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index, fade, reduced, stop.title, stop.text]);

  const leave = useCallback(() => {
    if (replay) return navigation.goBack();
    closeFirstVisit();
    navigation.reset({ index: 0, routes: [{ name: "Welcome" }] });
  }, [navigation, replay]);
  const go = useCallback((next: number) => {
    if (next >= FIRST_VISIT_STEPS) return leave();
    haptic("selection");
    setIndex(next);
    if (!replay) saveFirstVisitStep(next);
  }, [leave, replay]);

  // Android Back walks the visit backwards; on the first stop it does what Back does anywhere (leave the screen or the app).
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (index === 0) return false;
      go(index - 1);
      return true;
    });
    return () => sub.remove();
  }, [index, go]));

  return (
    <SpaceProvider space={theme}>
      <View style={styles.root} testID="tour">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.s4 }} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
            <Scene index={index} onTarget={() => go(index + 1)} beats={beats} onBeat={() => { haptic("selection"); setBeats((n) => Math.min(6, n + 1)); }} />
          </Animated.View>
        </ScrollView>

        {/* Above the scene: where we are in the visit, that these figures are an example, and the way out. */}
        <View style={[styles.top, { paddingTop: insets.top + space.s2 }]} pointerEvents="box-none">
          <View style={styles.steps} accessible accessibilityRole="progressbar" accessibilityLabel={`Visite guidée, étape ${index + 1} sur ${FIRST_VISIT_STEPS}`} accessibilityValue={{ min: 1, max: FIRST_VISIT_STEPS, now: index + 1 }}>
            {STOPS.map((s, i) => <View key={s.space} style={[styles.step, { backgroundColor: i <= index ? colors.tx : "rgba(241,243,239,0.28)" }]} />)}
          </View>
          <View style={styles.topRow}>
            <View style={styles.demo}><T variant="caption" color={colors.tx}>Démonstration</T></View>
            <Tap onPress={leave} accessibilityLabel={replay ? "Fermer la visite" : "Passer la visite"} style={styles.skip} testID="tour-skip">
              <T variant="caption" color={colors.tx}>{replay ? "Fermer" : "Passer"}</T>
            </Tap>
          </View>
        </View>

        {/* The twin of the real tab bar: the space being visited is lit in its colour. */}
        <View style={styles.tabs} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {TABS.map((t, i) => {
            const on = i === stop.tab;
            const tint = on ? spaces[t.space].accent : colors.tx3;
            return (
              <View key={t.label} style={styles.tab}>
                {i === 2 ? (
                  <View style={[styles.plus, on && styles.plusOn]}><Icon name="plus" size={24} color={spaces.seance.ink} strokeWidth={2.6} /></View>
                ) : (
                  <Icon name={t.icon} size={22} color={tint} strokeWidth={on ? 2.1 : 1.65} />
                )}
                <T variant="caption" style={styles.tabLabel} color={tint}>{t.label}</T>
                {on ? <View style={[styles.tabMark, { backgroundColor: spaces[t.space].accent }]} /> : null}
              </View>
            );
          })}
        </View>

        <View style={[styles.coach, { paddingBottom: insets.bottom + space.s4 }]}>
          <T variant="caption" tone="faint">{index + 1} sur {FIRST_VISIT_STEPS}</T>
          <T variant="h2">{stop.title}</T>
          <T tone="muted">{stop.text}</T>
          <View style={styles.actions}>
            {index > 0 ? <Button kind="secondary" label="Retour" onPress={() => go(index - 1)} testID="tour-back" style={{ flexGrow: 1 }} /> : null}
            <Button label={index === FIRST_VISIT_STEPS - 1 ? (replay ? "Terminer la visite" : "Créer mon compte et commencer") : "Continuer"} onPress={() => go(index + 1)} testID="tour-next" style={{ flexGrow: 2 }} />
          </View>
        </View>
      </View>
    </SpaceProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: space.s5, gap: space.s2 },
  steps: { flexDirection: "row", gap: 6 },
  step: { flex: 1, height: 3, borderRadius: 2 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  demo: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, backgroundColor: "rgba(9,12,16,0.72)" },
  skip: { minHeight: TOUCH, minWidth: TOUCH + 16, alignItems: "center", justifyContent: "center", paddingHorizontal: space.s3, borderRadius: 4, backgroundColor: "rgba(9,12,16,0.72)" },
  banner: { minHeight: 260, paddingHorizontal: space.s5, paddingBottom: space.s3, justifyContent: "flex-end", gap: space.s2 },
  art: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, width: "100%", height: "100%" },
  identity: { flexDirection: "row", alignItems: "flex-end", gap: space.s4 },
  field: { paddingHorizontal: space.s5, paddingBottom: space.s5, gap: space.s3 },
  pad: { paddingHorizontal: space.s5, paddingTop: space.s4, gap: space.s4 },
  slab: { borderRadius: 12, padding: space.s5, gap: space.s1 },
  fakeButton: { minHeight: TOUCH + 4, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.s2, paddingHorizontal: space.s4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: 60, paddingVertical: space.s2, borderTopWidth: 1, borderTopColor: colors.line },
  target: { borderRadius: 12 },
  ring: { position: "absolute", left: -5, right: -5, top: -5, bottom: -5, borderRadius: 14, borderWidth: 2 },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.line2, backgroundColor: colors.bg, paddingTop: 6, paddingBottom: 4 },
  tab: { flex: 1, alignItems: "center", gap: 3, minHeight: 50 },
  tabLabel: { fontFamily: fonts.textBold, fontSize: 11, lineHeight: 14 },
  tabMark: { position: "absolute", top: -7, width: 28, height: 2 },
  plus: { width: 48, height: 30, borderRadius: 8, backgroundColor: colors.signal, alignItems: "center", justifyContent: "center", opacity: 0.6 },
  plusOn: { opacity: 1 },
  coach: { backgroundColor: colors.bg2, paddingHorizontal: space.s5, paddingTop: space.s4, gap: space.s2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.s2, paddingTop: space.s2 },
});
