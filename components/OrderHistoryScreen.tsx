import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { orderStatusLabel, type AccountOrder, type OrderStatus } from "../lib/orders";

const COLORS = {
  ink: "#153F32",
  cream: "#C9C7A7",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#EEEBCB",
};

const statusColors: Record<OrderStatus, { background: string; foreground: string }> = {
  pending: { background: "#E5C85A", foreground: COLORS.green },
  confirmed: { background: "#BFD1B7", foreground: COLORS.green },
  preparing: { background: "#E6B178", foreground: "#6D361D" },
  ready: { background: COLORS.green, foreground: COLORS.white },
  completed: { background: "#D5D3B7", foreground: COLORS.muted },
  cancelled: { background: "#E8C7C0", foreground: "#963A31" },
};

const formatRupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

const formatOrderDate = (createdAt: string) => new Date(createdAt).toLocaleString("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const getCustomizationLines = (customization: Record<string, unknown> | null) => {
  if (!customization) return [];

  const size = typeof customization.size === "string" ? customization.size : null;
  const temperature = typeof customization.temperature === "string" ? customization.temperature : null;
  const sugar = typeof customization.sugar === "string" ? `${customization.sugar} sugar` : null;
  const milk = typeof customization.milk === "string" ? customization.milk : null;
  const ice = typeof customization.ice === "string" ? customization.ice : null;
  const extras = Array.isArray(customization.extras)
    ? customization.extras.filter((value): value is string => typeof value === "string")
    : [];

  const lines = [
    [size, temperature, sugar].filter(Boolean).join(" · "),
    [milk, ice].filter(Boolean).join(" · "),
  ].filter(Boolean);

  if (extras.length > 0) lines.push(`+ ${extras.join(", ")}`);
  return lines;
};

type OrderHistoryScreenProps = {
  error: string | null;
  isLoading: boolean;
  orders: AccountOrder[];
  onBack: () => void;
  onRefresh: () => void;
  onBrowseMenu: () => void;
  onContinuePayment: (order: AccountOrder) => void;
};

