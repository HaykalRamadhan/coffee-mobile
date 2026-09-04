import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AppRole } from "../../lib/access";
import {
  advanceOrder,
  loadOperationsData,
  markCounterPaymentReceived,
  setProductAvailability,
  type OperationsOrder,
  type OperationsProduct,
  type OperationsSummary,
} from "../../lib/operations";
import { orderStatusLabel, subscribeToOrderChanges, type OrderStatus } from "../../lib/orders";
import { useResponsiveLayout } from "../../lib/responsive";
import { Text } from "../../lib/typography";
import { ReportsPanel } from "./ReportsPanel";
import { WalkInPosPanel } from "./WalkInPosPanel";
import {
  BranchesCrudPanel,
  ProductsCrudPanel,
  PromotionsCrudPanel,
  StaffCrudPanel,
} from "./ManagementPanels";

const COLORS = {
  background: "#F3F4F3",
  card: "#FFFFFF",
  divider: "#DDE3DF",
  ink: "#153F32",
  muted: "#607067",
  yellow: "#E2B52F",
  danger: "#A9453B",
};

type WorkspaceTab = "overview" | "orders" | "pos" | "stock" | "branches" | "staff" | "reports" | "promotions";
type TabDefinition = { id: WorkspaceTab; label: string; icon: keyof typeof Ionicons.glyphMap };

const staffTabs: TabDefinition[] = [
  { id: "pos", label: "Walk-in Order", icon: "calculator-outline" },
  { id: "orders", label: "Online orders", icon: "receipt-outline" },
  { id: "stock", label: "Stock", icon: "cube-outline" },
];

const adminTabs: TabDefinition[] = [
  { id: "overview", label: "Overview", icon: "grid-outline" },
  { id: "pos", label: "Walk-in Order", icon: "calculator-outline" },
  { id: "orders", label: "Orders", icon: "receipt-outline" },
  { id: "branches", label: "Branches", icon: "storefront-outline" },
  { id: "stock", label: "Menu & stock", icon: "cafe-outline" },
  { id: "staff", label: "Staff", icon: "people-outline" },
  { id: "reports", label: "Reports", icon: "bar-chart-outline" },
  { id: "promotions", label: "Promotions", icon: "pricetag-outline" },
];

const formatRupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
const nextOrderAction: Partial<Record<OrderStatus, { label: string; status: OrderStatus }>> = {
  pending: { label: "Accept order", status: "confirmed" },
  confirmed: { label: "Start preparing", status: "preparing" },
  preparing: { label: "Mark ready", status: "ready" },
  ready: { label: "Complete pickup", status: "completed" },
};

const emptySummary: OperationsSummary = {
  todayRevenue: 0,
  todayPaidOrders: 0,
  totalRevenue: 0,
  totalPaidOrders: 0,
  totalOrders: 0,
  activeOrders: 0,
  outstandingCounterAmount: 0,
  outstandingCounterOrders: 0,
};

function MetricCard({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}><Ionicons name={icon} size={20} color={COLORS.ink} /></View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function EmptySection({ icon, title, copy }: { icon: keyof typeof Ionicons.glyphMap; title: string; copy: string }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={28} color={COLORS.ink} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  );
}

