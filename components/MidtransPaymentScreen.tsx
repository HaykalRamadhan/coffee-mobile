import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  paymentGateway,
  type OnlinePaymentStatus,
} from "../lib/payments";
import {
  clearPaymentCheckpoint,
  isTerminalPaymentStatus,
  savePaymentCheckpoint,
  type PaymentCheckpointPhase,
} from "../lib/paymentRecovery";
import { useResponsiveLayout } from "../lib/responsive";
import { DISPLAY_FONT_FAMILY, Text } from "../lib/typography";

const COLORS = {
  ink: "#153F32",
  cream: "#DEE0DF",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#FFFFFF",
};

const formatRupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

type MidtransPaymentScreenProps = {
  orderId: string;
  userId: string;
  total: number;
  networkAvailable: boolean;
  onBack: () => void;
  onPaymentUpdated: () => void;
};

export function MidtransPaymentScreen({
  orderId,
  userId,
  total,
  networkAvailable,
  onBack,
  onPaymentUpdated,
}: MidtransPaymentScreenProps) {
  const insets = useSafeAreaInsets();
  const responsiveLayout = useResponsiveLayout();
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<OnlinePaymentStatus>("pending");
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const wasBackgrounded = useRef(false);
  const wasOffline = useRef(false);
  const appState = useRef(AppState.currentState);
  const syncInFlight = useRef<Promise<OnlinePaymentStatus | null> | null>(null);
  const closeAfterSync = useRef(false);

  const saveCheckpoint = (
    phase: PaymentCheckpointPhase,
    lastKnownStatus: OnlinePaymentStatus = paymentStatus,
  ) => savePaymentCheckpoint({ orderId, userId, total, phase, lastKnownStatus });

  const startPayment = async () => {
    setIsLoading(true);
    setError(null);
    setTransactionStatus(null);
    if (!networkAvailable || appState.current !== "active") {
      await saveCheckpoint("paused", "pending").catch(() => undefined);
      setError("Connection paused. Your payment progress is saved and will resume when you reconnect.");
      setIsLoading(false);
      return;
    }

    await saveCheckpoint("preparing", "pending").catch(() => undefined);
    const result = await paymentGateway.createSession(orderId);
    if (result.error || !result.data) {
      await saveCheckpoint("paused", "pending").catch(() => undefined);
      setError(result.error ?? "The secure payment page could not be opened.");
      setIsLoading(false);
      return;
    }

    setPaymentStatus(result.data.paymentStatus);
    if (isTerminalPaymentStatus(result.data.paymentStatus)) {
      await clearPaymentCheckpoint(orderId).catch(() => undefined);
    } else {
      await saveCheckpoint("awaiting_confirmation", result.data.paymentStatus).catch(() => undefined);
    }
    setPaymentUrl(result.data.paymentUrl);
    setIsLoading(false);
  };

  const synchronizePayment = async (closeWhenPending: boolean) => {
    closeAfterSync.current = closeAfterSync.current || closeWhenPending;
    if (syncInFlight.current) return syncInFlight.current;
    if (!networkAvailable || appState.current !== "active") {
      await saveCheckpoint("paused").catch(() => undefined);
      setError("Connection paused. Your payment progress is saved and verification will resume automatically.");
      return null;
    }

    setIsChecking(true);
    setError(null);
    await saveCheckpoint("verifying").catch(() => undefined);
    const request = (async () => {
      const result = await paymentGateway.synchronizeStatus(orderId);

      if (result.error || !result.data) {
        await saveCheckpoint("paused").catch(() => undefined);
        setError(result.error ?? "The latest payment status could not be checked.");
        return null;
      }

      setPaymentStatus(result.data.paymentStatus);
      setTransactionStatus(result.data.transactionStatus);
      if (isTerminalPaymentStatus(result.data.paymentStatus)) {
        await clearPaymentCheckpoint(orderId).catch(() => undefined);
      } else {
        await saveCheckpoint("awaiting_confirmation", result.data.paymentStatus).catch(() => undefined);
      }
      onPaymentUpdated();
      if (closeAfterSync.current || result.data.paymentStatus !== "pending") setPaymentUrl(null);
      return result.data.paymentStatus;
    })().finally(() => {
      setIsChecking(false);
      closeAfterSync.current = false;
      syncInFlight.current = null;
    });

    syncInFlight.current = request;
    return request;
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startPayment();
  }, [orderId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      appState.current = state;
      if (state !== "active") {
        wasBackgrounded.current = true;
        if (!isTerminalPaymentStatus(paymentStatus)) {
          void saveCheckpoint("paused").catch(() => undefined);
        }
        return;
      }
      if (wasBackgrounded.current && networkAvailable && paymentStatus === "pending") {
        wasBackgrounded.current = false;
        void synchronizePayment(false);
      }
    });
    return () => subscription.remove();
  }, [networkAvailable, paymentStatus]);

  useEffect(() => {
    if (!networkAvailable) {
      wasOffline.current = true;
      if (!isTerminalPaymentStatus(paymentStatus)) {
        void saveCheckpoint("paused").catch(() => undefined);
        setError("Connection paused. Your payment progress is saved and verification will resume automatically.");
      }
      return;
    }

    if (wasOffline.current && appState.current === "active" && paymentStatus === "pending") {
      wasOffline.current = false;
      void synchronizePayment(false);
    }
  }, [networkAvailable, paymentStatus]);

  const handleNavigation = (url: string) => {
    // Let the server finish page load so it can verify Midtrans and persist the
    // payment even when the app-side status request or dashboard webhook is
    // delayed. The page then links back through the app scheme below.
    if (url.includes("/functions/v1/midtrans-finish")) return true;

    if (url.startsWith("kopipow://payment/complete")) {
      const callbackStatus = new URL(url).searchParams.get("payment_status") as OnlinePaymentStatus | null;
      if (callbackStatus && ["pending", "paid", "failed", "expired", "refunded"].includes(callbackStatus)) {
        setPaymentStatus(callbackStatus);
        setPaymentUrl(null);
        if (isTerminalPaymentStatus(callbackStatus)) {
          void clearPaymentCheckpoint(orderId).catch(() => undefined);
        } else {
          void saveCheckpoint("awaiting_confirmation", callbackStatus).catch(() => undefined);
        }
        onPaymentUpdated();
      } else {
        void synchronizePayment(true);
      }
      return false;
    }

    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("about:")) {
      void Linking.openURL(url).catch(() => {
        setError("The selected payment app could not be opened on this device.");
      });
      return false;
    }
    return true;
  };

  const exitPayment = async () => {
    await synchronizePayment(true);
    onBack();
  };

  if (isLoading) {
    return (
      <View style={[styles.centeredScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={COLORS.green} />
        <Text style={styles.loadingTitle}>Preparing secure payment…</Text>
        <Text style={styles.loadingCopy}>KopiPow is connecting to Midtrans Sandbox.</Text>
      </View>
    );
  }

  if (!paymentUrl) {
    const isPaid = paymentStatus === "paid";
    const isPending = paymentStatus === "pending";
    const isCancelled = transactionStatus === "cancel";
    const isClosedOrderError = Boolean(error && /cancelled|closed|not eligible/i.test(error));
    const canRetryOpening = Boolean(error) && isPending && !isClosedOrderError;
    return (
      <ScrollView
        style={styles.resultScroll}
        contentContainerStyle={[
          styles.resultScreen,
          responsiveLayout.isCompact && styles.resultScreenCompact,
          {
            paddingHorizontal: responsiveLayout.gutter,
            paddingTop: 16 + insets.top,
            paddingBottom: 16 + insets.bottom,
          },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.resultIcon, responsiveLayout.isCompact && styles.resultIconCompact, isPaid ? styles.resultIconPaid : isPending ? styles.resultIconPending : styles.resultIconFailed]}>
          <Ionicons
            name={isPaid ? "checkmark" : isPending ? "time-outline" : "alert-outline"}
            size={50}
            color={COLORS.green}
          />
        </View>
        <Text style={styles.eyebrow}>{isPaid ? "PAYMENT CONFIRMED" : isPending ? "PAYMENT PENDING" : isCancelled ? "PAYMENT CANCELLED" : "PAYMENT NOT COMPLETED"}</Text>
        <Text style={[styles.resultTitle, responsiveLayout.isCompact && styles.resultTitleCompact]}>{isPaid ? "Your power-up is paid!" : isPending ? "We’re waiting for confirmation." : isCancelled ? "No charge was made." : "Let’s try that payment again."}</Text>
        <Text style={styles.resultCopy}>
          {isPaid
            ? "Your order is confirmed and will appear in your order history."
            : isPending
              ? "Some payment methods need extra time. You can safely return to your orders and check again later."
              : isCancelled
                ? "The Midtrans transaction was cancelled. You can safely start a new payment attempt for this order."
                : "No successful charge was confirmed. You can reopen Midtrans without creating another KopiPow order."}
        </Text>
        <View style={styles.orderCard}>
          <Text style={styles.orderLabel}>ORDER #{orderId.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.orderTotal}>{formatRupiah(total)}</Text>
        </View>
        {error && <Text style={styles.errorText}>{error}</Text>}
        {canRetryOpening && (
          <Pressable style={[styles.primaryButton, !networkAvailable && styles.primaryButtonDisabled]} disabled={!networkAvailable} onPress={() => { void startPayment(); }}>
            <Text style={styles.primaryButtonText}>Open secure payment</Text>
          </Pressable>
        )}
        {isPending && !error && (
          <Pressable style={styles.primaryButton} onPress={() => { void synchronizePayment(true); }} disabled={isChecking}>
            {isChecking ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryButtonText}>Check payment status</Text>}
          </Pressable>
        )}
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>Back to order history</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { minHeight: 68 + insets.top, paddingTop: insets.top }]}>
        <Pressable style={styles.closeButton} onPress={() => { void exitPayment(); }} accessibilityLabel="Close payment">
          <Ionicons name="close" size={25} color={COLORS.green} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Secure payment</Text>
          <Text style={styles.headerSubtitle}>Midtrans · {formatRupiah(total)}</Text>
        </View>
        <Ionicons name="shield-checkmark-outline" size={25} color={COLORS.green} />
      </View>

      <WebView
        source={{ uri: paymentUrl }}
        style={styles.webView}
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically
        domStorageEnabled
        cacheEnabled={false}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(navigation) => handleNavigation(navigation.url)}
        onError={() => {
          void saveCheckpoint("paused").catch(() => undefined);
          setError("Connection paused. Your payment progress is saved and will resume when you reconnect.");
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webLoading}>
            <ActivityIndicator size="large" color={COLORS.green} />
          </View>
        )}
      />

      {(isChecking || error) && (
        <View style={styles.statusBar}>
          {isChecking ? <ActivityIndicator size="small" color={COLORS.green} /> : <Ionicons name="alert-circle-outline" size={20} color="#963A31" />}
          <Text style={[styles.statusText, error && styles.errorStatusText]}>
            {isChecking ? "Verifying the latest payment status…" : error}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.cream },
  header: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: "#DDE3DF" },
  closeButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E8EDE9", marginRight: 12 },
  headerCopy: { flex: 1 },
  headerTitle: { color: COLORS.ink, fontSize: 16, fontWeight: "900" },
  headerSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  webView: { flex: 1, backgroundColor: COLORS.white },
  webLoading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.white },
  statusBar: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 16, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: "#DDE3DF" },
  statusText: { flex: 1, color: COLORS.green, fontSize: 11, fontWeight: "700" },
  errorStatusText: { color: "#963A31" },
  centeredScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.cream, paddingHorizontal: 28 },
  loadingTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 28, marginTop: 20 },
  loadingCopy: { color: COLORS.muted, fontSize: 12, textAlign: "center", marginTop: 8 },
  resultScroll: { flex: 1, backgroundColor: COLORS.cream },
  resultScreen: { flexGrow: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.cream, paddingHorizontal: 27 },
  resultScreenCompact: { justifyContent: "flex-start" },
  resultIcon: { width: 105, height: 105, borderRadius: 35, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  resultIconCompact: { width: 82, height: 82, borderRadius: 28, marginBottom: 16 },
  resultIconPaid: { backgroundColor: COLORS.yellow },
  resultIconPending: { backgroundColor: "#E8EDE9" },
  resultIconFailed: { backgroundColor: "#E8C7C0" },
  eyebrow: { color: COLORS.orange, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  resultTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 30, textAlign: "center", marginTop: 8 },
  resultTitleCompact: { fontSize: 26 },
  resultCopy: { maxWidth: 330, color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 10 },
  orderCard: { width: "100%", maxWidth: 360, borderRadius: 22, backgroundColor: COLORS.green, alignItems: "center", padding: 18, marginVertical: 22 },
  orderLabel: { color: COLORS.white, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  orderTotal: { color: COLORS.yellow, fontSize: 23, fontWeight: "900", marginTop: 7 },
  errorText: { color: "#963A31", fontSize: 11, lineHeight: 16, textAlign: "center", marginBottom: 12 },
  primaryButton: { width: "100%", maxWidth: 360, minHeight: 35, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.green, paddingHorizontal: 18 },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: COLORS.white, fontSize: 12, fontWeight: "900" },
  secondaryButton: { paddingHorizontal: 20, paddingVertical: 15, marginTop: 8 },
  secondaryButtonText: { color: COLORS.green, fontSize: 11, fontWeight: "900" },
});