export function OrderHistoryScreen({
  error,
  isLoading,
  orders,
  onBack,
  onRefresh,
  onBrowseMenu,
  onContinuePayment,
}: OrderHistoryScreenProps) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={(
        <RefreshControl
          refreshing={isLoading}
          onRefresh={onRefresh}
          colors={[COLORS.green]}
          progressBackgroundColor={COLORS.white}
          tintColor={COLORS.green}
        />
      )}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={28} color={COLORS.green} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>YOUR KOPIPOW JOURNEY</Text>
          <Text style={styles.title}>Order History!</Text>
        </View>
      </View>

      <Text style={styles.intro}>Track active pickup orders and revisit everything you have powered up with.</Text>

      {isLoading && orders.length === 0 ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={COLORS.green} />
          <Text style={styles.loadingText}>Loading your orders…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Ionicons name="cloud-offline-outline" size={38} color="#963A31" />
          <Text style={styles.errorTitle}>Orders could not be loaded</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={onRefresh}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Ionicons name="receipt-outline" size={44} color={COLORS.green} /></View>
          <Text style={styles.emptyTitle}>No orders yet.</Text>
          <Text style={styles.emptyText}>Your completed and active orders will appear here after checkout.</Text>
          <Pressable style={styles.browseButton} onPress={onBrowseMenu}><Text style={styles.browseText}>Browse the menu</Text></Pressable>
        </View>
      ) : (
        <View style={styles.orderList}>
          {orders.map((order) => {
            const statusColor = statusColors[order.status];
            const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
            const canContinuePayment = order.status !== "cancelled"
              && order.paymentMethod === "midtrans_snap"
              && ["pending", "failed", "expired"].includes(order.paymentStatus);
            const statusLabel = order.paymentMethod === "midtrans_snap" && order.paymentStatus === "pending"
              ? "Payment pending"
              : orderStatusLabel[order.status];

            return (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderTopRow}>
                  <View>
                    <Text style={styles.orderCodeLabel}>ORDER #{order.id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={styles.orderDate}>{formatOrderDate(order.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: statusColor.background }]}>
                    <Text style={[styles.statusText, { color: statusColor.foreground }]}>{statusLabel}</Text>
                  </View>
                </View>

                <View style={styles.itemList}>
                  {order.items.map((item) => {
                    const customizationLines = getCustomizationLines(item.customization);
                    return (
                      <View key={item.id} style={styles.itemRow}>
                        <Text style={styles.itemQuantity}>{item.quantity}×</Text>
                        <View style={styles.itemCopy}>
                          <Text style={styles.itemName}>{item.productName}</Text>
                          {customizationLines.map((line, index) => (
                            <Text key={`${item.id}-customization-${index}`} style={index === customizationLines.length - 1 && line.startsWith("+") ? styles.itemExtra : styles.itemDetail}>
                              {line}
                            </Text>
                          ))}
                          {item.note.length > 0 && <Text style={styles.itemNote}>“{item.note}”</Text>}
                        </View>
                        <Text style={styles.itemPrice}>{formatRupiah(item.unitPrice * item.quantity)}</Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.divider} />
                <View style={styles.orderBottomRow}>
                  <View style={styles.pickupRow}>
                    <Ionicons name="storefront-outline" size={21} color={COLORS.green} />
                    <Text style={styles.pickupText}>Pickup · {itemCount} {itemCount === 1 ? "item" : "items"}</Text>
                  </View>
                  <View>
                    <Text style={styles.totalLabel}>TOTAL</Text>
                    <Text style={styles.totalValue}>{formatRupiah(order.total)}</Text>
                  </View>
                </View>
                <Text style={styles.paymentText}>
                  {order.paymentMethod === "pay_at_counter"
                    ? order.paymentStatus === "paid" ? "Paid at the counter" : "Pay at the counter"
                    : order.paymentStatus === "paid"
                      ? "Paid securely with Midtrans"
                      : order.paymentStatus === "refunded"
                        ? "Payment refunded"
                        : "Online payment not completed"}
                </Text>
                {canContinuePayment && (
                  <Pressable style={styles.continuePaymentButton} onPress={() => onContinuePayment(order)}>
                    <Ionicons name="card-outline" size={19} color={COLORS.white} />
                    <Text style={styles.continuePaymentText}>Continue payment</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.cream },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 52 },
  header: { flexDirection: "row", alignItems: "center" },
  backButton: { width: 56, height: 56, borderRadius: 19, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", marginRight: 16 },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.orange, fontSize: 15, fontWeight: "900", letterSpacing: 1.45 },
  title: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontWeight: "900", fontSize: 38, lineHeight: 43, marginTop: 3 },
  intro: { color: COLORS.muted, fontSize: 16.5, lineHeight: 25, marginTop: 24, marginBottom: 24, maxWidth: 620 },
  loadingCard: { minHeight: 270, borderRadius: 27, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { color: COLORS.muted, fontSize: 13, fontWeight: "700" },
  errorCard: { minHeight: 230, borderRadius: 25, backgroundColor: "#EBCBC4", alignItems: "center", justifyContent: "center", padding: 24 },
  errorTitle: { color: "#963A31", fontSize: 18, fontWeight: "900", marginTop: 14 },
  errorText: { color: "#963A31", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 8 },
  retryButton: { backgroundColor: "#963A31", borderRadius: 16, paddingHorizontal: 19, paddingVertical: 12, marginTop: 18 },
  retryText: { color: COLORS.white, fontSize: 11.5, fontWeight: "900" },
  emptyCard: { minHeight: 300, borderRadius: 27, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", padding: 28 },
  emptyIcon: { width: 88, height: 88, borderRadius: 29, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 28, fontWeight: "900" },
  emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 19, textAlign: "center", maxWidth: 320, marginTop: 9 },
  browseButton: { backgroundColor: COLORS.green, borderRadius: 18, paddingHorizontal: 21, paddingVertical: 14, marginTop: 20 },
  browseText: { color: COLORS.white, fontSize: 11.5, fontWeight: "900" },
  orderList: { gap: 16 },
  orderCard: { backgroundColor: COLORS.white, borderRadius: 27, padding: 22, borderWidth: 1, borderColor: "#DCD7B7" },
  orderTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  orderCodeLabel: { color: COLORS.ink, fontSize: 16, fontWeight: "900", letterSpacing: 0.6 },
  orderDate: { color: COLORS.muted, fontSize: 13.5, marginTop: 7 },
  statusPill: { borderRadius: 17, paddingHorizontal: 15, paddingVertical: 11 },
  statusText: { fontSize: 13, fontWeight: "900" },
  itemList: { marginTop: 21 },
  itemRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12 },
  itemQuantity: { width: 40, color: COLORS.orange, fontSize: 16, fontWeight: "900" },
  itemCopy: { flex: 1 },
  itemName: { color: COLORS.ink, fontSize: 17, fontWeight: "800" },
  itemDetail: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  itemExtra: { color: COLORS.orange, fontSize: 13.5, lineHeight: 20, fontWeight: "800", marginTop: 4 },
  itemNote: { color: COLORS.orange, fontSize: 13, lineHeight: 19, fontStyle: "italic", marginTop: 5 },
  itemPrice: { color: COLORS.ink, fontSize: 15, fontWeight: "800", marginLeft: 12 },
  divider: { height: 1, backgroundColor: "#D7D3B2", marginVertical: 17 },
  orderBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickupRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  pickupText: { color: COLORS.muted, fontSize: 14, fontWeight: "700" },
  totalLabel: { color: COLORS.muted, fontSize: 12, fontWeight: "900", textAlign: "right", letterSpacing: 0.95 },
  totalValue: { color: COLORS.orange, fontSize: 22, fontWeight: "900", marginTop: 4 },
  paymentText: { color: COLORS.muted, fontSize: 12.5, textAlign: "right", marginTop: 7 },
  continuePaymentButton: { minHeight: 50, borderRadius: 17, backgroundColor: COLORS.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 16 },
  continuePaymentText: { color: COLORS.white, fontSize: 12, fontWeight: "900" },
});
