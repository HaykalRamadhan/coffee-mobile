import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const enabledValues = new Set(["1", "true", "yes", "on"]);
const maintenanceCacheKey = "kopipow:maintenance-config:v1";
const maintenanceConfigId = "global";
const maintenanceRequestTimeoutMs = 6000;

export type MaintenanceConfig = {
  enabled: boolean;
  message: string;
};

type MaintenanceConfigRow = {
  maintenance_enabled: boolean;
  maintenance_message: string | null;
};

export const getMaintenanceFallbackConfig = (): MaintenanceConfig => {
  const modeValue = process.env.EXPO_PUBLIC_MAINTENANCE_MODE
    ?.trim()
    .toLocaleLowerCase();

  return {
    enabled: modeValue ? enabledValues.has(modeValue) : false,
    message: process.env.EXPO_PUBLIC_MAINTENANCE_MESSAGE?.trim()
      || "We are tuning the machines and charging up something better. Please check back shortly.",
  };
};

const readCachedMaintenanceConfig = async () => {
  try {
    const value = await AsyncStorage.getItem(maintenanceCacheKey);
    if (!value) return null;

    const parsed = JSON.parse(value) as Partial<MaintenanceConfig>;
    if (typeof parsed.enabled !== "boolean" || typeof parsed.message !== "string") {
      return null;
    }

    return parsed as MaintenanceConfig;
  } catch {
    return null;
  }
};

const cacheMaintenanceConfig = async (config: MaintenanceConfig) => {
  try {
    await AsyncStorage.setItem(maintenanceCacheKey, JSON.stringify(config));
  } catch {
    // A cache failure must never prevent the app from starting.
  }
};

const mapMaintenanceConfig = (row: MaintenanceConfigRow): MaintenanceConfig => ({
  enabled: row.maintenance_enabled,
  message: row.maintenance_message?.trim()
    || getMaintenanceFallbackConfig().message,
});

const fetchRemoteMaintenanceConfig = async (): Promise<MaintenanceConfig> => {
  if (!supabase) throw new Error("Supabase is not configured.");

  const request = supabase
    .from("app_config")
    .select("maintenance_enabled, maintenance_message")
    .eq("id", maintenanceConfigId)
    .single();

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Maintenance configuration request timed out.")), maintenanceRequestTimeoutMs);
  });

  const { data, error } = await Promise.race([request, timeout]);
  if (error) throw error;

  return mapMaintenanceConfig(data as MaintenanceConfigRow);
};

export const loadMaintenanceConfig = async (): Promise<MaintenanceConfig> => {
  try {
    const remoteConfig = await fetchRemoteMaintenanceConfig();
    await cacheMaintenanceConfig(remoteConfig);
    return remoteConfig;
  } catch {
    return await readCachedMaintenanceConfig() ?? getMaintenanceFallbackConfig();
  }
};

export const subscribeToMaintenanceConfig = (
  onConfig: (config: MaintenanceConfig) => void,
) => {
  const client = supabase;
  if (!client) return () => undefined;

  const channel = client
    .channel("kopipow-public-app-config")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "app_config",
        filter: `id=eq.${maintenanceConfigId}`,
      },
      (payload) => {
        const row = payload.new as MaintenanceConfigRow;
        if (typeof row.maintenance_enabled !== "boolean") return;
        const config = mapMaintenanceConfig(row);
        void cacheMaintenanceConfig(config);
        onConfig(config);
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
};
