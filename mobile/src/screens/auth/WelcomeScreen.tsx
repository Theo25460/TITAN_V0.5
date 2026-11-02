import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Image, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Brand } from "../../components/Brand";
import { Button } from "../../components/Button";
import { Icon, type IconName } from "../../components/Icon";
import { Reveal } from "../../components/Motion";
import { Shade } from "../../components/Shade";
import { T } from "../../components/Text";
import { heroImage, worldImages } from "../../core/images";
import { useAuth } from "../../data/auth";
import type { RootParams } from "../../navigation/types";
import { colors, radius, space } from "../../theme/tokens";

/** TITAN's loop, shown rather than told: a real session becomes progress, and progress moves an adventure. */
const LOOP: { icon?: IconName; image?: number; color: string; title: string; text: string }[] = [
  { icon: "run", color: colors.cy, title: "Ta séance", text: "Course, muscu, escalade… 260 sports, saisis en moins d’une minute, même hors ligne." },
  { icon: "ascent", color: colors.am, title: "Ta progression", text: "XP calculée sur ton effort réel, records et maîtrise de chaque sport." },
  { image: worldImages.valley, color: "#9EE6C8", title: "Ton aventure", text: "Tes jours actifs allument les balises de quatre mondes illustrés." },
];

export function WelcomeScreen({ navigation }: NativeStackScreenProps<RootParams, "Welcome">) {
  const insets = useSafeAreaInsets();
  const { notice, clearNotice } = useAuth();
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s4, paddingBottom: insets.bottom + space.s4 }]}>
      <View style={styles.heroWrap}>
        <Image source={heroImage} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
        <Shade from={0.3} start={0.05} to={1} />
      </View>
      <View style={styles.content}>
        <Brand size={40} />
        <Reveal style={{ gap: space.s3 }}>
          <T variant="display">Ton sport réel.{"\n"}Une progression qui dure.</T>
          <T variant="body" tone="muted">
            Gratuit, sans publicité, sans achat pour progresser.
          </T>
        </Reveal>
        <View accessibilityRole="list">
          {LOOP.map((step, i) => (
            <Reveal key={step.title} order={1 + i} style={styles.step}>
              <View style={styles.rail}>
                <View style={[styles.segment, { opacity: i === 0 ? 0 : 1 }]} />
                {step.image ? (
                  <Image source={step.image} style={[styles.disc, { borderColor: step.color }]} />
                ) : (
                  <View style={[styles.disc, { borderColor: step.color, backgroundColor: `${step.color}1F` }]}>
                    <Icon name={step.icon!} size={22} color={step.color} />
                  </View>
                )}
                <View style={[styles.segment, { opacity: i === LOOP.length - 1 ? 0 : 1 }]} />
              </View>
              <View style={styles.stepText} accessible accessibilityLabel={`${i + 1}. ${step.title}. ${step.text}`}>
                <T variant="bodyStrong" color={step.color}>
                  {step.title}
                </T>
                <T variant="small" tone="default">
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
  heroWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: space.s5, gap: space.s4 },
  step: { flexDirection: "row", gap: space.s3, minHeight: 74 },
  rail: { width: 48, alignItems: "center" },
  segment: { flex: 1, width: 2, backgroundColor: colors.line3 },
  disc: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  stepText: { flex: 1, justifyContent: "center", gap: 2, paddingVertical: space.s2 },
  notice: { padding: space.s3, borderRadius: radius.r2, backgroundColor: colors.warnSoft },
});
