import type { ExpoConfig } from "expo/config";

// Play Console identity: the application created for TITAN keeps its package name. The Trusted Web Activity prototype
// used versionCode 300 on the internal track: every native build must stay strictly above it.
const PACKAGE = "fr.titanapp.app";
const MIN_VERSION_CODE = 1000;
const versionCode = Math.max(MIN_VERSION_CODE, Number.parseInt(process.env.TITAN_VERSION_CODE ?? "", 10) || MIN_VERSION_CODE);
const version = process.env.TITAN_VERSION_NAME || "1.0.0";

const BG = "#05070A";

const config: ExpoConfig = {
  name: "TITAN",
  slug: "titan",
  scheme: "titan",
  version,
  orientation: "portrait",
  userInterfaceStyle: "dark",
  backgroundColor: BG,
  icon: "./assets/brand/icon.png",
  platforms: ["android"],
  android: {
    package: PACKAGE,
    versionCode,
    adaptiveIcon: {
      foregroundImage: "./assets/brand/adaptive-foreground.png",
      monochromeImage: "./assets/brand/adaptive-monochrome.png",
      backgroundColor: BG,
    },
    // Session tokens and the pending-session queue must not be restored onto another device by Android backups.
    allowBackup: false,
    softwareKeyboardLayoutMode: "resize",
    permissions: ["android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE", "android.permission.POST_NOTIFICATIONS", "android.permission.VIBRATE", "android.permission.RECEIVE_BOOT_COMPLETED"],
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.SCHEDULE_EXACT_ALARM",
      "android.permission.USE_EXACT_ALARM",
      "android.permission.READ_PHONE_STATE",
      "android.permission.RECORD_AUDIO",
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "com.google.android.gms.permission.AD_ID",
      // Added by libraries but unused by TITAN: Wi-Fi details (netinfo), biometric unlock (secure-store),
      // install referrer (expo-application) and launcher badge counters (notifications).
      "android.permission.ACCESS_WIFI_STATE",
      "android.permission.USE_BIOMETRIC",
      "android.permission.USE_FINGERPRINT",
      "com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE",
      "android.permission.READ_APP_BADGE",
      "com.sec.android.provider.badge.permission.READ",
      "com.sec.android.provider.badge.permission.WRITE",
      "com.htc.launcher.permission.READ_SETTINGS",
      "com.htc.launcher.permission.UPDATE_SHORTCUT",
      "com.sonyericsson.home.permission.BROADCAST_BADGE",
      "com.sonymobile.home.permission.PROVIDER_INSERT_BADGE",
      "com.anddoes.launcher.permission.UPDATE_COUNT",
      "com.majeur.launcher.permission.UPDATE_BADGE",
      "com.huawei.android.launcher.permission.CHANGE_BADGE",
      "com.huawei.android.launcher.permission.READ_SETTINGS",
      "com.huawei.android.launcher.permission.WRITE_SETTINGS",
      "com.oppo.launcher.permission.READ_SETTINGS",
      "com.oppo.launcher.permission.WRITE_SETTINGS",
      "me.everything.badger.permission.BADGE_COUNT_READ",
      "me.everything.badger.permission.BADGE_COUNT_WRITE",
    ],
  },
  plugins: [
    [
      "expo-splash-screen",
      {
        backgroundColor: BG,
        image: "./assets/brand/splash-mark.png",
        imageWidth: 160,
        resizeMode: "contain",
      },
    ],
    [
      "expo-font",
      {
        fonts: [
          "./assets/fonts/TitanDisplay-Heavy.ttf",
          "./assets/fonts/TitanDisplay-Bold.ttf",
          "./assets/fonts/Manrope-Regular.ttf",
          "./assets/fonts/Manrope-SemiBold.ttf",
          "./assets/fonts/Manrope-Bold.ttf",
          "./assets/fonts/Manrope-ExtraBold.ttf",
        ],
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/brand/notification.png",
        color: "#3DD9E8",
        defaultChannel: "reminders",
      },
    ],
    "expo-secure-store",
    "expo-localization",
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 24,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
    "./plugins/with-release-signing",
  ],
  extra: {
    supabaseUrl: "https://oubmftfufwwzwpgvrcag.supabase.co",
    siteUrl: "https://titan-app.fr",
  },
};

export default config;
