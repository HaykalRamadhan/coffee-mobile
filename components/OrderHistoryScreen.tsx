import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isActiveOrder, orderStatusLabel, type AccountOrder, type OrderStatus } from "../lib/orders";
import { getOrderItemDisplayDetails } from "../lib/orderDetails";
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

const statusColors: Record<OrderStatus, { background: string; foreground: string }> = {
  pending: { background: "#E5C85A", foreground: COLORS.green },
  confirmed: { background: "#BFD1B7", foreground: COLORS.green },
  preparing: { background: "#E6B178", foreground: "#6D361D" },
  ready: { background: COLORS.green, foreground: COLORS.white },
  completed: { background: "#E6EAE7", foreground: COLORS.muted },
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

type OrderHistoryScreenProps = {
  error: string | null;
  isLoading: boolean;
  orders: AccountOrder[];
  onBack: () => void;
  onRefresh: () => void;
  onBrowseMenu: () => void;
  onContinuePayment: (order: AccountOrder) => void;
};

type OrderHistoryCategory = "all" | "active" | "completed" | "cancelled";

const orderCategories: Array<{ id: OrderHistoryCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const categoryEmptyCopy: Record<Exclude<OrderHistoryCategory, "all">, { title: string; copy: string }> = {
  active: { title: "No active orders", copy: "Your next order will appear here while it is being prepared." },
  completed: { title: "No completed orders", copy: "Finished pickups will be collected here." },
  cancelled: { title: "No cancelled orders", copy: "Good news—there are no cancelled orders to show." },
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
  const insets = useSafeAreaInsets();
  const responsiveLayout = useResponsiveLayout();
  const [showFloatingBack, setShowFloatingBack] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(() => new Set());
  const [selectedCategory, setSelectedCategory] = useState<OrderHistoryCategory>("all");

  const categoryCounts = useMemo<Record<OrderHistoryCategory, number>>(() => ({
    all: orders.length,
    active: orders.filter(isActiveOrder).length,
    completed: orders.filter((order) => order.status === "completed").length,
    cancelled: orders.filter((order) => order.status === "cancelled").length,
  }), [orders]);

  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (selectedCategory === "active") return isActiveOrder(order);
    if (selectedCategory === "completed") return order.status === "completed";
    if (selectedCategory === "cancelled") return order.status === "cancelled";
    return true;
  }), [orders, selectedCategory]);

  const toggleOrderDetails = (orderId: string) => {
    setExpandedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            alignSelf: "center",
            maxWidth: responsiveLayout.contentMaxWidth,
            paddingHorizontal: responsiveLayout.gutter,
            width: "100%",
          },
          { paddingTop: 18 + insets.top, paddingBottom: 52 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => {
          const shouldShow = nativeEvent.contentOffset.y > 72;
          if (shouldShow !== showFloatingBack) setShowFloatingBack(shouldShow);
        }}
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
        <Pressable style={[styles.backButton, responsiveLayout.isCompact && styles.backButtonNarrow]} onPress={onBack} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={28} color={COLORS.green} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>YOUR KOPIPOW JOURNEY</Text>
          <Text style={[styles.title, responsiveLayout.isCompact && styles.titleNarrow]}>Order History!</Text>
        </View>
      </View>

      <Text style={styles.intro}>Track active pickup orders and revisit everything you have powered up with.</Text>

      {orders.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryList}
        >
          {orderCategories.map((category) => {
            const isSelected = selectedCategory === category.id;
            return (
              <Pressable
                key={category.id}
                style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                onPress={() => setSelectedCategory(category.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${category.label} orders, ${categoryCounts[category.id]}`}
              >
                <Text style={[styles.categoryLabel, isSelected && styles.categoryLabelSelected]}>{category.label}</Text>
                <View style={[styles.categoryCount, isSelected && styles.categoryCountSelected]}>
                  <Text style={[styles.categoryCountText, isSelected && styles.categoryCountTextSelected]}>{categoryCounts[category.id]}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

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
      ) : filteredOrders.length === 0 && selectedCategory !== "all" ? (
        <View style={styles.categoryEmptyCard}>
          <View style={styles.categoryEmptyIcon}><Ionicons name="file-tray-outline" size={28} color={COLORS.green} /></View>
          <View style={styles.categoryEmptyCopy}>
            <Text style={styles.categoryEmptyTitle}>{categoryEmptyCopy[selectedCategory].title}</Text>
            <Text style={styles.categoryEmptyText}>{categoryEmptyCopy[selectedCategory].copy}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.orderList}>
          {filteredOrders.map((order) => {
            const statusColor = statusColors[order.status];
            const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
            const canContinuePayment = order.status !== "cancelled"
              && order.paymentMethod === "midtrans_snap"
              && ["pending", "failed", "expired"].includes(order.paymentStatus);
            const statusLabel = order.paymentMethod === "midtrans_snap" && order.paymentStatus === "pending"
              ? "Payment pending"
              : orderStatusLabel[order.status];
            const isExpanded = expandedOrderIds.has(order.id);
            const firstItemName = order.items[0]?.productName ?? "Order details";

            return (
              <Pressable
                key={order.id}
                style={({ pressed }) => [styles.orderCard, responsiveLayout.isCompact && styles.orderCardNarrow, pressed && styles.orderCardPressed]}
                onPress={() => toggleOrderDetails(order.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                accessibilityLabel={`${isExpanded ? "Hide" : "Show"} details for order ${order.id.slice(0, 8).toUpperCase()}`}
              >
                <View style={[styles.orderTopRow, responsiveLayout.isCompact && styles.orderTopRowNarrow]}>
                  <View>
                    <Text style={styles.orderCodeLabel}>ORDER #{order.id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={styles.orderDate}>{formatOrderDate(order.createdAt)}</Text>
                  </View>
                  <View style={[styles.orderTopActions, responsiveLayout.isCompact && styles.orderTopActionsNarrow]}>
                    <View style={[styles.statusPill, { backgroundColor: statusColor.background }]}>
                      <Text style={[styles.statusText, { color: statusColor.foreground }]}>{statusLabel}</Text>
                    </View>
                    <View style={styles.expandButton}>
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={22} color={COLORS.green} />
                    </View>
                  </View>
                </View>

                {!isExpanded && (
                  <View style={styles.collapsedSummary}>
                    <View style={styles.collapsedSummaryCopy}>
                      <Text style={styles.collapsedItemName} numberOfLines={1}>{firstItemName}</Text>
                      <Text style={styles.collapsedItemCount}>
                        {itemCount} {itemCount === 1 ? "item" : "items"} · Tap to view details
                      </Text>
                    </View>
                    <Text style={styles.collapsedTotal}>{formatRupiah(order.total)}</Text>
                  </View>
                )}

                {isExpanded && <>
                <View style={styles.itemList}>
                  {order.items.map((item) => {
                    const details = getOrderItemDisplayDetails(item.customization);
                    return (
                      <View key={item.id} style={styles.itemRow}>
                        <Text style={[styles.itemQuantity, responsiveLayout.isCompact && styles.itemQuantityNarrow]}>{item.quantity}×</Text>
                        <View style={styles.itemCopy}>
                          <Text style={styles.itemName}>{item.productName}</Text>
                          {details.primary && <Text style={styles.itemDetail}>{details.primary}</Text>}
                          {details.secondary && <Text style={styles.itemDetail}>{details.secondary}</Text>}
                          {details.extras.length > 0 && (
                            <>
                              <Text style={styles.itemExtrasLabel}>Extras:</Text>
                              {details.extras.map((extra, index) => (
                                <Text key={`${item.id}-extra-${index}`} style={styles.itemExtra}>- {extra}</Text>
                              ))}
                            </>
                          )}
                          {item.note.length > 0 && <Text style={styles.itemNote}>“{item.note}”</Text>}
                        </View>
                        <Text style={[styles.itemPrice, responsiveLayout.isCompact && styles.itemPriceNarrow]}>{formatRupiah(item.unitPrice * item.quantity)}</Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.divider} />
                <View style={[styles.orderBottomRow, responsiveLayout.isCompact && styles.orderBottomRowNarrow]}>
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
                  <Pressable
                    style={styles.continuePaymentButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      onContinuePayment(order);
                    }}
                  >
                    <Ionicons name="card-outline" size={19} color={COLORS.white} />
                    <Text style={styles.continuePaymentText}>Continue payment</Text>
                  </Pressable>
                )}
                </>}
              </Pressable>
            );
          })}
        </View>
      )}
      </ScrollView>

      {showFloatingBack && (
        <Pressable
          style={[styles.floatingBackButton, { left: responsiveLayout.gutter, top: 18 + insets.top }]}
          onPress={onBack}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={25} color={COLORS.green} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.cream },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 52 },
  header: { flexDirection: "row", alignItems: "center" },
  backButton: { width: 56, height: 56, borderRadius: 19, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", marginRight: 16 },
  backButtonNarrow: { width: 46, height: 46, borderRadius: 16, marginRight: 10 },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.orange, fontSize: 15, fontWeight: "900", letterSpacing: 1.45 },
  title: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 38, lineHeight: 43, marginTop: 3 },
  titleNarrow: { fontSize: 31, lineHeight: 36 },
  intro: { color: COLORS.muted, fontSize: 16.5, lineHeight: 25, marginTop: 24, marginBottom: 24, maxWidth: 620 },
  categoryScroll: { marginBottom: 20, marginHorizontal: -2 },
  categoryList: { gap: 9, paddingHorizontal: 2 },
  categoryChip: { minHeight: 44, borderRadius: 16, paddingLeft: 16, paddingRight: 9, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: COLORS.white, borderWidth: 1, borderColor: "#DDE4DF" },
  categoryChipSelected: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  categoryLabel: { color: COLORS.muted, fontSize: 12.5, fontWeight: "800" },
  categoryLabelSelected: { color: COLORS.white },
  categoryCount: { minWidth: 27, height: 27, borderRadius: 10, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF1EF" },
  categoryCountSelected: { backgroundColor: COLORS.yellow },
  categoryCountText: { color: COLORS.muted, fontSize: 11, fontWeight: "900" },
  categoryCountTextSelected: { color: COLORS.green },
  loadingCard: { minHeight: 270, borderRadius: 27, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { color: COLORS.muted, fontSize: 13, fontWeight: "700" },
  errorCard: { minHeight: 230, borderRadius: 25, backgroundColor: "#EBCBC4", alignItems: "center", justifyContent: "center", padding: 24 },
  errorTitle: { color: "#963A31", fontSize: 18, fontWeight: "900", marginTop: 14 },
  errorText: { color: "#963A31", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 8 },
  retryButton: { backgroundColor: "#963A31", borderRadius: 16, paddingHorizontal: 19, paddingVertical: 12, marginTop: 18 },
  retryText: { color: COLORS.white, fontSize: 11.5, fontWeight: "900" },
  emptyCard: { minHeight: 300, borderRadius: 27, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", padding: 28 },
  emptyIcon: { width: 88, height: 88, borderRadius: 29, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 28 },
  emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 19, textAlign: "center", maxWidth: 320, marginTop: 9 },
  browseButton: { backgroundColor: COLORS.green, borderRadius: 18, paddingHorizontal: 21, paddingVertical: 14, marginTop: 20 },
  browseText: { color: COLORS.white, fontSize: 11.5, fontWeight: "900" },
  categoryEmptyCard: { minHeight: 130, borderRadius: 22, padding: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: "#DDE4DF", flexDirection: "row", alignItems: "center", gap: 14 },
  categoryEmptyIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#F3E8B9" },
  categoryEmptyCopy: { flex: 1 },
  categoryEmptyTitle: { color: COLORS.ink, fontSize: 16, fontWeight: "900" },
  categoryEmptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  orderList: { gap: 16 },
  orderCard: { backgroundColor: COLORS.white, borderRadius: 27, padding: 22, borderWidth: 1, borderColor: "#DDE4DF" },
  orderCardNarrow: { borderRadius: 22, padding: 16 },
  orderCardPressed: { opacity: 0.92 },
  orderTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  orderTopRowNarrow: { flexDirection: "column", gap: 10 },
  orderTopActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  orderTopActionsNarrow: { width: "100%", justifyContent: "space-between" },
  orderCodeLabel: { color: COLORS.ink, fontSize: 16, fontWeight: "900", letterSpacing: 0.6 },
  orderDate: { color: COLORS.muted, fontSize: 13.5, marginTop: 7 },
  statusPill: { borderRadius: 17, paddingHorizontal: 15, paddingVertical: 11 },
  statusText: { fontSize: 13, fontWeight: "900" },
  expandButton: { width: 38, height: 38, borderRadius: 14, backgroundColor: "#EEF1EF", alignItems: "center", justifyContent: "center" },
  collapsedSummary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 21, paddingTop: 17, borderTopWidth: 1, borderTopColor: "#E1E6E3" },
  collapsedSummaryCopy: { flex: 1 },
  collapsedItemName: { color: COLORS.ink, fontSize: 16, fontWeight: "800" },
  collapsedItemCount: { color: COLORS.muted, fontSize: 12.5, marginTop: 5 },
  collapsedTotal: { color: COLORS.orange, fontSize: 18, fontWeight: "900" },
  itemList: { marginTop: 21 },
  itemRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12 },
  itemQuantity: { width: 40, color: COLORS.orange, fontSize: 16, fontWeight: "900" },
  itemQuantityNarrow: { width: 30, fontSize: 14 },
  itemCopy: { flex: 1 },
  itemName: { color: COLORS.ink, fontSize: 17, fontWeight: "800" },
  itemDetail: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  itemExtrasLabel: { color: COLORS.orange, fontSize: 13.5, lineHeight: 20, fontWeight: "900", marginTop: 7 },
  itemExtra: { color: COLORS.orange, fontSize: 13.5, lineHeight: 20, fontWeight: "800", marginTop: 1 },
  itemNote: { color: COLORS.orange, fontSize: 13, lineHeight: 19, fontStyle: "italic", marginTop: 5 },
  itemPrice: { color: COLORS.ink, fontSize: 15, fontWeight: "800", marginLeft: 12 },
  itemPriceNarrow: { fontSize: 12, marginLeft: 6 },
  divider: { height: 1, backgroundColor: "#E1E6E3", marginVertical: 17 },
  orderBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderBottomRowNarrow: { alignItems: "flex-end", gap: 10 },
  pickupRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  pickupText: { color: COLORS.muted, fontSize: 14, fontWeight: "700" },
  totalLabel: { color: COLORS.muted, fontSize: 12, fontWeight: "900", textAlign: "right", letterSpacing: 0.95 },
  totalValue: { color: COLORS.orange, fontSize: 22, fontWeight: "900", marginTop: 4 },
  paymentText: { color: COLORS.muted, fontSize: 12.5, textAlign: "right", marginTop: 7 },
  continuePaymentButton: { minHeight: 50, borderRadius: 17, backgroundColor: COLORS.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 16 },
  continuePaymentText: { color: COLORS.white, fontSize: 12, fontWeight: "900" },
  floatingBackButton: { position: "absolute", top: 18, left: 20, zIndex: 10, elevation: 8, width: 50, height: 50, borderRadius: 18, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DDE4DF", shadowColor: "#122D24", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
});
