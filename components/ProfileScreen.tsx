import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
  type RefreshControlProps,
  type TextProps,
} from "react-native";
import { createContext, useContext, useEffect, useState, type ReactElement } from "react";
import { useAuth } from "../auth/AuthContext";
import { orderStatusLabel, type AccountOrder } from "../lib/orders";

const COLORS = {
  ink: "#153F32",
  cream: "#C9C7A7",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#EEEBCB",
};

type AuthMode = "signIn" | "signUp";

type ProfileScreenProps = {
  isOrdersLoading: boolean;
  onOpenOrderHistory: () => void;
  orders: AccountOrder[];
  ordersError: string | null;
  refreshControl: ReactElement<RefreshControlProps>;
  typographyScale: number;
};

const formatRupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

const formatOrderDate = (createdAt: string) => new Date(createdAt).toLocaleDateString("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const ProfileTypographyContext = createContext(1);

function Text({ maxFontSizeMultiplier = 1.2, ...props }: TextProps) {
  const typographyScale = useContext(ProfileTypographyContext);
  const flattenedStyle = StyleSheet.flatten(props.style);
  const responsiveStyle = flattenedStyle?.fontSize ? {
    fontSize: flattenedStyle.fontSize * typographyScale,
    lineHeight: flattenedStyle.lineHeight ? flattenedStyle.lineHeight * typographyScale : undefined,
  } : undefined;

  return <NativeText maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} style={[props.style, responsiveStyle]} />;
}

