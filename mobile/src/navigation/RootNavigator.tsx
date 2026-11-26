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
import { SentiersScreen } from "../screens/adventure/SentiersScreen";
import { CommunityScreen } from "../screens/community/CommunityScreen";
import { EventsScreen } from "../screens/community/EventsScreen";
import { RetroScreen } from "../screens/progress/RetroScreen";
import { SaveAccountScreen } from "../screens/settings/SaveAccountScreen";
import { CapsuleScreen } from "../screens/profile/CapsuleScreen";
import { HistoryImportScreen } from "../screens/settings/HistoryImportScreen";
import { ReminderSync } from "../data/ReminderSync";
import { GoalsScreen } from "../screens/progress/GoalsScreen";
import { JournalScreen } from "../screens/progress/JournalScreen";
import { PlanScreen } from "../screens/progress/PlanScreen";
import { RecordsScreen } from "../screens/progress/RecordsScreen";
import { AtelierScreen } from "../screens/profile/AtelierScreen";
import { PublicCardScreen } from "../screens/profile/PublicCardScreen";
import { PendingScreen } from "../screens/session/PendingScreen";
import { SessionDetailScreen } from "../screens/session/SessionDetailScreen";
import { SessionEditScreen } from "../screens/session/SessionEditScreen";
import { RouteDetailScreen, RoutesScreen } from "../screens/session/RoutesScreen";
import { WebHubScreen } from "../screens/settings/WebHubScreen";
import { SourcesScreen } from "../screens/settings/SourcesScreen";
import { CareerScreen } from "../screens/progress/CareerScreen";
import { StepsScreen } from "../screens/steps/StepsScreen";
import { GpsRecordScreen } from "../screens/session/GpsRecordScreen";
import { SessionFormScreen } from "../screens/session/SessionFormScreen";
import { SessionResultScreen } from "../screens/session/SessionResultScreen";
import { ShareStoryScreen } from "../screens/share/ShareStoryScreen";
import { AboutScreen } from "../screens/settings/AboutScreen";
import { AccountScreen } from "../screens/settings/AccountScreen";
import { DeleteAccountScreen } from "../screens/settings/DeleteAccountScreen";
import { FeedbackScreen } from "../screens/settings/FeedbackScreen";
import { GuideScreen } from "../screens/settings/GuideScreen";
import { HealthConnectScreen } from "../screens/settings/HealthConnectScreen";
import { GarminScreen } from "../screens/settings/GarminScreen";
import { HelpScreen } from "../screens/settings/HelpScreen";
import { LegalScreen } from "../screens/settings/LegalScreen";
import { NotificationsScreen } from "../screens/settings/NotificationsScreen";
import { PrivacyScreen } from "../screens/settings/PrivacyScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { SportsScreen } from "../screens/settings/SportsScreen";
import { TitanPlusScreen } from "../screens/settings/TitanPlusScreen";
import { Tabs } from "./Tabs";
import { LiveSessionScreen } from "../screens/live/LiveSessionScreen";
import { CampScreen } from "../screens/live/CampScreen";
import { useReducedMotion } from "../lib/motion";
import { TourScreen } from "../screens/auth/TourScreen";
import { useFirstVisit } from "../lib/firstVisit";
import type { RootParams } from "./types";

const Stack = createNativeStackNavigator<RootParams>();

export const stackOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.tx,
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 19 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
  animation: "default",
  headerBackButtonDisplayMode: "minimal",
};

export function RootNavigator() {
  const { status, owner } = useAuth();
  const reduced = useReducedMotion();
  const options: NativeStackNavigationOptions = reduced ? { ...stackOptions, animation: "none" } : stackOptions;
  // First opening on this phone: the guided visit comes before the welcome screen. The splash stays until both answers are known.
  // A signed-in phone does not wait for that answer: the visit only matters on the signed-out side.
  const signedIn = status === "signedIn" && !!owner;
  const visit = useFirstVisit(signedIn);
  const ready = status !== "loading" && (signedIn || visit !== undefined);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  if (status === "signedOut" || !owner)
    return (
      <Stack.Navigator screenOptions={options} initialRouteName={visit?.seen ? "Welcome" : "Tour"}>
        <Stack.Screen name="Tour" component={TourScreen} options={{ headerShown: false, animation: reduced ? "none" : "fade" }} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Connexion" }} />
        <Stack.Screen name="Signup" component={SignupScreen} options={{ title: "Créer un compte" }} />
        <Stack.Screen name="Forgot" component={ForgotScreen} options={{ title: "Mot de passe oublié" }} />
      </Stack.Navigator>
    );
  return <SignedIn key={owner} options={options} reduced={reduced} />;
}

