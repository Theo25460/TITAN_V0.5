import { Image, StyleSheet, View } from "react-native";
import { colors } from "../theme/tokens";
import { T } from "./Text";

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const mark = require("../../assets/brand/mark.png");

export function Brand({ size = 34, word = true }: { size?: number; word?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel="TITAN">
      <Image source={mark} style={{ width: size, height: size, borderRadius: size * 0.28 }} />
      {word ? (
        <T variant="h2" style={{ letterSpacing: 2.2, fontSize: size * 0.62, lineHeight: size * 0.75 }} color={colors.tx}>
          TITAN
        </T>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: 10 } });
