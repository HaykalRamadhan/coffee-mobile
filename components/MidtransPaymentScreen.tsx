import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  paymentGateway,
  type OnlinePaymentStatus,
} from "../lib/payments";

const COLORS = {
  ink: "#153F32",
  cream: "#C9C7A7",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#EEEBCB",
};

const formatRupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

type MidtransPaymentScreenProps = {
  orderId: string;
  total: number;
  onBack: () => void;
  onPaymentUpdated: () => void;
};

export function MidtransPaymentScreen({
  orderId,
  total,
  onBack,
  onPaymentUpdated,
}: MidtransPaymentScreenProps) {
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<OnlinePaymentStatus>("pending");
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const wasBackgrounded = useRef(false);
  const syncInFlight = useRef<Promise<OnlinePaymentStatus | null> | null>(null);
  const closeAfterSync = useRef(false);

  const startPayment = async () => {
    setIsLoading(true);
    setError(null);
    setTransactionStatus(null);
    const result = await paymentGateway.createSession(orderId);
    if (result.error || !result.data) {
      setError(result.error ?? "The secure payment page could not be opened.");
      setIsLoading(false);
      return;
    }

    setPaymentStatus(result.data.paymentStatus);
    setPaymentUrl(result.data.paymentUrl);
    setIsLoading(false);
  };

  const synchronizePayment = async (closeWhenPending: boolean) => {
    closeAfterSync.current = closeAfterSync.current || closeWhenPending;
    if (syncInFlight.current) return syncInFlight.current;

    setIsChecking(true);
    setError(null);
    const request = (async () => {
      const result = await paymentGateway.synchronizeStatus(orderId);

      if (result.error || !result.data) {
        setError(result.error ?? "The latest payment status could not be checked.");
        return null;
      }

      setPaymentStatus(result.data.paymentStatus);
      setTransactionStatus(result.data.transactionStatus);
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
      if (state !== "active") {
        wasBackgrounded.current = true;
        return;
      }
      if (wasBackgrounded.current && paymentUrl) {
        wasBackgrounded.current = false;
        void synchronizePayment(false);
      }
    });
    return () => subscription.remove();
  }, [paymentUrl, isChecking]);

  const handleNavigation = (url: string) => {
    if (url.includes("/functions/v1/midtrans-finish") || url.startsWith("kopipow://payment/complete")) {
      void synchronizePayment(true);
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
      <View style={styles.centeredScreen}>
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
      <View style={styles.resultScreen}>
        <View style={[styles.resultIcon, isPaid ? styles.resultIconPaid : isPending ? styles.resultIconPending : styles.resultIconFailed]}>
          <Ionicons
            name={isPaid ? "checkmark" : isPending ? "time-outline" : "alert-outline"}
            size={50}
            color={COLORS.green}
          />
        </View>
        <Text style={styles.eyebrow}>{isPaid ? "PAYMENT CONFIRMED" : isPending ? "PAYMENT PENDING" : isCancelled ? "PAYMENT CANCELLED" : "PAYMENT NOT COMPLETED"}</Text>
        <Text style={styles.resultTitle}>{isPaid ? "Your power-up is paid!" : isPending ? "We’re waiting for confirmation." : isCancelled ? "No charge was made." : "Let’s try that payment again."}</Text>
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
          <Pressable style={styles.primaryButton} onPress={() => { void startPayment(); }}>
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
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
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
        onError={() => setError("The Midtrans payment page lost its connection. You can retry safely.")}
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
  header: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: "#D4D0AE" },
  closeButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#D9D6B5", marginRight: 12 },
  headerCopy: { flex: 1 },
  headerTitle: { color: COLORS.ink, fontSize: 16, fontWeight: "900" },
  headerSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  webView: { flex: 1, backgroundColor: COLORS.white },
  webLoading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.white },
  statusBar: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 16, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: "#D4D0AE" },
  statusText: { flex: 1, color: COLORS.green, fontSize: 11, fontWeight: "700" },
  errorStatusText: { color: "#963A31" },
  centeredScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.cream, paddingHorizontal: 28 },
  loadingTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 28, fontWeight: "900", marginTop: 20 },
  loadingCopy: { color: COLORS.muted, fontSize: 12, textAlign: "center", marginTop: 8 },
  resultScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.cream, paddingHorizontal: 27 },
  resultIcon: { width: 105, height: 105, borderRadius: 35, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  resultIconPaid: { backgroundColor: COLORS.yellow },
  resultIconPending: { backgroundColor: "#D9D6B5" },
  resultIconFailed: { backgroundColor: "#E8C7C0" },
  eyebrow: { color: COLORS.orange, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  resultTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 30, fontWeight: "900", textAlign: "center", marginTop: 8 },
  resultCopy: { maxWidth: 330, color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 10 },
  orderCard: { width: "100%", maxWidth: 360, borderRadius: 22, backgroundColor: COLORS.green, alignItems: "center", padding: 18, marginVertical: 22 },
  orderLabel: { color: COLORS.white, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  orderTotal: { color: COLORS.yellow, fontSize: 23, fontWeight: "900", marginTop: 7 },
  errorText: { color: "#963A31", fontSize: 11, lineHeight: 16, textAlign: "center", marginBottom: 12 },
  primaryButton: { width: "100%", maxWidth: 360, minHeight: 56, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.green, paddingHorizontal: 18 },
  primaryButtonText: { color: COLORS.white, fontSize: 12, fontWeight: "900" },
  secondaryButton: { paddingHorizontal: 20, paddingVertical: 15, marginTop: 8 },
  secondaryButtonText: { color: COLORS.green, fontSize: 11, fontWeight: "900" },
});
