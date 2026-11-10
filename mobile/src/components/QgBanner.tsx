import { Image, StyleSheet, View } from "react-native";
import { avatarImages, heroImage } from "../core/images";
import { colors, radius, space, TOUCH } from "../theme/tokens";
import { Avatar } from "./Avatar";
import { RankCrest, rankIdOf } from "./Crest";
import { Brand } from "./Brand";
import { Tap } from "./Pressable";
import { Shade } from "./Shade";
import { T } from "./Text";

/** The QG's welcome: the world the player is walking through as a backdrop, the brand, the rank, and TITAN's voice (immersion).
    One block replaces the bare top bar and greeting, so the first screen feels like arriving somewhere, not opening a form. */
export function QgBanner({ greeting, line, level, rankName, avatar, frame, image, accent, onProfile, worldName, chapterText }: {
  greeting: string;
  line: string;
  level?: number;
  rankName: string;
  avatar?: string;
  frame?: string;
  image?: number | null;
  /** The world's colour, used once, for the rank line. */
  accent?: string;
  onProfile: () => void;
  worldName?: string;
  chapterText?: string;
}) {
  return (
    <View style={styles.wrap} testID="qg-banner">
      <Image source={image ?? heroImage} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
      <Shade from={0.55} start={0.05} to={0.94} />
      <View style={styles.top}>
        <Brand size={26} />
        <Tap onPress={onProfile} accessibilityLabel={level === undefined ? "Profil" : `Profil, niveau ${level}, ${rankName}`} style={styles.me} testID="qg-profile">
          {level !== undefined ? <View style={{ alignItems: "flex-end" }}>
            <T variant="caption" tone="default">
              Niv. {level}
            </T>
            <T variant="caption" color={accent ?? colors.cy2} numberOfLines={1}>
              {rankName}
            </T>
          </View> : null}
          <Avatar id={avatar && avatarImages[avatar] ? avatar : "scout"} frame={frame} size={36} />
        </Tap>
      </View>
      {level !== undefined ? <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <RankCrest rank={rankIdOf(level)} size={48} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <T variant="bodyStrong">{worldName ?? "Ton prochain monde t’attend"}</T>
          <T variant="caption" tone="muted">{chapterText ?? "Choisis une campagne : tes prochaines séances y allumeront les balises."}</T>
        </View>
      </View> : null}
      <View style={styles.bottom}>
        <T variant="h2">
          {greeting}
        </T>
        <T variant="small" tone="default" style={{ opacity: 0.92 }}>
          {line}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 176, borderRadius: radius.r3, overflow: "hidden", borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.bg1, padding: space.s4, justifyContent: "space-between", gap: space.s5 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  me: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: TOUCH, paddingLeft: 10, borderRadius: radius.pill },
  bottom: { gap: 4 },
});