export function ProfileScreen({
  isOrdersLoading,
  onOpenOrderHistory,
  orders,
  ordersError,
  refreshControl,
  typographyScale,
}: ProfileScreenProps) {
  const {
    appUser,
    isAuthenticated,
    isInitializing,
    isSupabaseConfigured,
    sendPasswordReset,
    session,
    signIn,
    signOut,
    signUp,
    updateDisplayName,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileName, setProfileName] = useState(appUser.displayName);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    setProfileName(appUser.displayName);
  }, [appUser.displayName]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setNotice(null);
    setPassword("");
  };

  const validateCredentials = () => {
    if (!email.trim() || !email.includes("@")) return "Enter a valid email address.";
    if (password.length < 6) return "Use at least 6 characters for your password.";
    if (mode === "signUp" && displayName.trim().length < 2) return "Tell us what we should call you.";
    return null;
  };

  const submitAuth = async () => {
    const validationError = validateCredentials();
    if (validationError) {
      setNotice({ type: "error", text: validationError });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);
    try {
      const result = mode === "signIn"
        ? await signIn(email, password)
        : await signUp(displayName, email, password);

      if (result.error) setNotice({ type: "error", text: result.error });
      else if (result.message) setNotice({ type: "success", text: result.message });
    } catch {
      setNotice({ type: "error", text: "The account request failed unexpectedly. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestPasswordReset = async () => {
    if (!email.trim() || !email.includes("@")) {
      setNotice({ type: "error", text: "Enter your email first, then request a reset." });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);
    try {
      const result = await sendPasswordReset(email);
      setNotice({
        type: result.error ? "error" : "success",
        text: result.error ?? result.message ?? "Recovery email requested.",
      });
    } catch {
      setNotice({ type: "error", text: "The recovery request failed unexpectedly. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveProfile = async () => {
    if (profileName.trim().length < 2) {
      setNotice({ type: "error", text: "Your display name needs at least 2 characters." });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);
    try {
      const result = await updateDisplayName(profileName);
      setNotice({
        type: result.error ? "error" : "success",
        text: result.error ?? result.message ?? "Profile updated.",
      });
    } catch {
      setNotice({ type: "error", text: "The profile update failed unexpectedly. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const logOut = async () => {
    setIsSubmitting(true);
    setNotice(null);
    try {
      const result = await signOut();
      if (result.error) setNotice({ type: "error", text: result.error });
    } catch {
      setNotice({ type: "error", text: "Sign out failed unexpectedly. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputTextSize = 12.5 * typographyScale;

  return (
    <ProfileTypographyContext.Provider value={typographyScale}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      <View style={styles.topBar}>
        <View style={styles.logoRow}>
          <View style={styles.logoMark}><Text style={styles.logoBolt}>ϟ</Text></View>
          <View>
            <Text style={styles.logo} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>Kopi POW!</Text>
            <Text style={styles.logoLine}>99% REAAAADY TO GOW</Text>
          </View>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{appUser.initials}</Text>
          <View style={[styles.statusDot, isAuthenticated && styles.statusDotOnline]} />
        </View>
      </View>

      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{isAuthenticated ? "YOUR KOPIPOW ACCOUNT" : "POWER UP YOUR EXPERIENCE"}</Text>
        <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.74}>
          {isAuthenticated ? `Hi, ${appUser.displayName}!` : "Your Profile!"}
        </Text>
        <Text style={styles.headingCopy}>
          {isAuthenticated
            ? "Keep your account details fresh and your future orders connected."
            : "Sign in to prepare for saved orders, rewards, and faster checkout."}
        </Text>
      </View>

      {isInitializing ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={COLORS.green} />
          <Text style={styles.loadingText}>Restoring your session…</Text>
        </View>
      ) : isAuthenticated ? (
        <>
          <View style={styles.identityCard}>
            <View style={styles.identityAvatar}>
              <Text style={styles.identityInitials}>{appUser.initials}</Text>
            </View>
            <View style={styles.identityCopy}>
              <Text style={styles.identityName}>{appUser.displayName}</Text>
              <Text style={styles.identityEmail}>{appUser.email}</Text>
              <View style={styles.verifiedPill}>
                <Ionicons name="shield-checkmark" size={14} color={COLORS.green} />
                <Text style={styles.verifiedText}>
                  {session?.user.email_confirmed_at ? "Email confirmed" : "Email confirmation pending"}
                </Text>
              </View>
            </View>
          </View>

          <Pressable style={styles.ordersCard} onPress={onOpenOrderHistory}>
            <View style={styles.ordersHeadingRow}>
              <View style={styles.ordersIcon}><Ionicons name="receipt-outline" size={22} color={COLORS.green} /></View>
              <View style={styles.ordersHeadingCopy}>
                <Text style={styles.ordersTitle}>Your order history</Text>
                <Text style={styles.ordersSubtitle}>Active pickups and previous power-ups</Text>
              </View>
              <Ionicons name="chevron-forward" size={21} color={COLORS.green} />
            </View>

            {isOrdersLoading && orders.length === 0 ? (
              <View style={styles.ordersStateRow}>
                <ActivityIndicator size="small" color={COLORS.green} />
                <Text style={styles.ordersStateText}>Loading orders…</Text>
              </View>
            ) : ordersError ? (
              <View style={[styles.ordersStateRow, styles.ordersErrorRow]}>
                <Ionicons name="cloud-offline-outline" size={18} color="#8F382E" />
                <Text style={styles.ordersErrorText}>Tap to retry from order history.</Text>
              </View>
            ) : orders.length === 0 ? (
              <View style={styles.ordersStateRow}>
                <Ionicons name="bag-handle-outline" size={18} color={COLORS.muted} />
                <Text style={styles.ordersStateText}>Your first order will appear here.</Text>
              </View>
            ) : (
              <View style={styles.profileOrderList}>
                {orders.slice(0, 3).map((order) => (
                  <View key={order.id} style={styles.profileOrderRow}>
                    <View style={styles.profileOrderCode}>
                      <Text style={styles.profileOrderCodeText}>{order.id.slice(0, 4).toUpperCase()}</Text>
                    </View>
                    <View style={styles.profileOrderCopy}>
                      <Text style={styles.profileOrderTitle}>{orderStatusLabel[order.status]}</Text>
                      <Text style={styles.profileOrderDetail} numberOfLines={1}>
                        {formatOrderDate(order.createdAt)} · {order.items.reduce((total, item) => total + item.quantity, 0)} items
                      </Text>
                    </View>
                    <Text style={styles.profileOrderTotal}>{formatRupiah(order.total)}</Text>
                  </View>
                ))}
                {orders.length > 3 && <Text style={styles.moreOrdersText}>+ {orders.length - 3} more orders</Text>}
              </View>
            )}
          </Pressable>

          <View style={styles.formCard}>
            <View style={styles.formTitleRow}>
              <View style={styles.formIcon}><Ionicons name="person-outline" size={21} color={COLORS.green} /></View>
              <View style={styles.formTitleCopy}>
                <Text style={styles.formTitle}>Profile details</Text>
                <Text style={styles.formSubtitle}>This name appears throughout KopiPow.</Text>
              </View>
            </View>

            <Text style={styles.inputLabel}>DISPLAY NAME</Text>
            <TextInput
              value={profileName}
              onChangeText={setProfileName}
              placeholder="Your name"
              placeholderTextColor="#858979"
              selectionColor={COLORS.orange}
              maxLength={60}
              maxFontSizeMultiplier={1.2}
              style={[styles.input, { fontSize: inputTextSize }]}
              accessibilityLabel="Display name"
            />

            {notice && (
              <View style={[styles.notice, notice.type === "error" ? styles.errorNotice : styles.successNotice]}>
                <Ionicons name={notice.type === "error" ? "alert-circle-outline" : "checkmark-circle-outline"} size={18} color={notice.type === "error" ? "#8F382E" : COLORS.green} />
                <Text style={[styles.noticeText, notice.type === "error" && styles.errorNoticeText]}>{notice.text}</Text>
              </View>
            )}

            <Pressable
              style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
              onPress={saveProfile}
              disabled={isSubmitting}
            >
              {isSubmitting ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryButtonText}>Save profile</Text>}
            </Pressable>
          </View>

          <View style={styles.accountCard}>
            <View>
              <Text style={styles.accountTitle}>Taking a coffee break?</Text>
              <Text style={styles.accountCopy}>Your session will stay safely stored until you sign out.</Text>
            </View>
            <Pressable style={styles.signOutButton} onPress={logOut} disabled={isSubmitting}>
              <Ionicons name="log-out-outline" size={20} color={COLORS.green} />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {!isSupabaseConfigured && (
            <View style={styles.setupCard}>
              <View style={styles.setupIcon}><Ionicons name="construct-outline" size={25} color={COLORS.green} /></View>
              <View style={styles.setupCopy}>
                <Text style={styles.setupTitle}>Authentication needs its public connection.</Text>
                <Text style={styles.setupText}>Add the Supabase URL and publishable key from the project dashboard to your local .env file, then restart Expo. Guest browsing remains available.</Text>
              </View>
            </View>
          )}

          <View style={styles.authCard}>
            <View style={styles.modeSwitch}>
              <Pressable style={[styles.modeButton, mode === "signIn" && styles.modeButtonActive]} onPress={() => changeMode("signIn")}>
                <Text style={[styles.modeText, mode === "signIn" && styles.modeTextActive]}>Sign in</Text>
              </Pressable>
              <Pressable style={[styles.modeButton, mode === "signUp" && styles.modeButtonActive]} onPress={() => changeMode("signUp")}>
                <Text style={[styles.modeText, mode === "signUp" && styles.modeTextActive]}>Create account</Text>
              </Pressable>
            </View>

            <Text style={styles.authTitle}>{mode === "signIn" ? "Welcome back!" : "Join the power-up."}</Text>
            <Text style={styles.authSubtitle}>
              {mode === "signIn" ? "Sign in with your KopiPow account." : "Create your account with email and password."}
            </Text>

            {mode === "signUp" && (
              <>
                <Text style={styles.inputLabel}>DISPLAY NAME</Text>
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="What should we call you?"
                  placeholderTextColor="#858979"
                  selectionColor={COLORS.orange}
                  autoCapitalize="words"
                  textContentType="name"
                  autoComplete="name"
                  maxLength={60}
                  maxFontSizeMultiplier={1.2}
                  style={[styles.input, { fontSize: inputTextSize }]}
                />
              </>
            )}

            <Text style={styles.inputLabel}>EMAIL</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#858979"
              selectionColor={COLORS.orange}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              maxFontSizeMultiplier={1.2}
              style={[styles.input, { fontSize: inputTextSize }]}
              accessibilityLabel="Email address"
            />

            <Text style={styles.inputLabel}>PASSWORD</Text>
            <View style={styles.passwordField}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                placeholderTextColor="#858979"
                selectionColor={COLORS.orange}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                textContentType={mode === "signIn" ? "password" : "newPassword"}
                maxFontSizeMultiplier={1.2}
                style={[styles.passwordInput, { fontSize: inputTextSize }]}
                accessibilityLabel="Password"
              />
              <Pressable style={styles.passwordToggle} onPress={() => setShowPassword((visible) => !visible)} accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color={COLORS.muted} />
              </Pressable>
            </View>

            {mode === "signIn" && (
              <Pressable style={styles.forgotButton} onPress={requestPasswordReset} disabled={isSubmitting || !isSupabaseConfigured}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            )}

            {notice && (
              <View style={[styles.notice, notice.type === "error" ? styles.errorNotice : styles.successNotice]}>
                <Ionicons name={notice.type === "error" ? "alert-circle-outline" : "checkmark-circle-outline"} size={18} color={notice.type === "error" ? "#8F382E" : COLORS.green} />
                <Text style={[styles.noticeText, notice.type === "error" && styles.errorNoticeText]}>{notice.text}</Text>
              </View>
            )}

            <Pressable
              style={[styles.primaryButton, (!isSupabaseConfigured || isSubmitting) && styles.buttonDisabled]}
              onPress={submitAuth}
              disabled={!isSupabaseConfigured || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>{mode === "signIn" ? "Sign in" : "Create my account"}</Text>
                  <Ionicons name="arrow-forward" size={19} color={COLORS.white} />
                </>
              )}
            </Pressable>

            <View style={styles.securityNote}>
              <Ionicons name="lock-closed-outline" size={16} color={COLORS.muted} />
              <Text style={styles.securityText}>KopiPow never stores your password in the app. Supabase handles authentication securely.</Text>
            </View>
          </View>
        </>
      )}
      </ScrollView>
    </ProfileTypographyContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.cream },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 124 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#BBB99A", borderRadius: 19, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 22 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  logoBolt: { color: COLORS.green, fontSize: 29, fontWeight: "900", lineHeight: 32 },
  logo: { color: COLORS.ink, fontSize: 23, fontWeight: "900", fontStyle: "italic", letterSpacing: -1.4 },
  logoLine: { color: COLORS.muted, fontSize: 7, fontWeight: "800", letterSpacing: 1.7, marginTop: 1 },
  avatar: { width: 40, height: 40, borderRadius: 15, backgroundColor: COLORS.ink, alignItems: "center", justifyContent: "center", transform: [{ rotate: "3deg" }] },
  avatarText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  statusDot: { position: "absolute", right: -1, bottom: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: "#8E8E7B", borderWidth: 2, borderColor: COLORS.cream },
  statusDotOnline: { backgroundColor: COLORS.yellow },
  heading: { paddingTop: 24, paddingBottom: 24 },
  eyebrow: { color: COLORS.orange, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4, marginBottom: 7 },
  title: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontWeight: "900", fontSize: 42, lineHeight: 45, letterSpacing: -1.5 },
  headingCopy: { color: COLORS.muted, fontSize: 11.5, lineHeight: 18, maxWidth: 330, marginTop: 10 },
  loadingCard: { minHeight: 210, borderRadius: 24, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  setupCard: { flexDirection: "row", backgroundColor: COLORS.yellow, borderRadius: 20, padding: 16, marginBottom: 14 },
  setupIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(238,235,203,0.72)", alignItems: "center", justifyContent: "center", marginRight: 12 },
  setupCopy: { flex: 1 },
  setupTitle: { color: COLORS.ink, fontSize: 12, lineHeight: 17, fontWeight: "900" },
  setupText: { color: COLORS.green, fontSize: 8.5, lineHeight: 13, marginTop: 5 },
  authCard: { backgroundColor: COLORS.white, borderRadius: 25, padding: 18, borderWidth: 1, borderColor: "#DCD7B7" },
  modeSwitch: { flexDirection: "row", backgroundColor: COLORS.cream, borderRadius: 17, padding: 4, marginBottom: 22 },
  modeButton: { flex: 1, borderRadius: 14, alignItems: "center", paddingVertical: 10 },
  modeButtonActive: { backgroundColor: COLORS.green },
  modeText: { color: COLORS.muted, fontSize: 10, fontWeight: "800" },
  modeTextActive: { color: COLORS.white, fontWeight: "900" },
  authTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 25, fontWeight: "900" },
  authSubtitle: { color: COLORS.muted, fontSize: 9.5, lineHeight: 15, marginTop: 5, marginBottom: 20 },
  inputLabel: { color: COLORS.green, fontSize: 8, fontWeight: "900", letterSpacing: 1.15, marginBottom: 7, marginTop: 2 },
  input: { minHeight: 50, borderRadius: 15, backgroundColor: "#DCD9B8", borderWidth: 1, borderColor: "#D1CDAA", color: COLORS.ink, fontWeight: "600", paddingHorizontal: 14, marginBottom: 15 },
  passwordField: { minHeight: 50, borderRadius: 15, backgroundColor: "#DCD9B8", borderWidth: 1, borderColor: "#D1CDAA", flexDirection: "row", alignItems: "center", marginBottom: 7 },
  passwordInput: { flex: 1, minWidth: 0, color: COLORS.ink, fontWeight: "600", paddingHorizontal: 14, paddingVertical: 12 },
  passwordToggle: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  forgotButton: { alignSelf: "flex-end", paddingVertical: 7, paddingLeft: 12, marginBottom: 4 },
  forgotText: { color: COLORS.orange, fontSize: 9, fontWeight: "900" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 14, padding: 11, backgroundColor: "#D9E2D2", marginTop: 8, marginBottom: 2 },
  errorNotice: { backgroundColor: "#ECD1C8" },
  successNotice: { backgroundColor: "#D9E2D2" },
  noticeText: { flex: 1, color: COLORS.green, fontSize: 8.5, lineHeight: 13, fontWeight: "700" },
  errorNoticeText: { color: "#8F382E" },
  primaryButton: { minHeight: 52, borderRadius: 18, backgroundColor: COLORS.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 17 },
  buttonDisabled: { opacity: 0.48 },
  primaryButtonText: { color: COLORS.white, fontSize: 11, fontWeight: "900" },
  securityNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 5, marginTop: 15 },
  securityText: { flex: 1, color: COLORS.muted, fontSize: 7.5, lineHeight: 11 },
  identityCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.green, borderRadius: 24, padding: 17, marginBottom: 14 },
  identityAvatar: { width: 66, height: 66, borderRadius: 23, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginRight: 15, transform: [{ rotate: "-3deg" }] },
  identityInitials: { color: COLORS.green, fontSize: 22, fontWeight: "900" },
  identityCopy: { flex: 1 },
  identityName: { color: COLORS.white, fontFamily: "serif", fontStyle: "italic", fontSize: 20, fontWeight: "900" },
  identityEmail: { color: "#C8D2C7", fontSize: 8.5, marginTop: 3 },
  verifiedPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.yellow, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, marginTop: 9 },
  verifiedText: { color: COLORS.green, fontSize: 7.5, fontWeight: "900" },
  ordersCard: { backgroundColor: COLORS.white, borderRadius: 24, padding: 17, marginBottom: 14, borderWidth: 1, borderColor: "#DCD7B7" },
  ordersHeadingRow: { flexDirection: "row", alignItems: "center" },
  ordersIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginRight: 11 },
  ordersHeadingCopy: { flex: 1 },
  ordersTitle: { color: COLORS.ink, fontSize: 13, fontWeight: "900" },
  ordersSubtitle: { color: COLORS.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  ordersStateRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#DCD9B8", borderRadius: 14, padding: 12, marginTop: 14 },
  ordersStateText: { color: COLORS.muted, fontSize: 8.5, fontWeight: "700" },
  ordersErrorRow: { backgroundColor: "#ECD1C8" },
  ordersErrorText: { color: "#8F382E", fontSize: 8.5, fontWeight: "700" },
  profileOrderList: { marginTop: 12 },
  profileOrderRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#E0DCBC" },
  profileOrderCode: { width: 38, height: 34, borderRadius: 11, backgroundColor: "#DCD9B8", alignItems: "center", justifyContent: "center", marginRight: 9 },
  profileOrderCodeText: { color: COLORS.green, fontSize: 7.5, fontWeight: "900", letterSpacing: 0.5 },
  profileOrderCopy: { flex: 1 },
  profileOrderTitle: { color: COLORS.ink, fontSize: 9.5, fontWeight: "900" },
  profileOrderDetail: { color: COLORS.muted, fontSize: 7.5, marginTop: 2 },
  profileOrderTotal: { color: COLORS.orange, fontSize: 8.5, fontWeight: "900", marginLeft: 8 },
  moreOrdersText: { color: COLORS.orange, fontSize: 8, fontWeight: "900", textAlign: "center", marginTop: 8 },
  formCard: { backgroundColor: COLORS.white, borderRadius: 24, padding: 18, marginBottom: 14 },
  formTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  formIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#DCD9B8", alignItems: "center", justifyContent: "center", marginRight: 11 },
  formTitleCopy: { flex: 1 },
  formTitle: { color: COLORS.ink, fontSize: 13, fontWeight: "900" },
  formSubtitle: { color: COLORS.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  accountCard: { backgroundColor: "#BBB99A", borderRadius: 21, padding: 16 },
  accountTitle: { color: COLORS.ink, fontSize: 11.5, fontWeight: "900" },
  accountCopy: { color: COLORS.muted, fontSize: 8, lineHeight: 12, marginTop: 4 },
  signOutButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: COLORS.white, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14 },
  signOutText: { color: COLORS.green, fontSize: 9, fontWeight: "900" },
});
