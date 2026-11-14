import { Image, StyleSheet, View } from "react-native";
import { Format } from "../core";
import { avatarImages, heroImage } from "../core/images";
import { colors, radius, space, TOUCH } from "../theme/tokens";
import { Avatar } from "./Avatar";
import { RankCrest, rankIdOf } from "./Crest";
import { Brand } from "./Brand";
import { Tap } from "./Pressable";
import { ProgressBar } from "./Progress";
import { Shade } from "./Shade";
import { T } from "./Text";

const fr = (n: number) => Format.number(Math.round(n));

/** The QG's welcome: the world the player is walking through as a backdrop, the brand, the character (crest, level, rank and the XP
    towards the next level) and TITAN's voice. One scene: who I am and where I stand. The chapter in progress is told once, by the
    progression card below, not repeated here. */
export function QgBanner({ greeting, line, level, rankName, xp, need, avatar, frame, image, accent, onProfile }: {
  greeting: string;
  line: string;
  level?: number;
  rankName: string;
  /** XP inside the current level and what the next level asks, both from the server snapshot. Without them the bar is not drawn. */
  xp?: number;
  need?: number;
  avatar?: string;
  frame?: string;
  image?: number | null;
  /** The world's colour, used once, for the rank line. */
  accent?: string;
  onProfile: () => void;
}) {
  const hasXp = level !== undefined && xp !== undefined && need !== undefined && need > 0;
  return (
    <View style={styles.wrap} testID="qg-banner">
      <Image source={image ?? heroImage} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
      <Shade from={0.55} start={0.05} to={0.94} />
      <View style={styles.top}>
        <Brand size={26} />
        <Tap onPress={onProfile} accessibilityLabel={level === undefined ? "Profil" : `Profil, niveau ${level}, ${rankName}`} style={styles.me} testID="qg-profile">
          <Avatar id={avatar && avatarImages[avatar] ? avatar : "scout"} frame={frame} size={36} />
        </Tap>
      </View>
      {level !== undefined ? <View style={styles.identity} testID="qg-identity">
        <RankCrest rank={rankIdOf(level)} size={52} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <T variant="bodyStrong">
            Niveau {level} · <T variant="bodyStrong" color={accent ?? colors.cy2}>{rankName}</T>
          </T>
          {hasXp ? <>
            <ProgressBar value={xp! / need!} height={6} track="rgba(238,243,247,0.16)" accessibilityLabel={`Progression vers le niveau ${level + 1}`} />
            <T variant="caption" tone="default" style={{ opacity: 0.86 }}>
              {fr(xp!)} / {fr(need!)} XP vers le niveau {level + 1}
            </T>
          </> : null}
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
  me: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", minHeight: TOUCH, minWidth: TOUCH, borderRadius: radius.pill },
  identity: { flexDirection: "row", gap: space.s3, alignItems: "center" },
  bottom: { gap: 4 },
});
