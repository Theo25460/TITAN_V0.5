import { useHeaderHeight } from "@react-navigation/elements";
import { forwardRef, type ReactNode } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, space } from "../theme/tokens";
import { OfflineBanner } from "./OfflineBanner";

type Props = ScrollViewProps & {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Screens inside the tab bar get no bottom inset (the tab bar handles it). */
  tab?: boolean;
  footer?: ReactNode;
  padded?: boolean;
  keyboard?: boolean;
};

/** Standard scrolling screen: safe areas, pull-to-refresh, offline banner and keyboard handling. */
export const Screen = forwardRef<ScrollView, Props>(function Screen({ children, refreshing = false, onRefresh, tab = false, footer, padded = true, keyboard = false, contentContainerStyle, ...rest }, ref) {
  const insets = useSafeAreaInsets();
  let headerHeight = 0;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    headerHeight = useHeaderHeight();
  } catch {
    headerHeight = 0;
  }
  const body = (
    <View style={styles.root}>
      <OfflineBanner />
      <ScrollView
        ref={ref}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cy} colors={[colors.cy]} progressBackgroundColor={colors.bg3} /> : undefined}
        contentContainerStyle={[padded && styles.padded, { paddingBottom: (tab ? space.s7 : insets.bottom + space.s7) + (footer ? 84 : 0) }, contentContainerStyle]}
        {...rest}
      >
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.s3 }]}>{footer}</View> : null}
    </View>
  );
  if (!keyboard) return body;
  return (
    <KeyboardAvoidingView style={styles.root} behavior="height" keyboardVerticalOffset={headerHeight}>
      {body}
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  padded: { paddingHorizontal: space.s4, paddingTop: space.s4, gap: space.s4 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.s4, paddingTop: space.s3, backgroundColor: "rgba(5,7,10,0.96)", borderTopWidth: 1, borderTopColor: colors.line },
});
