import { ADS_BUILD } from "../../ads/adIds";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Brand } from "../../components/Brand";
import { Button } from "../../components/Button";
import type { IconName } from "../../components/Icon";
import { Reveal } from "../../components/Motion";
import { Shade } from "../../components/Shade";
import { T } from "../../components/Text";
import { heroImage, worldImages } from "../../core/images";
import { useAuth } from "../../data/auth";
import { fetchPublicFlags } from "../../data/api";
import type { RootParams } from "../../navigation/types";
import { colors, radius, space } from "../../theme/tokens";

/** TITAN's loop, shown rather than told: a real session becomes progress, and progress moves an adventure. */
const LOOP: { icon?: IconName; image?: number; color: string; title: string; text: string }[] = [
  { icon: "run", color: colors.signal, title: "Ta séance", text: "Course, muscu, escalade… 260 sports, saisis en moins d’une minute, même hors ligne." },
  { icon: "ascent", color: colors.azur, title: "Ta progression", text: "XP calculée sur ton effort réel, records et maîtrise de chaque sport." },
  { image: worldImages.valley, color: colors.mousse, title: "Ton aventure", text: "Tes jours actifs allument les balises de quatre mondes illustrés." },
];

export function WelcomeScreen({ navigation }: NativeStackScreenProps<RootParams, "Welcome">) {
  const insets = useSafeAreaInsets();
  const { notice, clearNotice, startDiscovery } = useAuth();
  // AUD-20: « Essayer sans compte » only when the owner opened discovery accounts (flag auth.anonymous + Supabase anonymous sign-ins).
  const [discovery, setDiscovery] = useState(false);
  const [starting, setStarting] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchPublicFlags().then((f) => alive && setDiscovery(f["auth.anonymous"] === true));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s4, paddingBottom: insets.bottom + space.s4 }]}>
      <View style={styles.heroWrap}>
        <Image source={heroImage} style={styles.heroArt} resizeMode="cover" accessibilityIgnoresInvertColors />
        <Shade from={0.35} start={0.1} to={1} />
      </View>
      <View style={styles.content}>
        <Brand size={40} />
        <Reveal style={{ gap: space.s3 }}>
          <T variant="display">Tes efforts deviennent une aventure.</T>
          <T variant="body" tone="muted">
            {ADS_BUILD ? "Gratuit. Des publicités, jamais pendant une séance ; aucune avec TITAN+." : "Gratuit, sans publicité, sans achat pour progresser."}
          </T>
        </Reveal>
        {/* The loop in three ruled lines, each in the colour of the space it leads to: record, measure, adventure. */}
        <View accessibilityRole="list" style={styles.loop}>
          {LOOP.map((step, i) => (
            <Reveal key={step.title} order={1 + i} style={styles.step}>
              <View style={[styles.swatch, { backgroundColor: step.color }]} />
              <View style={styles.stepText} accessible accessibilityLabel={`${i + 1}. ${step.title}. ${step.text}`}>
                <T variant="title">{step.title}</T>
                <T variant="small" tone="default" style={{ opacity: 0.86 }}>
                  {step.text}
                </T>
              </View>
            </Reveal>
          ))}
        </View>
        {notice ? (
          <View style={styles.notice} accessibilityRole="alert">
            <T variant="small" tone="warn">
              {notice}
            </T>
          </View>
        ) : null}
        <View style={{ gap: space.s3 }}>
          <Button label="Créer mon compte" testID="welcome-signup" onPress={() => { clearNotice(); navigation.navigate("Signup"); }} />
          <Button label="J’ai déjà un compte" kind="secondary" testID="welcome-login" onPress={() => { clearNotice(); navigation.navigate("Login"); }} />
          {discovery ? (
            <Button
              label="Essayer sans compte"
              kind="ghost"
              testID="welcome-discovery"
              loading={starting}
              onPress={async () => {
                clearNotice();
                setDiscoveryError(null);
                setStarting(true);
                try {
                  await startDiscovery();
                } catch (e) {
                  setDiscoveryError(e instanceof Error ? e.message : String(e));
                } finally {
                  setStarting(false);
                }
              }}
            />
          ) : null}
          {discoveryError ? <T variant="small" tone="warn" accessibilityRole="alert">{discoveryError}</T> : null}
          <Button label="Revoir la visite guidée" kind="ghost" small testID="welcome-tour" onPress={() => navigation.navigate("Tour", { replay: true })} />
          <T variant="caption" tone="faint" center>
            Le même compte que sur titan-app.fr : tes séances et ta progression te suivent.
          </T>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heroWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  // A bundled image carries its own pixel size in its style: without an explicit size the painting is not scaled to its box.
  heroArt: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: space.s5, gap: space.s4 },
  loop: { borderTopWidth: 2, borderTopColor: colors.tx },
  step: { flexDirection: "row", gap: space.s3, alignItems: "flex-start", paddingVertical: space.s3, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  swatch: { width: 10, height: 10, marginTop: 6 },
  stepText: { flex: 1, gap: 2 },
  notice: { padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.warnSoft },
});
