import { Image, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Format } from "../core";
import { avatarImages, heroImage } from "../core/images";
import { colors, space, TOUCH } from "../theme/tokens";
import { Avatar } from "./Avatar";
import { RankCrest, rankIdOf } from "./Crest";
import { Brand } from "./Brand";
import { Tap } from "./Pressable";
import { ProgressBar } from "./Progress";
import { Shade } from "./Shade";
import { T } from "./Text";

const fr = (n: number) => Format.number(Math.round(n));

/** The QG opens on the world the player is walking through: the painting runs edge to edge and under the status bar, then
    dissolves into the ground, so the page starts in the adventure and continues in the sport. On it: the brand, the greeting set
    large, the character (crest, level, rank) and the XP towards the next level drawn as one line across the screen. No frame:
    the picture is the header, not a card inside it. */
export function QgBanner({ greeting, line, level, rankName, xp, need, avatar, frame, image, accent, onProfile }: {
  greeting: string;
  line: string;
  level?: number;
  rankName: string;
  /** XP inside the current level and what the next level asks, both from the server snapshot. Without them the line is not drawn. */
  xp?: number;
  need?: number;
  avatar?: string;
  frame?: string;
  image?: number | null;
  /** The world's colour, used once, for the rank. */
  accent?: string;
  onProfile: () => void;
}) {
  const insets = useSafeAreaInsets();
  const hasXp = level !== undefined && xp !== undefined && need !== undefined && need > 0;
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.s2 }]} testID="qg-banner">
      <Image source={image ?? heroImage} style={styles.art} resizeMode="cover" accessibilityIgnoresInvertColors />
      <Shade from={0.28} start={0.18} to={1} />
      <View style={styles.top}>
        <Brand size={26} />
        <Tap onPress={onProfile} accessibilityLabel={level === undefined ? "Profil" : `Profil, niveau ${level}, ${rankName}`} style={styles.me} testID="qg-profile">
          <Avatar id={avatar && avatarImages[avatar] ? avatar : "scout"} frame={frame} size={38} />
        </Tap>
      </View>
      <View style={styles.bottom}>
        <T variant="display">{greeting}</T>
        <T variant="small" tone="default" style={{ opacity: 0.9, maxWidth: 520 }}>{line}</T>
        {level !== undefined ? (
          <View style={styles.identity} testID="qg-identity">
            <View style={{ flex: 1, minWidth: 0, gap: space.s2 }}>
              <T variant="title">
                Niveau {level} · <T variant="title" color={accent ?? colors.cy2}>{rankName}</T>
              </T>
              {hasXp ? (
                <>
                  <ProgressBar value={xp! / need!} height={4} track="rgba(241,243,239,0.2)" accessibilityLabel={`Progression vers le niveau ${level + 1}`} />
                  <T variant="caption" tone="default" style={{ opacity: 0.86 }}>
                    {fr(xp!)} / {fr(need!)} XP vers le niveau {level + 1}
                  </T>
                </>
              ) : null}
            </View>
            <RankCrest rank={rankIdOf(level)} size={72} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 300, paddingHorizontal: space.s5, paddingBottom: space.s2, justifyContent: "space-between", gap: space.s8, backgroundColor: colors.bg },
  art: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, width: "100%", height: "100%" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  me: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", minHeight: TOUCH, minWidth: TOUCH },
  bottom: { gap: space.s2 },
  identity: { flexDirection: "row", gap: space.s4, alignItems: "flex-end", marginTop: space.s3 },
});