export function OperationsWorkspace({
  role,
  displayName,
  branchId,
  openOrdersSignal,
  onSignOut,
}: {
  role: Exclude<AppRole, "customer">;
  displayName: string;
  branchId: string | null;
  openOrdersSignal?: number;
  onSignOut: () => Promise<{ error: string | null }>;
}) {
  const layout = useResponsiveLayout();
  const compact = layout.width < 760;
  const tabs = role === "admin" ? adminTabs : staffTabs;
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(role === "admin" ? "overview" : "orders");
  const [orders, setOrders] = useState<OperationsOrder[]>([]);
  const [products, setProducts] = useState<OperationsProduct[]>([]);
  const [summary, setSummary] = useState<OperationsSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | number | null>(null);

  const refresh = useCallback(async (mode: "initial" | "pull" | "silent" = "initial") => {
    if (mode === "pull") setRefreshing(true);
    if (mode === "initial") setLoading(true);
    const result = await loadOperationsData();
    setOrders(result.orders);
    setProducts(result.products);
    setSummary(result.summary);
    setError(result.error);
    if (mode === "initial") setLoading(false);
    if (mode === "pull") setRefreshing(false);
  }, []);

  useEffect(() => { void refresh("initial"); }, [refresh]);

  useEffect(() => {
    if (!openOrdersSignal) return;
    setActiveTab("orders");
    void refresh("silent");
  }, [openOrdersSignal, refresh]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refresh("silent");
      }, 150);
    };

    const unsubscribe = subscribeToOrderChanges({
      channelKey: `operations-${role}-${branchId ?? "all"}`,
      onChange: (change) => {
        if (change.orderId && change.eventType === "UPDATE") {
          setOrders((current) => current.map((order) => order.id === change.orderId
            ? {
              ...order,
              status: change.status ?? order.status,
              paymentStatus: change.paymentStatus ?? order.paymentStatus,
            }
            : order));
        }
        scheduleRefresh();
      },
      onSubscribed: scheduleRefresh,
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [branchId, refresh, role]);

  const activeOrders = useMemo(
    () => orders.filter((order) => !["completed", "cancelled"].includes(order.status)),
    [orders],
  );
  const ordersNeedingSettlement = useMemo(
    () => orders.filter((order) => order.paymentMethod === "pay_at_counter"
      && order.paymentStatus !== "paid"
      && order.status !== "cancelled"),
    [orders],
  );
  const orderBoard = useMemo(() => orders.filter((order) => (
    !["completed", "cancelled"].includes(order.status)
    || (order.paymentMethod === "pay_at_counter" && order.paymentStatus !== "paid" && order.status !== "cancelled")
  )), [orders]);

  const changeOrderStatus = async (order: OperationsOrder, status: OrderStatus) => {
    setBusyId(order.id);
    setError(null);
    const result = await advanceOrder(order.id, status);
    if (result.error) setError(result.error);
    else await refresh("silent");
    setBusyId(null);
  };

  const recordCounterPayment = (order: OperationsOrder) => {
    Alert.alert(
      "Confirm payment received",
      `${formatRupiah(order.total)} for order #${order.id.slice(0, 8).toUpperCase()} will be added to revenue.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record payment",
          onPress: () => {
            void (async () => {
              setBusyId(order.id);
              setError(null);
              const result = await markCounterPaymentReceived(order.id);
              if (result.error) setError(result.error);
              else await refresh("silent");
              setBusyId(null);
            })();
          },
        },
      ],
    );
  };

  const toggleProduct = async (product: OperationsProduct) => {
    setBusyId(product.id);
    setError(null);
    const result = await setProductAvailability(product.id, !product.active);
    if (result.error) setError(result.error);
    else setProducts((current) => current.map((item) => item.id === product.id ? { ...item, active: !item.active } : item));
    setBusyId(null);
  };

  const renderOverview = () => (
    <>
      <View style={styles.metricGrid}>
        <MetricCard label={`Today's revenue · ${summary.todayPaidOrders} paid`} value={formatRupiah(summary.todayRevenue)} icon="wallet-outline" />
        <MetricCard label="Total recorded revenue" value={formatRupiah(summary.totalRevenue)} icon="trending-up-outline" />
        <MetricCard label="Total orders" value={String(summary.totalOrders)} icon="receipt-outline" />
        <MetricCard label="Active orders" value={String(summary.activeOrders)} icon="flash-outline" />
      </View>
      {summary.outstandingCounterOrders > 0 && (
        <View style={styles.paymentWarning}>
          <Ionicons name="cash-outline" size={21} color={COLORS.danger} />
          <View style={styles.paymentWarningCopy}>
            <Text style={styles.paymentWarningTitle}>{summary.outstandingCounterOrders} counter payment{summary.outstandingCounterOrders === 1 ? "" : "s"} need recording</Text>
            <Text style={styles.paymentWarningText}>{formatRupiah(summary.outstandingCounterAmount)} is not included in revenue yet.</Text>
          </View>
          <Pressable onPress={() => setActiveTab("orders")}><Text style={styles.linkText}>Review</Text></Pressable>
        </View>
      )}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeadingRow}>
          <View><Text style={styles.sectionTitle}>Recent global activity</Text><Text style={styles.sectionSubtitle}>Latest orders across accessible branches</Text></View>
          <Pressable onPress={() => setActiveTab("orders")}><Text style={styles.linkText}>View orders</Text></Pressable>
        </View>
        {orders.slice(0, 5).map((order) => <OrderRow key={order.id} order={order} busy={busyId === order.id} onChange={changeOrderStatus} onPayment={recordCounterPayment} />)}
      </View>
    </>
  );

  const renderOrders = () => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeadingRow}>
        <View><Text style={styles.sectionTitle}>Order & payment board</Text><Text style={styles.sectionSubtitle}>Record counter payments before completing each pickup</Text></View>
        <View style={styles.countPill}><Text style={styles.countPillText}>{activeOrders.length} active · {ordersNeedingSettlement.length} due</Text></View>
      </View>
      {orderBoard.length === 0
        ? <EmptySection icon="checkmark-circle-outline" title="The queue is clear" copy="New online orders will appear here automatically." />
        : orderBoard.map((order) => <OrderRow key={order.id} order={order} busy={busyId === order.id} onChange={changeOrderStatus} onPayment={recordCounterPayment} />)}
    </View>
  );

  const renderStock = () => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeadingRow}>
        <View><Text style={styles.sectionTitle}>Menu availability</Text><Text style={styles.sectionSubtitle}>Changes are reflected in the customer menu</Text></View>
      </View>
      {products.map((product) => (
        <View key={product.id} style={styles.productRow}>
          <View style={styles.productIcon}><Ionicons name="cafe-outline" size={20} color={COLORS.ink} /></View>
          <View style={styles.productCopy}><Text style={styles.productName}>{product.name}</Text><Text style={styles.productMeta}>{product.category} · {formatRupiah(product.basePrice)}</Text></View>
          {busyId === product.id
            ? <ActivityIndicator color={COLORS.ink} />
            : <Switch value={product.active} onValueChange={() => { void toggleProduct(product); }} trackColor={{ false: "#C7CCC9", true: "#BDD1C5" }} thumbColor={product.active ? COLORS.ink : "#FFFFFF"} />}
        </View>
      ))}
    </View>
  );

  const renderContent = () => {
    if (loading) return <View style={styles.loadingCard}><ActivityIndicator color={COLORS.ink} /><Text style={styles.loadingText}>Loading workspace…</Text></View>;
    if (activeTab === "overview") return renderOverview();
    if (activeTab === "reports") return <ReportsPanel compact={compact} channelKey={`${role}-${branchId ?? "all"}`} />;
    if (activeTab === "orders") return renderOrders();
    if (activeTab === "stock") return role === "admin"
      ? <ProductsCrudPanel onChanged={() => { void refresh("silent"); }} />
      : renderStock();
    if (activeTab === "pos") return <WalkInPosPanel products={products} compact={compact} onCreated={() => { void refresh("silent"); setActiveTab("orders"); }} />;
    if (activeTab === "branches") return <BranchesCrudPanel />;
    if (activeTab === "staff") return <StaffCrudPanel />;
    return <PromotionsCrudPanel />;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={[styles.shell, compact && styles.shellCompact]}>
        <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandBolt}>ϟ</Text></View>
            <View><Text style={styles.brandName}>Kopi POW!</Text><Text style={styles.brandMode}>{role === "admin" ? "ADMIN HQ" : "STAFF POS"}</Text></View>
          </View>
          <ScrollView horizontal={compact} showsHorizontalScrollIndicator={false} contentContainerStyle={compact ? styles.compactTabs : undefined}>
            {tabs.map((tab) => (
              <Pressable key={tab.id} style={[styles.navButton, compact && styles.navButtonCompact, activeTab === tab.id && styles.navButtonActive]} onPress={() => setActiveTab(tab.id)}>
                <Ionicons name={tab.icon} size={19} color={activeTab === tab.id ? COLORS.ink : COLORS.muted} />
                <Text style={[styles.navText, activeTab === tab.id && styles.navTextActive]} numberOfLines={1}>{tab.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {!compact && <Pressable style={styles.signOutButton} onPress={() => { void onSignOut(); }}><Ionicons name="log-out-outline" size={19} color={COLORS.danger} /><Text style={styles.signOutText}>Sign out</Text></Pressable>}
        </View>
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh("pull"); }} tintColor={COLORS.ink} />}>
          <View style={styles.pageHeader}>
            <View><Text style={styles.eyebrow}>{role === "admin" ? "KOPIPOW OPERATIONS" : "BRANCH WORKSPACE"}</Text><Text style={styles.pageTitle}>{tabs.find((tab) => tab.id === activeTab)?.label}</Text><Text style={styles.welcome}>Welcome, {displayName}{branchId ? ` · ${branchId.slice(0, 8)}` : ""}</Text></View>
            {compact && <Pressable style={styles.mobileSignOut} onPress={() => { void onSignOut(); }}><Ionicons name="log-out-outline" size={21} color={COLORS.danger} /></Pressable>}
          </View>
          {error && <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={20} color={COLORS.danger} /><Text style={styles.errorText}>{error}</Text></View>}
          {renderContent()}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function OrderRow({ order, busy, onChange, onPayment }: { order: OperationsOrder; busy: boolean; onChange: (order: OperationsOrder, status: OrderStatus) => void; onPayment: (order: OperationsOrder) => void }) {
  const action = nextOrderAction[order.status];
  const paymentDue = order.paymentMethod === "pay_at_counter" && order.paymentStatus !== "paid" && order.status !== "cancelled";
  const completionBlocked = action?.status === "completed" && order.paymentStatus !== "paid";
  return (
    <View style={styles.orderRow}>
      <View style={styles.orderMain}><Text style={styles.orderId}>#{order.id.slice(0, 8).toUpperCase()}</Text><Text style={styles.orderCustomer}>{order.customerName}</Text><Text style={styles.orderMeta}>{order.itemCount} items · {formatRupiah(order.total)} · {order.paymentMethod === "midtrans_snap" ? `Midtrans: ${order.paymentStatus}` : `Counter: ${order.paymentStatus === "paid" ? "paid" : "payment due"}`}</Text></View>
      <View style={styles.orderActions}>
        <View key={`status-${order.status}`} style={[styles.statusPill, order.status === "ready" && styles.statusPillReady]}>
          <Text style={styles.statusText} numberOfLines={1}>{orderStatusLabel[order.status]}</Text>
        </View>
        {busy ? <ActivityIndicator color={COLORS.ink} /> : paymentDue && <Pressable style={styles.paymentButton} onPress={() => onPayment(order)}><Ionicons name="cash-outline" size={15} color={COLORS.ink} /><Text style={styles.paymentButtonText}>Payment received</Text></Pressable>}
        {!busy && action && !completionBlocked && <Pressable style={styles.primaryButton} onPress={() => onChange(order, action.status)}><Text style={styles.primaryButtonText}>{action.label}</Text></Pressable>}
        {!busy && ["pending", "confirmed", "preparing"].includes(order.status) && <Pressable style={styles.rejectButton} onPress={() => onChange(order, "cancelled")}><Text style={styles.rejectText}>Cancel</Text></Pressable>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background }, shell: { flex: 1, flexDirection: "row" }, shellCompact: { flexDirection: "column" },
  sidebar: { width: 240, backgroundColor: COLORS.card, borderRightWidth: 1, borderRightColor: COLORS.divider, padding: 20 }, sidebarCompact: { width: "100%", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 26 }, brandMark: { width: 39, height: 39, borderRadius: 12, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center" }, brandBolt: { color: COLORS.ink, fontSize: 29, lineHeight: 32, fontWeight: "900" }, brandName: { color: COLORS.ink, fontSize: 18, fontWeight: "900", fontStyle: "italic" }, brandMode: { color: COLORS.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.4, marginTop: 2 },
  compactTabs: { gap: 7, paddingRight: 20 }, navButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, marginBottom: 7, flexDirection: "row", alignItems: "center", gap: 10 }, navButtonCompact: { minHeight: 38, marginBottom: 0, borderWidth: 1, borderColor: COLORS.divider }, navButtonActive: { backgroundColor: "#F3E8B9", borderColor: COLORS.yellow }, navText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" }, navTextActive: { color: COLORS.ink, fontWeight: "900" },
  signOutButton: { marginTop: "auto", flexDirection: "row", alignItems: "center", gap: 9, minHeight: 44, paddingHorizontal: 12 }, signOutText: { color: COLORS.danger, fontSize: 11, fontWeight: "800" },
  content: { flex: 1 }, contentContainer: { padding: 24, maxWidth: 1180, width: "100%", alignSelf: "center" }, pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }, eyebrow: { color: COLORS.yellow, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 }, pageTitle: { color: COLORS.ink, fontSize: 27, fontWeight: "900", marginTop: 4 }, welcome: { color: COLORS.muted, fontSize: 10, marginTop: 4 }, mobileSignOut: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.divider },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 }, metricCard: { flexGrow: 1, flexBasis: 190, minHeight: 135, backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.divider, padding: 17 }, metricIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: "#F3E8B9", alignItems: "center", justifyContent: "center", marginBottom: 16 }, metricLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "700" }, metricValue: { color: COLORS.ink, fontSize: 21, fontWeight: "900", marginTop: 5 },
  sectionCard: { backgroundColor: COLORS.card, borderRadius: 19, borderWidth: 1, borderColor: COLORS.divider, padding: 18 }, sectionHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }, sectionTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "900" }, sectionSubtitle: { color: COLORS.muted, fontSize: 9.5, marginTop: 3 }, linkText: { color: COLORS.ink, fontSize: 10, fontWeight: "900" }, countPill: { backgroundColor: "#F3E8B9", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 }, countPillText: { color: COLORS.ink, fontSize: 9, fontWeight: "900" },
  orderRow: { borderTopWidth: 1, borderTopColor: COLORS.divider, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }, orderMain: { flex: 1, minWidth: 190 }, orderId: { color: COLORS.yellow, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, orderCustomer: { color: COLORS.ink, fontSize: 12, fontWeight: "900", marginTop: 3 }, orderMeta: { color: COLORS.muted, fontSize: 9, marginTop: 3 }, orderActions: { maxWidth: "100%", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7, flexWrap: "wrap" }, statusPill: { flexShrink: 0, minHeight: 34, borderRadius: 999, backgroundColor: "#E3EBE6", paddingHorizontal: 12, paddingVertical: 7, alignItems: "center", justifyContent: "center" }, statusPillReady: { minWidth: 132 }, statusText: { flexShrink: 0, color: COLORS.ink, fontSize: 8.5, fontWeight: "900" }, primaryButton: { flexShrink: 0, borderRadius: 10, backgroundColor: COLORS.ink, paddingHorizontal: 12, paddingVertical: 9 }, primaryButtonText: { color: COLORS.card, fontSize: 8.5, fontWeight: "900" }, rejectButton: { flexShrink: 0, paddingHorizontal: 8, paddingVertical: 8 }, rejectText: { color: COLORS.danger, fontSize: 8.5, fontWeight: "900" },
  productRow: { minHeight: 66, borderTopWidth: 1, borderTopColor: COLORS.divider, flexDirection: "row", alignItems: "center", gap: 11 }, productIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#EFF2F0", alignItems: "center", justifyContent: "center" }, productCopy: { flex: 1 }, productName: { color: COLORS.ink, fontSize: 11, fontWeight: "900" }, productMeta: { color: COLORS.muted, fontSize: 8.5, marginTop: 2 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#F5E1DD", borderRadius: 13, padding: 12, marginBottom: 14 }, errorText: { flex: 1, color: COLORS.danger, fontSize: 9.5, fontWeight: "700" }, loadingCard: { minHeight: 230, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.card, borderRadius: 18, gap: 10 }, loadingText: { color: COLORS.muted, fontSize: 10, fontWeight: "700" }, emptyCard: { minHeight: 250, alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.divider }, emptyIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#F3E8B9", alignItems: "center", justifyContent: "center", marginBottom: 15 }, emptyTitle: { color: COLORS.ink, fontSize: 17, fontWeight: "900", textAlign: "center" }, emptyCopy: { color: COLORS.muted, fontSize: 10.5, lineHeight: 16, textAlign: "center", maxWidth: 430, marginTop: 7 },
  paymentWarning: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#F8E9E5", borderWidth: 1, borderColor: "#E8C9C3", borderRadius: 15, padding: 14, marginBottom: 14 }, paymentWarningCopy: { flex: 1 }, paymentWarningTitle: { color: COLORS.danger, fontSize: 11, fontWeight: "900" }, paymentWarningText: { color: COLORS.muted, fontSize: 9, marginTop: 2 }, paymentButton: { flexShrink: 0, borderRadius: 10, backgroundColor: "#F3E8B9", borderWidth: 1, borderColor: COLORS.yellow, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 }, paymentButtonText: { color: COLORS.ink, fontSize: 8.5, fontWeight: "900" },
});
