import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";
import { supabase } from "./supabase";

type NotificationsModule = typeof import("expo-notifications");
type NotificationResponse = import("expo-notifications").NotificationResponse;

declare const require: (moduleName: "expo-notifications") => NotificationsModule;

export type PushRegistrationResult = {
  status: "registered" | "denied" | "unsupported" | "error";
  message: string | null;
};

export type KopiPowNotificationData = {
  category?: "order" | "news" | "general";
  screen?: "order-history" | "operations-orders" | "home";
  orderId?: string;
  [key: string]: unknown;
};

let activeExpoPushToken: string | null = null;
let notificationsModule: NotificationsModule | null = null;

const isExpoGo = () => isRunningInExpoGo();

const getNotifications = (): NotificationsModule | null => {
  if (Platform.OS === "web" || isExpoGo()) return null;
  if (notificationsModule) return notificationsModule;

  // Loading expo-notifications in Expo Go on Android throws during module
  // initialization, before a function-level guard can run. Keep the native
  // module lazy so Expo Go remains usable while development builds retain push.
  notificationsModule = require("expo-notifications");
  notificationsModule.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  return notificationsModule;
};

const getProjectId = () => (
  Constants.easConfig?.projectId
  ?? Constants.expoConfig?.extra?.eas?.projectId
  ?? null
);

const configureAndroidChannels = async () => {
  if (Platform.OS !== "android") return;
  const Notifications = getNotifications();
  if (!Notifications) return;

  await Promise.all([
    Notifications.setNotificationChannelAsync("orders", {
      name: "Order updates",
      description: "Live order and payment status updates.",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 180, 250],
      lightColor: "#E2B52F",
    }),
    Notifications.setNotificationChannelAsync("news", {
      name: "KopiPow news",
      description: "New drinks, promotions, and KopiPow announcements.",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      lightColor: "#E2B52F",
    }),
    Notifications.setNotificationChannelAsync("general", {
      name: "General",
      description: "Important account and service messages.",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      lightColor: "#E2B52F",
    }),
  ]);
};

const getNotificationPermission = async () => {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return current;
  if (!current.canAskAgain) return current;
  return Notifications.requestPermissionsAsync();
};

export async function registerPushNotifications(): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return { status: "unsupported", message: "Push notifications are currently available in the mobile app." };
  }
  if (isExpoGo()) {
    return {
      status: "unsupported",
      message: "Remote notifications require an installed development or preview build.",
    };
  }
  if (!supabase) return { status: "error", message: "Supabase is not configured." };
  const Notifications = getNotifications();
  if (!Notifications) {
    return { status: "unsupported", message: "Push notifications are unavailable in this runtime." };
  }

  try {
    await configureAndroidChannels();
    const permission = await getNotificationPermission();
    if (!permission?.granted) {
      return { status: "denied", message: "Notification permission was not granted." };
    }

    const projectId = getProjectId();
    if (!projectId) {
      return { status: "error", message: "The EAS project ID is missing from app.json." };
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    activeExpoPushToken = token.data;
    const { error } = await supabase.rpc("register_my_push_device", {
      p_expo_push_token: token.data,
      p_platform: Platform.OS,
      p_app_version: Constants.expoConfig?.version ?? null,
    });
    if (error) throw error;

    return { status: "registered", message: null };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not register this device for notifications.",
    };
  }
}

export async function unregisterCurrentPushDevice() {
  if (!supabase || !activeExpoPushToken) return;
  const token = activeExpoPushToken;
  activeExpoPushToken = null;
  await supabase.rpc("unregister_my_push_device", { p_expo_push_token: token });
}

export function listenForPushTokenChanges(onChanged: () => void) {
  if (Platform.OS === "web" || isExpoGo()) return () => undefined;
  const Notifications = getNotifications();
  if (!Notifications) return () => undefined;
  const subscription = Notifications.addPushTokenListener(() => onChanged());
  return () => subscription.remove();
}

export function listenForNotificationResponses(
  onOpen: (data: KopiPowNotificationData) => void,
) {
  if (Platform.OS === "web" || isExpoGo()) return () => undefined;
  const Notifications = getNotifications();
  if (!Notifications) return () => undefined;

  const openResponse = (response: NotificationResponse | null) => {
    if (!response) return;
    onOpen(response.notification.request.content.data as KopiPowNotificationData);
    void Notifications.clearLastNotificationResponseAsync();
  };

  const subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
  void Notifications.getLastNotificationResponseAsync().then(openResponse).catch(() => undefined);
  return () => subscription.remove();
}

export async function previewLocalNotification() {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  await configureAndroidChannels();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "KopiPow notifications are ready ⚡",
      body: "Order updates, news, and important alerts can appear here.",
      data: { category: "general", screen: "home" },
      sound: "default",
    },
    trigger: Platform.OS === "android" ? { channelId: "general" } : null,
  });
}