function SignedIn({ options, reduced }: { options: NativeStackNavigationOptions; reduced: boolean }) {
  const profile = useProfile();
  // A profile without onboarding goes through the short first-run flow; offline without cache, the app opens directly.
  const needsOnboarding = profile.data ? !prefsOf(profile.data).onboardedAt : false;
  return (
    <>
    <ReminderSync />
    <Stack.Navigator screenOptions={options}>
      {needsOnboarding ? <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} /> : null}
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Routes" component={RoutesScreen} options={{ title: "Mes parcours" }} />
      <Stack.Screen name="Route" component={RouteDetailScreen} options={{ title: "Parcours" }} />
      <Stack.Screen name="GpsRecord" component={GpsRecordScreen} options={{ title: "Enregistrement GPS" }} />
      <Stack.Screen name="LiveSession" component={LiveSessionScreen} options={{ title: "Séance live" }} />
      <Stack.Screen name="Camp" component={CampScreen} options={{ title: "Camp de base" }} />
      <Stack.Screen name="SessionForm" component={SessionFormScreen} options={{ title: "Séance" }} />
      <Stack.Screen name="SessionResult" component={SessionResultScreen} options={{ headerShown: false, animation: reduced ? "none" : "fade_from_bottom", gestureEnabled: false }} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ title: "Séance" }} />
      <Stack.Screen name="ShareStory" component={ShareStoryScreen} options={{ title: "Partager", presentation: "modal" }} />
      <Stack.Screen name="SessionEdit" component={SessionEditScreen} options={{ title: "Corriger la séance", presentation: "modal" }} />
      <Stack.Screen name="Pending" component={PendingScreen} options={{ title: "Envois en attente" }} />
      <Stack.Screen name="Journal" component={JournalScreen} options={{ title: "Journal" }} />
      <Stack.Screen name="Records" component={RecordsScreen} options={{ title: "Records" }} />
      <Stack.Screen name="Career" component={CareerScreen} options={{ title: "Ma carrière" }} />
      <Stack.Screen name="Goals" component={GoalsScreen} options={{ title: "Objectifs" }} />
      <Stack.Screen name="Plan" component={PlanScreen} options={{ title: "Ma semaine type" }} />
      <Stack.Screen name="World" component={WorldScreen} options={{ title: "Aventure" }} />
      <Stack.Screen name="Sentiers" component={SentiersScreen} options={{ title: "Les Sentiers du Titan" }} />
      <Stack.Screen name="Atelier" component={AtelierScreen} options={{ title: "Atelier" }} />
      <Stack.Screen name="Community" component={CommunityScreen} options={{ title: "Communauté" }} />
      <Stack.Screen name="Events" component={EventsScreen} options={{ title: "Quêtes et événements" }} />
      <Stack.Screen name="Retro" component={RetroScreen} options={{ title: "TITAN Rétro" }} />
      <Stack.Screen name="SaveAccount" component={SaveAccountScreen} options={{ title: "Sauvegarder mon compte" }} />
      <Stack.Screen name="Capsules" component={CapsuleScreen} options={{ title: "Lettres à moi-même" }} />
      <Stack.Screen name="HistoryImport" component={HistoryImportScreen} options={{ title: "Importer mon historique" }} />
      <Stack.Screen name="PublicCard" component={PublicCardScreen} options={{ title: "Carte publique" }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Réglages" }} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ title: "Compte" }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: "Confidentialité" }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Rappels" }} />
      <Stack.Screen name="Sports" component={SportsScreen} options={{ title: "Mes sports" }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ title: "Assistance" }} />
      <Stack.Screen name="WebHub" component={WebHubScreen} options={{ title: "TITAN sur le site" }} />
      <Stack.Screen name="Sources" component={SourcesScreen} options={{ title: "Sources et capteurs" }} />
      <Stack.Screen name="Steps" component={StepsScreen} options={{ title: "Mes pas" }} />
      <Stack.Screen name="HealthConnect" component={HealthConnectScreen} options={{ title: "Santé Connect" }} />
      <Stack.Screen name="Garmin" component={GarminScreen} options={{ title: "Garmin" }} />
      <Stack.Screen name="Guide" component={GuideScreen} options={{ title: "Bien démarrer" }} />
      <Stack.Screen name="Tour" component={TourScreen} options={{ headerShown: false, animation: reduced ? "none" : "fade" }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: "Un retour" }} />
      <Stack.Screen name="Legal" component={LegalScreen} options={{ title: "Informations légales" }} />
      <Stack.Screen name="About" component={AboutScreen} options={{ title: "À propos" }} />
      <Stack.Screen name="TitanPlus" component={TitanPlusScreen} options={{ title: "TITAN+" }} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ title: "Supprimer mon compte" }} />
    </Stack.Navigator>
    </>
  );
}
