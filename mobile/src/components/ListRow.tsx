import { StyleSheet, View } from "react-native";
import { colors, space, TOUCH } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

export function ListRow({ icon, title, subtitle, value, onPress, danger, right, testID, last }: { icon?: IconName; title: string; subtitle?: string; value?: string; onPress?: () => void; danger?: boolean; right?: React.ReactNode; testID?: string; last?: boolean }) {
  const content = (
    <View style={[styles.row, !last && styles.border]}>
      {icon ? (
        <View style={[styles.icon, danger && { backgroundColor: colors.errSoft }]}>
          <Icon name={icon} size={20} color={danger ? colors.err : colors.cy} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong" color={danger ? colors.err : undefined}>
          {title}
        </T>
        {subtitle ? <T variant="small">{subtitle}</T> : null}
      </View>
      {value ? (
        <T variant="small" tone="faint" numberOfLines={1} style={{ maxWidth: "40%" }}>
          {value}
        </T>
      ) : null}
      {right}
      {onPress ? <Icon name="chevron" size={18} color={colors.tx4} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Tap onPress={onPress} testID={testID} accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}>
      {content}
    </Tap>
  );
}

export function Group({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <View style={{ gap: space.s2 }}>
      {title ? <T variant="eyebrow" style={{ paddingHorizontal: 4 }}>{title}</T> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: TOUCH + 12, paddingHorizontal: space.s4, paddingVertical: space.s3 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.line },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.cySoft, alignItems: "center", justifyContent: "center" },
  group: { backgroundColor: colors.bg2, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
});
