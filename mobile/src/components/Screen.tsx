import { useHeaderHeight } from "@react-navigation/elements";
import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";
import { SpaceProvider, spaceOfRoute } from "../theme/space";
import { colors, space, type SpaceId } from "../theme/tokens";
import { OfflineBanner } from "./OfflineBanner";

/** Window height (dp) under which the footer stops being fixed. */
export const SHORT_WINDOW = 520;

type Props = ScrollViewProps & {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Screens inside the tab bar get no bottom inset (the tab bar handles it). */
  tab?: boolean;
  footer?: ReactNode;
  padded?: boolean;
  keyboard?: boolean;
  /** The space this screen belongs to. By default it follows the route (theme/space.tsx). */
  space?: SpaceId;
};

/** Standard scrolling screen: safe areas, pull-to-refresh, offline banner and keyboard handling. */
export const Screen = forwardRef<ScrollView, Props>(function Screen({ children, refreshing = false, onRefresh, tab = false, footer, padded = true, keyboard = false, space: spaceId, contentContainerStyle, ...rest }, ref) {
  const insets = useSafeAreaInsets();
  // With the keyboard open the footer joins the layout instead of floating over it: it never hides the field being typed in.
  const [typing, setTyping] = useState(false);
  const hasFooter = Boolean(footer);
  useEffect(() => {
    if (!hasFooter) return;
    const show = Keyboard.addListener("keyboardDidShow", () => setTyping(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setTyping(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [hasFooter]);
  // Landscape, split window, small fold: under this height a fixed footer would leave the form a sliver, so it scrolls with the content.
  const { height } = useWindowDimensions();
  const short = height < SHORT_WINDOW;
  const scrollsWithContent = !!footer && short;
  const floating = !!footer && !typing && !short;
  let routeName: string | undefined;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    routeName = useRoute().name;
  } catch {
    routeName = undefined;
  }
  const theme = spaceId ? spaceId : spaceOfRoute(routeName);
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
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tx2} colors={[colors.bg]} progressBackgroundColor={colors.tx} /> : undefined}
        contentContainerStyle={[styles.readableWidth, padded && styles.padded, { paddingBottom: (tab ? space.s7 : insets.bottom + space.s7) + (floating ? 84 : 0) }, contentContainerStyle]}
        {...rest}
      >
        {children}
        {scrollsWithContent ? <View style={{ paddingTop: space.s2 }}>{footer}</View> : null}
      </ScrollView>
      {footer && !scrollsWithContent ? <View style={[floating ? styles.footer : styles.footerInline, { paddingBottom: typing ? space.s3 : insets.bottom + space.s3 }]}><View style={styles.readableWidth}>{footer}</View></View> : null}
    </View>
  );
  if (!keyboard) return <SpaceProvider space={theme}>{body}</SpaceProvider>;
  return (
    <SpaceProvider space={theme}>
      <KeyboardAvoidingView style={styles.root} behavior="height" keyboardVerticalOffset={headerHeight}>
        {body}
      </KeyboardAvoidingView>
    </SpaceProvider>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // A readable maximum width prevents giant forms and cards on tablets and unfolded phones.
  // It remains 100% on compact devices and in Android split-screen mode.
  readableWidth: { width: "100%", maxWidth: 720, alignSelf: "center" },
  padded: { paddingHorizontal: space.s5, paddingTop: space.s4, gap: space.s5 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.s5, paddingTop: space.s3, backgroundColor: "rgba(9,12,16,0.97)", borderTopWidth: 1, borderTopColor: colors.line },
  footerInline: { paddingHorizontal: space.s5, paddingTop: space.s3, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
});
