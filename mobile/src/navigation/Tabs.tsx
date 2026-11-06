import { BottomTabBar, createBottomTabNavigator, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useEffect, useState } from "react";
import { Keyboard, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tap } from "../components/Pressable";
import { Icon, type IconName } from "../components/Icon";
import { useQueue } from "../data/queue";
import { haptic } from "../lib/haptics";
import { AdventureScreen } from "../screens/adventure/AdventureScreen";
import { HomeScreen } from "../screens/home/HomeScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { ProgressScreen } from "../screens/progress/ProgressScreen";
import { RecordScreen } from "../screens/session/RecordScreen";
import { colors, fonts } from "../theme/tokens";
import type { TabParams } from "./types";

const Tab = createBottomTabNavigator<TabParams>();

const ICONS: Record<keyof TabParams, IconName> = { QG: "home", Progress: "chart", Record: "plus", Adventure: "compass", Profile: "user" };

/** Reflow visible destinations at large text instead of shrinking the labels. */
export function tabLayout(width: number, fontScale: number, bottomInset: number) {
  const scale = Math.max(1, Math.min(2, fontScale));
  const columns = scale > 1.2 ? Math.max(2, Math.min(5, Math.floor(width / (72 + 44 * scale)))) : 5;
  const itemHeight = columns < 5 ? Math.max(48, Math.ceil(14 * scale + 24)) : 64;
  return { columns, itemHeight, height: Math.ceil(5 / columns) * itemHeight + bottomInset + 12 };
}
export function TabLabel({ children, color }: { children: string; color: string }) {
  return <Text maxFontSizeMultiplier={2} style={[styles.label, { color }]}>{children}</Text>;
}
export function AccessibleTabBar({ state, descriptors, navigation, insets, width, fontScale }: BottomTabBarProps & { width: number; fontScale: number }) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const layout = tabLayout(width - insets.left - insets.right, fontScale, insets.bottom);
  if (keyboardVisible) return null;
  return <View accessibilityRole="tablist" accessibilityLabel="Navigation principale" testID="accessible-tab-bar" style={[styles.adaptiveBar, { paddingBottom: insets.bottom + 6, paddingLeft: insets.left, paddingRight: insets.right }]}>
    {state.routes.map((route, index) => {
      const { options } = descriptors[route.key]!;
      const focused = state.index === index;
      const color = focused ? colors.cy : colors.tx3;
      const label = typeof options.tabBarLabel === "string" ? options.tabBarLabel : options.title ?? route.name;
      const badge = options.tabBarBadge;
      const accessibilityLabel = `${options.tabBarAccessibilityLabel ?? label}${badge != null ? `, ${badge} séance${badge === 1 ? "" : "s"} en attente` : ""}`;
      return <Tap key={route.key} haptics={false} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={accessibilityLabel} testID={options.tabBarButtonTestID} style={[styles.adaptiveTab, { width: `${100 / layout.columns}%`, minHeight: layout.itemHeight }]} onPress={() => {
        const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      }} onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}>
        {options.tabBarIcon?.({ color, focused, size: 24 })}
        <View style={{ flex: 1 }}><TabLabel color={color}>{label}</TabLabel>{badge != null ? <Text maxFontSizeMultiplier={2} style={styles.pendingBadge}>{badge}</Text> : null}</View>
      </Tap>;
    })}
  </View>;
}

export function Tabs() {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const layout = tabLayout(width - insets.left - insets.right, fontScale, insets.bottom);
  const queue = useQueue();
  const pending = queue.items.length;
  return (
    <Tab.Navigator
      tabBar={props => layout.columns < 5 ? <AccessibleTabBar {...props} width={width} fontScale={fontScale} /> : <BottomTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.cy,
        tabBarInactiveTintColor: colors.tx3,
        tabBarHideOnKeyboard: true,
        // From 600 dp the library puts the label beside the icon, and the raised "+" then covers "Séance" (unfolded phone, tablet, split window).
        tabBarLabelPosition: "below-icon",
        animation: "shift",
        tabBarStyle: { backgroundColor: colors.bg1, borderTopColor: colors.line, height: layout.height, paddingTop: 6, paddingBottom: insets.bottom + 8 },
        tabBarLabel: ({ children, color }) => <TabLabel color={color}>{children}</TabLabel>,
        tabBarIcon: ({ color, focused }) =>
          route.name === "Record" ? (
            <View style={[styles.record, focused && styles.recordOn]}>
              <Icon name="plus" size={26} color={colors.cyInk} strokeWidth={2.4} />
            </View>
          ) : (
            <Icon name={ICONS[route.name]} size={24} color={color} strokeWidth={focused ? 2.1 : 1.65} />
          ),
      })}
      screenListeners={{ tabPress: () => haptic("selection") }}
    >
      <Tab.Screen name="QG" component={HomeScreen} options={{ title: "QG", tabBarAccessibilityLabel: "QG, accueil", tabBarButtonTestID: "tab-qg" }} />
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ title: "Progrès", tabBarAccessibilityLabel: "Progrès et statistiques", tabBarButtonTestID: "tab-progress", tabBarBadge: pending ? pending : undefined, tabBarBadgeStyle: { backgroundColor: colors.warn, color: "#1D1302", fontFamily: fonts.textBold } }} />
      <Tab.Screen name="Record" component={RecordScreen} options={{ title: "Séance", tabBarAccessibilityLabel: "Enregistrer une séance", tabBarButtonTestID: "tab-record" }} />
      <Tab.Screen name="Adventure" component={AdventureScreen} options={{ title: "Aventure", tabBarAccessibilityLabel: "Aventure et mondes", tabBarButtonTestID: "tab-adventure" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profil", tabBarAccessibilityLabel: "Profil et compte", tabBarButtonTestID: "tab-profile" }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  adaptiveBar: { flexDirection: "row", flexWrap: "wrap", paddingTop: 6, backgroundColor: colors.bg1, borderTopWidth: 1, borderTopColor: colors.line },
  adaptiveTab: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  pendingBadge: { alignSelf: "center", fontFamily: fonts.textBold, fontSize: 11, color: colors.warn },
  label: { fontFamily: fonts.textBold, fontSize: 11, textAlign: "center" },
  record: { width: 46, height: 34, borderRadius: 12, backgroundColor: colors.cy, alignItems: "center", justifyContent: "center", marginTop: -2 },
  recordOn: { backgroundColor: colors.cy2 },
});
