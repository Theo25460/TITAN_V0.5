import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Image, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Brand } from "../../components/Brand";
import { Button } from "../../components/Button";
import { Icon, type IconName } from "../../components/Icon";
import { T } from "../../components/Text";
import { heroImage } from "../../core/images";
import { useAuth } from "../../data/auth";
import type { RootParams } from "../../navigation/types";
import { colors, space } from "../../theme/tokens";

const POINTS: [IconName, string][] = [
  ["bolt", "Enregistre une séance en moins d’une minute, même hors ligne."],
  ["chart", "Comprends ta progression : semaine, records, maîtrises."],
  ["compass", "Chaque effort réel fait avancer ton aventure."],
];

export function WelcomeScreen({ navigation }: NativeStackScreenProps<RootParams, "Welcome">) {
  const insets = useSafeAreaInsets();
  const { notice, clearNotice } = useAuth();
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s4, paddingBottom: insets.bottom + space.s4 }]}>
      <Image source={heroImage} style={styles.hero} resizeMode="cover" accessibilityIgnoresInvertColors />
      <View style={styles.fade} />
      <View style={styles.content}>
        <Brand size={40} />
        <View style={{ gap: space.s3 }}>
          <T variant="display">Fais du sport.{"\n"}TITAN le transforme en progression.</T>
          <T variant="body" tone="muted">
            Ton journal multisport, tes statistiques et une aventure qui avance avec tes vraies séances. Gratuit, sans publicité.
          </T>
        </View>
        <View style={{ gap: space.s3 }}>
          {POINTS.map(([icon, text]) => (
            <View key={text} style={styles.point}>
              <Icon name={icon} size={20} color={colors.cy} />
              <T variant="small" tone="default" style={{ flex: 1 }}>
                {text}
              </T>
            </View>
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
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: "52%", opacity: 0.55 },
  fade: { position: "absolute", top: "30%", left: 0, right: 0, height: "24%", backgroundColor: colors.bg, opacity: 0.6 },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: space.s5, gap: space.s5 },
  point: { flexDirection: "row", gap: space.s3, alignItems: "center" },
  notice: { padding: space.s3, borderRadius: 12, backgroundColor: colors.warnSoft },
});
