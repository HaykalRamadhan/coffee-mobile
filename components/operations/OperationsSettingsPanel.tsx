import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import type { AppRole } from "../../lib/access";
import {
  checkForAppUpdate,
  currentAppVersion,
} from "../../lib/appUpdates";
import {
  loadOperationsSettings,
  signOutOtherOperationsSessions,
  updateOperationsNotificationPreferences,
  type OperationsBranchSummary,
  type OperationsNotificationPreferences,
} from "../../lib/operationsSettings";
import { previewLocalNotification } from "../../lib/notifications";
import { Text } from "../../lib/typography";

const COLORS = {
  background: "#F3F4F3",
  card: "#FFFFFF",
  divider: "#DDE3DF",
  ink: "#153F32",
  muted: "#607067",
  yellow: "#E2B52F",
  danger: "#A9453B",
  success: "#2E7259",
};

type AuthResult = { error: string | null; message?: string };

type OperationsSettingsPanelProps = {
  role: Exclude<AppRole, "customer">;
  displayName: string;
  email: string | null;
  phone: string | null;
  branchId: string | null;
  compact: boolean;
  networkAvailable: boolean;
  onOpenBranches: () => void;
  onUpdateDisplayName: (displayName: string) => Promise<AuthResult>;
  onUpdatePassword: (password: string) => Promise<AuthResult>;
};

type Notice = { kind: "success" | "error" | "info"; text: string } | null;

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}><Ionicons name={icon} size={21} color={COLORS.ink} /></View>
        <View style={styles.sectionHeaderCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionDescription}>{description}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function PreferenceRow({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceCopy}>
        <Text style={styles.preferenceTitle}>{label}</Text>
        <Text style={styles.preferenceDescription}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#C7CCC9", true: "#BDD1C5" }}
        thumbColor={value ? COLORS.ink : "#FFFFFF"}
      />
    </View>
  );
}

function ActionButton({
  icon,
  label,
  tone = "primary",
  disabled = false,
  loading = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const iconColor = tone === "primary" ? COLORS.card : tone === "danger" ? COLORS.danger : COLORS.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={[
        styles.actionButton,
        tone === "primary" && styles.actionPrimary,
        tone === "danger" && styles.actionDanger,
        (disabled || loading) && styles.actionDisabled,
      ]}
      onPress={onPress}
    >
      {loading
        ? <ActivityIndicator size="small" color={iconColor} />
        : <Ionicons name={icon} size={18} color={iconColor} />}
      <Text style={[
        styles.actionText,
        tone === "primary" && styles.actionTextPrimary,
        tone === "danger" && styles.actionTextDanger,
      ]}>{label}</Text>
    </Pressable>
  );
}

