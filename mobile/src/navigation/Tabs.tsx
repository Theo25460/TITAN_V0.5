import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

/** The bar has a fixed height and five slots: its labels follow the system font size up to 1.3x (like Material navigation bars),
    beyond that the icons and the accessibility labels carry the meaning. Everything else in the app scales further. */
export const TAB_LABEL_SCALE_CAP = 1.3;
export function TabLabel({ children, color }: { children: string; color: string }) {
  return (
    <Text maxFontSizeMultiplier={TAB_LABEL_SCALE_CAP} numberOfLines={1} style={[styles.label, { color }]}>
      {children}
    </Text>
  );
}

export function Tabs() {
  const insets = useSafeAreaInsets();
  const queue = useQueue();
  const pending = queue.items.length;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.cy,
        tabBarInactiveTintColor: colors.tx3,
        tabBarHideOnKeyboard: true,
        animation: "shift",
        tabBarStyle: { backgroundColor: colors.bg1, borderTopColor: colors.line, height: 64 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 6 },
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
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ title: "Progrès", tabBarButtonTestID: "tab-progress", tabBarBadge: pending ? pending : undefined, tabBarBadgeStyle: { backgroundColor: colors.warn, color: "#1D1302", fontFamily: fonts.textBold } }} />
      <Tab.Screen name="Record" component={RecordScreen} options={{ title: "Séance", tabBarAccessibilityLabel: "Enregistrer une séance", tabBarButtonTestID: "tab-record" }} />
      <Tab.Screen name="Adventure" component={AdventureScreen} options={{ title: "Aventure", tabBarButtonTestID: "tab-adventure" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profil", tabBarButtonTestID: "tab-profile" }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.textBold, fontSize: 11, textAlign: "center", marginTop: 2 },
  record: { width: 46, height: 34, borderRadius: 12, backgroundColor: colors.cy, alignItems: "center", justifyContent: "center", marginTop: -2 },
  recordOn: { backgroundColor: colors.cy2 },
});
