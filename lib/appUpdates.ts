import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Updates from "expo-updates";
import { Linking, Platform } from "react-native";

const RELEASES_TABLE = "app_releases";
const UPDATE_DEFER_KEY = "kopipow:update-deferred";
const UPDATE_DEFER_DURATION_MS = 6 * 60 * 60 * 1000;

export type NativeAppRelease = {
  apkUrl: string;
  isMandatory: boolean;
  releaseNotes: string;
  versionCode: number;
  versionName: string;
};

export type AvailableAppUpdate =
  | {
    key: string;
    kind: "expo";
    releaseNotes: string;
    versionName: string;
  }
  | ({ key: string; kind: "native" } & NativeAppRelease);

type ReleaseRow = {
  apk_url: string;
  is_mandatory: boolean;
  release_notes: string | null;
  version_code: number;
  version_name: string;
};

type DeferredUpdate = {
  key: string;
  until: number;
};

export const currentAppVersion = Application.nativeApplicationVersion ?? "development";
export const currentBuildVersion = Number.parseInt(Application.nativeBuildVersion ?? "0", 10) || 0;

const getPublicSupabaseConfig = () => ({
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "",
  url: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "",
});

const isDeferred = async (key: string) => {
  try {
    const value = await AsyncStorage.getItem(UPDATE_DEFER_KEY);
    if (!value) return false;
    const deferred = JSON.parse(value) as DeferredUpdate;
    return deferred.key === key && deferred.until > Date.now();
  } catch {
    return false;
  }
};

export const deferAppUpdate = async (key: string) => {
  const deferred: DeferredUpdate = {
    key,
    until: Date.now() + UPDATE_DEFER_DURATION_MS,
  };
  await AsyncStorage.setItem(UPDATE_DEFER_KEY, JSON.stringify(deferred));
};

const checkForNativeUpdate = async (): Promise<AvailableAppUpdate | null> => {
  if (Platform.OS !== "android") return null;

  const { publishableKey, url } = getPublicSupabaseConfig();
  if (!publishableKey || !url) return null;

  const query = new URLSearchParams({
    select: "version_name,version_code,apk_url,release_notes,is_mandatory",
    platform: "eq.android",
    is_active: "eq.true",
    order: "version_code.desc",
    limit: "1",
  });
  const response = await fetch(`${url}/rest/v1/${RELEASES_TABLE}?${query.toString()}`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
  });

  if (!response.ok) return null;
  const rows = await response.json() as ReleaseRow[];
  const release = rows[0];
  if (!release || release.version_code <= currentBuildVersion || !release.apk_url.startsWith("https://")) {
    return null;
  }

  const key = `native:${release.version_code}`;
  if (!release.is_mandatory && await isDeferred(key)) return null;

  return {
    apkUrl: release.apk_url,
    isMandatory: release.is_mandatory,
    key,
    kind: "native",
    releaseNotes: release.release_notes?.trim() || "A new KopiPow version is ready with improvements and fixes.",
    versionCode: release.version_code,
    versionName: release.version_name,
  };
};

const checkForExpoUpdate = async (): Promise<AvailableAppUpdate | null> => {
  if (!Updates.isEnabled || __DEV__) return null;

  const result = await Updates.checkForUpdateAsync();
  if (!result.isAvailable) return null;

  const manifest = result.manifest as { createdAt?: string; id?: string };
  const updateIdentity = manifest.id ?? manifest.createdAt ?? "available";
  const key = `expo:${updateIdentity}`;
  if (await isDeferred(key)) return null;

  return {
    key,
    kind: "expo",
    releaseNotes: "A quick KopiPow update is ready. It will download securely and restart the app.",
    versionName: currentAppVersion,
  };
};

export const checkForAppUpdate = async (): Promise<AvailableAppUpdate | null> => {
  try {
    const nativeUpdate = await checkForNativeUpdate();
    if (nativeUpdate) return nativeUpdate;
  } catch {
    // A release-manifest failure must not prevent Expo's fallback update check.
  }

  try {
    return await checkForExpoUpdate();
  } catch {
    return null;
  }
};

export const installExpoUpdate = async () => {
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
};

export const downloadAndInstallApk = async (
  release: NativeAppRelease,
  onProgress: (progress: number) => void,
) => {
  if (Platform.OS !== "android") {
    await Linking.openURL(release.apkUrl);
    return;
  }
  if (!FileSystem.cacheDirectory) throw new Error("The update download folder is unavailable.");

  const destination = `${FileSystem.cacheDirectory}kopipow-${release.versionCode}.apk`;
  const download = FileSystem.createDownloadResumable(
    release.apkUrl,
    destination,
    {},
    ({ totalBytesExpectedToWrite, totalBytesWritten }) => {
      if (totalBytesExpectedToWrite > 0) {
        onProgress(Math.min(totalBytesWritten / totalBytesExpectedToWrite, 1));
      }
    },
  );
  const result = await download.downloadAsync();
  if (!result?.uri) throw new Error("The APK download did not finish.");

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    flags: 1,
    type: "application/vnd.android.package-archive",
  });
};