export function OperationsSettingsPanel({
  role,
  displayName,
  email,
  phone,
  branchId,
  compact,
  networkAvailable,
  onOpenBranches,
  onUpdateDisplayName,
  onUpdatePassword,
}: OperationsSettingsPanelProps) {
  const [profileName, setProfileName] = useState(displayName);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [branch, setBranch] = useState<OperationsBranchSummary | null>(null);
  const [preferences, setPreferences] = useState<OperationsNotificationPreferences>({
    orderUpdatesEnabled: true,
    newsEnabled: true,
    generalEnabled: true,
  });
  const [registeredDeviceCount, setRegisteredDeviceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => { setProfileName(displayName); }, [displayName]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadOperationsSettings(branchId).then((result) => {
      if (!active) return;
      setBranch(result.branch);
      setPreferences(result.preferences);
      setRegisteredDeviceCount(result.registeredDeviceCount);
      if (result.error) setNotice({ kind: "error", text: result.error });
      setLoading(false);
    });
    return () => { active = false; };
  }, [branchId]);

  const saveProfile = async () => {
    const cleanedName = profileName.trim();
    if (cleanedName.length < 2) {
      setNotice({ kind: "error", text: "Display name must contain at least two characters." });
      return;
    }
    setProfileBusy(true);
    const result = await onUpdateDisplayName(cleanedName);
    setProfileBusy(false);
    setNotice(result.error
      ? { kind: "error", text: result.error }
      : { kind: "success", text: result.message ?? "Account details updated." });
  };

  const savePassword = async () => {
    if (newPassword.length < 8) {
      setNotice({ kind: "error", text: "The new password must contain at least eight characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ kind: "error", text: "The password confirmation does not match." });
      return;
    }
    setPasswordBusy(true);
    const result = await onUpdatePassword(newPassword);
    setPasswordBusy(false);
    if (!result.error) {
      setNewPassword("");
      setConfirmPassword("");
    }
    setNotice(result.error
      ? { kind: "error", text: result.error }
      : { kind: "success", text: result.message ?? "Password updated." });
  };

  const changePreference = async (
    key: keyof OperationsNotificationPreferences,
    value: boolean,
  ) => {
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setPreferenceBusy(true);
    const result = await updateOperationsNotificationPreferences(next);
    setPreferenceBusy(false);
    if (result.error) {
      setPreferences(previous);
      setNotice({ kind: "error", text: result.error });
      return;
    }
    setNotice({ kind: "success", text: "Notification preferences saved." });
  };

  const sendTestNotification = async () => {
    setTestBusy(true);
    try {
      const identifier = await previewLocalNotification();
      setNotice(identifier
        ? { kind: "success", text: "Test notification sent to this device." }
        : { kind: "info", text: "Open this page in the installed KopiPow development or release app to test notifications." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "The test notification could not be sent.",
      });
    } finally {
      setTestBusy(false);
    }
  };

  const checkForUpdates = async () => {
    setUpdateBusy(true);
    const update = await checkForAppUpdate();
    setUpdateBusy(false);
    if (update) {
      setNotice({ kind: "info", text: `Version ${update.versionName} is available. Return to the app to open the update installer.` });
    } else if (__DEV__) {
      setNotice({ kind: "info", text: "Development mode is already using your live project code. Full update checks run in preview and release builds." });
    } else {
      setNotice({ kind: "success", text: "KopiPow is up to date for this device." });
    }
  };

  const signOutOthers = () => {
    Alert.alert(
      "Sign out other devices?",
      "Other phones, tablets, and browsers signed into this account will need to sign in again. This device stays signed in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out others",
          style: "destructive",
          onPress: () => {
            void signOutOtherOperationsSessions().then((result) => {
              setNotice(result.error
                ? { kind: "error", text: result.error }
                : { kind: "success", text: "Other sessions have been signed out." });
            });
          },
        },
      ],
    );
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={COLORS.ink} /><Text style={styles.loadingText}>Loading settings…</Text></View>;
  }

  return (
    <View>
      {notice ? (
        <View style={[
          styles.notice,
          notice.kind === "error" && styles.noticeError,
          notice.kind === "success" && styles.noticeSuccess,
        ]}>
          <Ionicons
            name={notice.kind === "error" ? "alert-circle-outline" : notice.kind === "success" ? "checkmark-circle-outline" : "information-circle-outline"}
            size={20}
            color={notice.kind === "error" ? COLORS.danger : COLORS.ink}
          />
          <Text style={[styles.noticeText, notice.kind === "error" && styles.noticeTextError]}>{notice.text}</Text>
          <Pressable accessibilityLabel="Dismiss message" onPress={() => setNotice(null)}>
            <Ionicons name="close" size={19} color={COLORS.muted} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.grid, compact && styles.gridCompact]}>
        <View style={styles.column}>
          <Section icon="person-outline" title="Account" description="Your operations identity and contact details">
            <Text style={styles.fieldLabel}>Display name</Text>
            <TextInput
              accessibilityLabel="Display name"
              autoCapitalize="words"
              style={styles.input}
              value={profileName}
              onChangeText={setProfileName}
              placeholder="Your display name"
              placeholderTextColor="#87928B"
            />
            <DetailRow label="Email" value={email ?? "Not available"} />
            <DetailRow label="Phone number" value={phone ?? "Not added"} />
            <DetailRow label="Access" value={role === "admin" ? "Administrator" : "Staff member"} last />
            <ActionButton
              icon="save-outline"
              label="Save account"
              loading={profileBusy}
              disabled={!networkAvailable || profileName.trim() === displayName}
              onPress={() => { void saveProfile(); }}
            />
          </Section>

          <Section icon="storefront-outline" title="Branch" description={role === "admin" ? "Your organisation-wide branch access" : "Your assigned workplace"}>
            {role === "admin" ? (
              <>
                <DetailRow label="Access" value="All branches" />
                <DetailRow label="Management" value="Administrator" last />
                <ActionButton icon="business-outline" label="Manage branches" tone="secondary" onPress={onOpenBranches} />
              </>
            ) : branch ? (
              <>
                <DetailRow label="Branch" value={`${branch.name} · ${branch.code}`} />
                <DetailRow label="Opening status" value={branch.active ? "Open for operations" : "Currently unavailable"} />
                <DetailRow label="Address" value={branch.address || "Not configured"} last />
                <Text style={styles.readOnlyNote}>Branch details are managed by an administrator.</Text>
              </>
            ) : (
              <Text style={styles.emptyCopy}>No branch is currently assigned to this staff account.</Text>
            )}
          </Section>

          <Section icon="shield-checkmark-outline" title="Security" description="Password and active session protection">
            <Text style={styles.fieldLabel}>New password</Text>
            <TextInput
              accessibilityLabel="New password"
              autoCapitalize="none"
              secureTextEntry
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 8 characters"
              placeholderTextColor="#87928B"
            />
            <Text style={styles.fieldLabel}>Confirm new password</Text>
            <TextInput
              accessibilityLabel="Confirm new password"
              autoCapitalize="none"
              secureTextEntry
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Enter it again"
              placeholderTextColor="#87928B"
            />
            <View style={styles.actionStack}>
              <ActionButton
                icon="key-outline"
                label="Change password"
                loading={passwordBusy}
                disabled={!networkAvailable || !newPassword || !confirmPassword}
                onPress={() => { void savePassword(); }}
              />
              <ActionButton icon="log-out-outline" label="Sign out other devices" tone="danger" disabled={!networkAvailable} onPress={signOutOthers} />
            </View>
          </Section>
        </View>

        <View style={styles.column}>
          <Section icon="notifications-outline" title="Notifications" description="Choose which updates reach your registered devices">
            <PreferenceRow
              label="Order updates"
              description="New orders, cancellations, preparation, pickup, and payment status"
              value={preferences.orderUpdatesEnabled}
              disabled={preferenceBusy || registeredDeviceCount === 0}
              onChange={(value) => { void changePreference("orderUpdatesEnabled", value); }}
            />
            <PreferenceRow
              label="News and promotions"
              description="New products, campaigns, and KopiPow announcements"
              value={preferences.newsEnabled}
              disabled={preferenceBusy || registeredDeviceCount === 0}
              onChange={(value) => { void changePreference("newsEnabled", value); }}
            />
            <PreferenceRow
              label="General alerts"
              description="Important service, security, and account information"
              value={preferences.generalEnabled}
              disabled={preferenceBusy || registeredDeviceCount === 0}
              onChange={(value) => { void changePreference("generalEnabled", value); }}
            />
            <Text style={styles.deviceNote}>
              {registeredDeviceCount > 0
                ? `${registeredDeviceCount} registered device${registeredDeviceCount === 1 ? "" : "s"} will use these preferences.`
                : "No push-capable device is registered. Open the installed KopiPow development or release app first."}
            </Text>
            <ActionButton icon="paper-plane-outline" label="Send test notification" tone="secondary" loading={testBusy} onPress={() => { void sendTestNotification(); }} />
          </Section>

          <Section icon="phone-portrait-outline" title="Application" description="Version, connectivity, updates, and support status">
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, networkAvailable ? styles.statusOnline : styles.statusOffline]} />
              <View style={styles.statusCopy}>
                <Text style={styles.preferenceTitle}>{networkAvailable ? "Systems online" : "You are offline"}</Text>
                <Text style={styles.preferenceDescription}>{networkAvailable ? "KopiPow services are reachable." : "Reconnect before changing cloud settings."}</Text>
              </View>
            </View>
            <DetailRow label="App version" value={currentAppVersion} />
            <DetailRow label="Update method" value="Secure EAS + Android installer" last />
            <ActionButton icon="refresh-outline" label="Check for updates" loading={updateBusy} disabled={!networkAvailable} onPress={() => { void checkForUpdates(); }} />
            <View style={styles.supportBox}>
              <Ionicons name="help-buoy-outline" size={20} color={COLORS.ink} />
              <View style={styles.supportCopy}>
                <Text style={styles.preferenceTitle}>Help and support</Text>
                <Text style={styles.preferenceDescription}>For now, report an issue to your KopiPow administrator with a screenshot and the app version above.</Text>
              </View>
            </View>
          </Section>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 19, backgroundColor: COLORS.card },
  loadingText: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  notice: { flexDirection: "row", alignItems: "center", gap: 9, padding: 13, marginBottom: 14, borderRadius: 14, borderWidth: 1, borderColor: "#D5DFD9", backgroundColor: "#EEF3F0" },
  noticeSuccess: { borderColor: "#BED6C8", backgroundColor: "#E9F3ED" },
  noticeError: { borderColor: "#E8C9C3", backgroundColor: "#F8E9E5" },
  noticeText: { flex: 1, color: COLORS.ink, fontSize: 9.5, lineHeight: 14, fontWeight: "700" },
  noticeTextError: { color: COLORS.danger },
  grid: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  gridCompact: { flexDirection: "column" },
  column: { flex: 1, width: "100%", gap: 14 },
  section: { width: "100%", padding: 18, borderRadius: 19, borderWidth: 1, borderColor: COLORS.divider, backgroundColor: COLORS.card },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 17 },
  sectionIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#F3E8B9" },
  sectionHeaderCopy: { flex: 1 },
  sectionTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "900" },
  sectionDescription: { color: COLORS.muted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  fieldLabel: { color: COLORS.ink, fontSize: 9, fontWeight: "900", marginBottom: 6, marginTop: 3 },
  input: { minHeight: 47, borderWidth: 1, borderColor: "#CAD4CE", borderRadius: 13, paddingHorizontal: 13, marginBottom: 11, backgroundColor: "#FAFBFA", color: COLORS.ink, fontSize: 14, fontWeight: "700" },
  detailRow: { minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, borderTopWidth: 1, borderTopColor: COLORS.divider },
  rowLast: { borderBottomWidth: 1, borderBottomColor: COLORS.divider, marginBottom: 14 },
  rowLabel: { color: COLORS.muted, fontSize: 9.5, fontWeight: "700" },
  rowValue: { flex: 1, color: COLORS.ink, fontSize: 9.5, fontWeight: "900", textAlign: "right" },
  preferenceRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: COLORS.divider },
  preferenceCopy: { flex: 1 },
  preferenceTitle: { color: COLORS.ink, fontSize: 10.5, fontWeight: "900" },
  preferenceDescription: { color: COLORS.muted, fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  deviceNote: { color: COLORS.muted, fontSize: 8.5, lineHeight: 13, marginVertical: 12 },
  readOnlyNote: { color: COLORS.muted, fontSize: 8.5, lineHeight: 13, marginBottom: 13 },
  emptyCopy: { color: COLORS.muted, fontSize: 10, lineHeight: 15 },
  actionStack: { gap: 8 },
  actionButton: { minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: COLORS.divider, borderRadius: 13, paddingHorizontal: 14, backgroundColor: COLORS.card },
  actionPrimary: { borderColor: COLORS.ink, backgroundColor: COLORS.ink },
  actionDanger: { borderColor: "#E8C9C3", backgroundColor: "#FFF9F7" },
  actionDisabled: { opacity: 0.48 },
  actionText: { color: COLORS.ink, fontSize: 9.5, fontWeight: "900" },
  actionTextPrimary: { color: COLORS.card },
  actionTextDanger: { color: COLORS.danger },
  statusRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, marginBottom: 6, borderRadius: 13, backgroundColor: COLORS.background },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOnline: { backgroundColor: COLORS.success },
  statusOffline: { backgroundColor: COLORS.danger },
  statusCopy: { flex: 1 },
  supportBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 13, marginTop: 12, borderRadius: 13, backgroundColor: "#F3E8B9" },
  supportCopy: { flex: 1 },
});
