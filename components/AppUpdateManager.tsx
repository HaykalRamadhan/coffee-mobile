import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type AppStateStatus,
} from "react-native";
import {
  checkForAppUpdate,
  currentAppVersion,
  deferAppUpdate,
  downloadAndInstallApk,
  installExpoUpdate,
  type AvailableAppUpdate,
} from "../lib/appUpdates";
import { useResponsiveLayout } from "../lib/responsive";
import { DISPLAY_FONT_FAMILY, Text } from "../lib/typography";

const CHECK_THROTTLE_MS = 15 * 60 * 1000;

type AppUpdateManagerProps = {
  blocked: boolean;
  networkAvailable: boolean;
};

export function AppUpdateManager({ blocked, networkAvailable }: AppUpdateManagerProps) {
  const responsiveLayout = useResponsiveLayout();
  const [availableUpdate, setAvailableUpdate] = useState<AvailableAppUpdate | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const blockedRef = useRef(blocked);
  const networkAvailableRef = useRef(networkAvailable);
  const checkInFlight = useRef(false);
  const lastCheckAt = useRef(0);
  const mounted = useRef(true);

  blockedRef.current = blocked;
  networkAvailableRef.current = networkAvailable;

  const checkNow = async (force = false) => {
    if (
      checkInFlight.current
      || blockedRef.current
      || !networkAvailableRef.current
      || AppState.currentState !== "active"
    ) return;
    if (!force && Date.now() - lastCheckAt.current < CHECK_THROTTLE_MS) return;

    checkInFlight.current = true;
    lastCheckAt.current = Date.now();
    try {
      const update = await checkForAppUpdate();
      if (mounted.current && update && !blockedRef.current) {
        setError(null);
        setAvailableUpdate(update);
      }
    } finally {
      checkInFlight.current = false;
    }
  };

  useEffect(() => {
    mounted.current = true;
    const initialCheck = setTimeout(() => { void checkNow(); }, 1_500);
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void checkNow();
    });

    return () => {
      mounted.current = false;
      clearTimeout(initialCheck);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!blocked && networkAvailable) void checkNow();
  }, [blocked, networkAvailable]);

  useEffect(() => {
    if (blocked && !isInstalling) setAvailableUpdate(null);
  }, [blocked, isInstalling]);

  const postpone = async () => {
    if (!availableUpdate || (availableUpdate.kind === "native" && availableUpdate.isMandatory)) return;
    await deferAppUpdate(availableUpdate.key).catch(() => undefined);
    setAvailableUpdate(null);
  };

  const install = async () => {
    if (!availableUpdate || blockedRef.current || !networkAvailableRef.current) return;
    setIsInstalling(true);
    setDownloadProgress(0);
    setError(null);

    try {
      if (availableUpdate.kind === "expo") {
        await installExpoUpdate();
        return;
      }
      await downloadAndInstallApk(availableUpdate, setDownloadProgress);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "The update could not be installed.");
    } finally {
      if (mounted.current) setIsInstalling(false);
    }
  };

  if (!availableUpdate) return null;

  const isNative = availableUpdate.kind === "native";
  const isMandatory = isNative && availableUpdate.isMandatory;
  const progressLabel = isNative && downloadProgress > 0
    ? `Downloading ${Math.round(downloadProgress * 100)}%`
    : isNative ? "Preparing download…" : "Downloading update…";

  return (
    <Modal
      animationType="fade"
      transparent
      visible
      onRequestClose={() => { if (!isMandatory && !isInstalling) void postpone(); }}
    >
      <ScrollView
        style={styles.modalScroll}
        contentContainerStyle={[styles.backdrop, { paddingHorizontal: responsiveLayout.gutter }]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, responsiveLayout.isCompact && styles.cardCompact]}>
          <View style={styles.iconWrap}>
            <Ionicons name={isNative ? "phone-portrait-outline" : "flash-outline"} size={35} color="#153F32" />
          </View>
          <Text style={styles.eyebrow}>{isNative ? "NEW APP VERSION" : "QUICK UPDATE"}</Text>
          <Text style={styles.title}>A fresher KopiPow is ready!</Text>
          <Text style={styles.version}>
            {isNative ? `Version ${availableUpdate.versionName}` : `Version ${currentAppVersion} improvements`}
          </Text>
          <Text style={styles.notes}>{availableUpdate.releaseNotes}</Text>
          {isNative ? (
            <Text style={styles.installNote}>Android will ask you to confirm the signed APK installation.</Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.primaryButton, isInstalling && styles.buttonDisabled]}
            disabled={isInstalling}
            onPress={() => { void install(); }}
          >
            {isInstalling ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="download-outline" size={20} color="#FFFFFF" />}
            <Text style={styles.primaryText}>{isInstalling ? progressLabel : "Update now"}</Text>
          </Pressable>

          {!isMandatory && !isInstalling ? (
            <Pressable style={styles.secondaryButton} onPress={() => { void postpone(); }}>
              <Text style={styles.secondaryText}>Later</Text>
            </Pressable>
          ) : null}
          {isMandatory ? <Text style={styles.required}>This update is required to continue safely.</Text> : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScroll: { flex: 1 },
  backdrop: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(21, 63, 50, 0.55)",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 390,
    alignItems: "center",
    borderRadius: 30,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 25,
    paddingVertical: 28,
  },
  cardCompact: { borderRadius: 24, paddingHorizontal: 19, paddingVertical: 21 },
  iconWrap: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 25,
    backgroundColor: "#E2B52F",
    marginBottom: 18,
  },
  eyebrow: { color: "#D4A62A", fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: "#153F32", fontFamily: DISPLAY_FONT_FAMILY, fontSize: 29, textAlign: "center", marginTop: 7 },
  version: { color: "#204C3B", fontSize: 13, fontWeight: "800", marginTop: 9 },
  notes: { color: "#526659", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 14 },
  installNote: { color: "#526659", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 9 },
  error: { color: "#963A31", fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 12 },
  primaryButton: {
    width: "100%",
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 20,
    backgroundColor: "#204C3B",
    marginTop: 22,
  },
  buttonDisabled: { opacity: 0.68 },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  secondaryButton: { paddingHorizontal: 28, paddingVertical: 15, marginTop: 3 },
  secondaryText: { color: "#204C3B", fontSize: 13, fontWeight: "900" },
  required: { color: "#963A31", fontSize: 11, fontWeight: "800", textAlign: "center", marginTop: 13 },
});
