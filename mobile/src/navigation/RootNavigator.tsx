import { createNativeStackNavigator, type NativeStackNavigationOptions } from "@react-navigation/native-stack";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useAuth } from "../data/auth";
import { prefsOf, useProfile } from "../data/hooks";
import { colors, fonts } from "../theme/tokens";
import { ForgotScreen } from "../screens/auth/ForgotScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { OnboardingScreen } from "../screens/auth/OnboardingScreen";
import { SignupScreen } from "../screens/auth/SignupScreen";
import { WelcomeScreen } from "../screens/auth/WelcomeScreen";
import { WorldScreen } from "../screens/adventure/WorldScreen";
import { CommunityScreen } from "../screens/community/CommunityScreen";
import { GoalsScreen } from "../screens/progress/GoalsScreen";
import { JournalScreen } from "../screens/progress/JournalScreen";
import { PlanScreen } from "../screens/progress/PlanScreen";
import { RecordsScreen } from "../screens/progress/RecordsScreen";
import { AtelierScreen } from "../screens/profile/AtelierScreen";
import { PublicCardScreen } from "../screens/profile/PublicCardScreen";
import { PendingScreen } from "../screens/session/PendingScreen";
import { SessionDetailScreen } from "../screens/session/SessionDetailScreen";
import { SessionEditScreen } from "../screens/session/SessionEditScreen";
import { SessionFormScreen } from "../screens/session/SessionFormScreen";
import { SessionResultScreen } from "../screens/session/SessionResultScreen";
import { AboutScreen } from "../screens/settings/AboutScreen";
import { AccountScreen } from "../screens/settings/AccountScreen";
import { DeleteAccountScreen } from "../screens/settings/DeleteAccountScreen";
import { HelpScreen } from "../screens/settings/HelpScreen";
import { LegalScreen } from "../screens/settings/LegalScreen";
import { NotificationsScreen } from "../screens/settings/NotificationsScreen";
import { PrivacyScreen } from "../screens/settings/PrivacyScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { SportsScreen } from "../screens/settings/SportsScreen";
import { TitanPlusScreen } from "../screens/settings/TitanPlusScreen";
import { Tabs } from "./Tabs";
import type { RootParams } from "./types";

const Stack = createNativeStackNavigator<RootParams>();

export const stackOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.tx,
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 19 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
  animation: "ios_from_right",
  headerBackButtonDisplayMode: "minimal",
};

export function RootNavigator() {
  const { status, owner } = useAuth();
  useEffect(() => {
    if (status !== "loading") SplashScreen.hideAsync().catch(() => {});
  }, [status]);
  if (status === "loading") return null;
  if (status === "signedOut" || !owner)
    return (
      <Stack.Navigator screenOptions={stackOptions}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Connexion" }} />
        <Stack.Screen name="Signup" component={SignupScreen} options={{ title: "Créer un compte" }} />
        <Stack.Screen name="Forgot" component={ForgotScreen} options={{ title: "Mot de passe oublié" }} />
      </Stack.Navigator>
    );
  return <SignedIn key={owner} />;
}

function SignedIn() {
  const profile = useProfile();
  // A profile without onboarding goes through the short first-run flow; offline without cache, the app opens directly.
  const needsOnboarding = profile.data ? !prefsOf(profile.data).onboardedAt : false;
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      {needsOnboarding ? <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} /> : null}
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="SessionForm" component={SessionFormScreen} options={{ title: "Séance" }} />
      <Stack.Screen name="SessionResult" component={SessionResultScreen} options={{ headerShown: false, animation: "fade_from_bottom", gestureEnabled: false }} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ title: "Séance" }} />
      <Stack.Screen name="SessionEdit" component={SessionEditScreen} options={{ title: "Corriger la séance", presentation: "modal" }} />
      <Stack.Screen name="Pending" component={PendingScreen} options={{ title: "Envois en attente" }} />
      <Stack.Screen name="Journal" component={JournalScreen} options={{ title: "Journal" }} />
      <Stack.Screen name="Records" component={RecordsScreen} options={{ title: "Records" }} />
      <Stack.Screen name="Goals" component={GoalsScreen} options={{ title: "Objectifs" }} />
      <Stack.Screen name="Plan" component={PlanScreen} options={{ title: "Ma semaine type" }} />
      <Stack.Screen name="World" component={WorldScreen} options={{ title: "Aventure" }} />
      <Stack.Screen name="Atelier" component={AtelierScreen} options={{ title: "Atelier" }} />
      <Stack.Screen name="Community" component={CommunityScreen} options={{ title: "Communauté" }} />
      <Stack.Screen name="PublicCard" component={PublicCardScreen} options={{ title: "Carte publique" }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Réglages" }} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ title: "Compte" }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: "Confidentialité" }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Rappels" }} />
      <Stack.Screen name="Sports" component={SportsScreen} options={{ title: "Mes sports" }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ title: "Assistance" }} />
      <Stack.Screen name="Legal" component={LegalScreen} options={{ title: "Informations légales" }} />
      <Stack.Screen name="About" component={AboutScreen} options={{ title: "À propos" }} />
      <Stack.Screen name="TitanPlus" component={TitanPlusScreen} options={{ title: "TITAN+" }} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ title: "Supprimer mon compte" }} />
    </Stack.Navigator>
  );
}
