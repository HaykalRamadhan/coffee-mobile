import { supabase } from "./supabase";

export type OperationsNotificationPreferences = {
  orderUpdatesEnabled: boolean;
  newsEnabled: boolean;
  generalEnabled: boolean;
};

export type OperationsBranchSummary = {
  id: string;
  code: string;
  name: string;
  address: string;
  active: boolean;
};

type NotificationPreferenceRow = {
  order_updates_enabled: boolean;
  news_enabled: boolean;
  general_enabled: boolean;
};

const defaultPreferences: OperationsNotificationPreferences = {
  orderUpdatesEnabled: true,
  newsEnabled: true,
  generalEnabled: true,
};

export async function loadOperationsSettings(branchId: string | null) {
  if (!supabase) {
    return {
      branch: null,
      preferences: defaultPreferences,
      registeredDeviceCount: 0,
      error: "Supabase is not configured.",
    };
  }

  const [branchResult, devicesResult] = await Promise.all([
    branchId
      ? supabase
        .from("branches")
        .select("id, code, name, address, active")
        .eq("id", branchId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("push_notification_devices")
      .select("order_updates_enabled, news_enabled, general_enabled")
      .eq("enabled", true),
  ]);

  const rows = (devicesResult.data ?? []) as NotificationPreferenceRow[];
  const preferences = rows.length === 0
    ? defaultPreferences
    : {
      orderUpdatesEnabled: rows.every((row) => row.order_updates_enabled),
      newsEnabled: rows.every((row) => row.news_enabled),
      generalEnabled: rows.every((row) => row.general_enabled),
    };

  return {
    branch: branchResult.data as OperationsBranchSummary | null,
    preferences,
    registeredDeviceCount: rows.length,
    error: branchResult.error?.message ?? devicesResult.error?.message ?? null,
  };
}

export async function updateOperationsNotificationPreferences(
  preferences: OperationsNotificationPreferences,
) {
  if (!supabase) return { error: "Supabase is not configured." };

  const { error } = await supabase
    .from("push_notification_devices")
    .update({
      order_updates_enabled: preferences.orderUpdatesEnabled,
      news_enabled: preferences.newsEnabled,
      general_enabled: preferences.generalEnabled,
    })
    .eq("enabled", true);

  return { error: error?.message ?? null };
}

export async function signOutOtherOperationsSessions() {
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.auth.signOut({ scope: "others" });
  return { error: error?.message ?? null };
}
