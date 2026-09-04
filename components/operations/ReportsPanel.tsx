import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  loadOperationsReport,
  type OperationsReport,
  type OperationsReportPeriod,
} from "../../lib/operations";
import { orderStatusLabel, subscribeToOrderChanges } from "../../lib/orders";
import { Text } from "../../lib/typography";

const COLORS = {
  card: "#FFFFFF",
  divider: "#DDE3DF",
  ink: "#153F32",
  muted: "#607067",
  yellow: "#E2B52F",
  yellowSoft: "#F3E8B9",
  greenSoft: "#E3EBE6",
  danger: "#A9453B",
};

const periods: Array<{ id: OperationsReportPeriod; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
];

const categoryColors = ["#153F32", "#E2B52F", "#9AB58A", "#D98E54", "#71877E"];
const formatRupiah = (value: number) => `Rp ${Math.round(value).toLocaleString("id-ID")}`;
const CHART_HEIGHT = 180;

const formatAxisRupiah = (value: number) => {
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}m`;
  if (value >= 1_000) return `Rp ${Math.round(value / 1_000)}k`;
  return `Rp ${Math.round(value)}`;
};

const niceRevenueMaximum = (value: number) => {
  if (value <= 0) return 100_000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const rounded = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return rounded * magnitude;
};

function ChangeLabel({ value }: { value: number | null }) {
  if (value === null) return <Text style={styles.neutralChange}>No previous-period data</Text>;
  const positive = value >= 0;
  return (
    <View style={styles.changeRow}>
      <Ionicons name={positive ? "trending-up" : "trending-down"} size={13} color={positive ? COLORS.ink : COLORS.danger} />
      <Text style={[styles.changeText, !positive && styles.negativeChange]}>{positive ? "+" : ""}{value.toLocaleString("id-ID")}% vs previous period</Text>
    </View>
  );
}

function ReportMetric({
  label,
  value,
  icon,
  change,
  detail,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  change?: number | null;
  detail?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTopRow}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Ionicons name={icon} size={19} color={COLORS.muted} />
      </View>
      <Text style={styles.metricValue} numberOfLines={2}>{value}</Text>
      {change !== undefined ? <ChangeLabel value={change} /> : <Text style={styles.metricDetail}>{detail}</Text>}
    </View>
  );
}

function SalesTrend({ report, compact }: { report: OperationsReport; compact: boolean }) {
  const [selectedPoint, setSelectedPoint] = useState<OperationsReport["trend"][number] | null>(null);
  const maxRevenue = niceRevenueMaximum(Math.max(...report.trend.map((point) => point.revenue), 0));
  const hasSales = report.trend.some((point) => point.revenue > 0);
  const labelStep = report.period === "today" ? 2 : report.period === "30d" ? 4 : 1;
  const yTicks = Array.from({ length: 5 }, (_, index) => maxRevenue * ((4 - index) / 4));
  const chartMinimumWidth = Math.max(compact ? 620 : 520, report.trend.length * (report.period === "30d" ? 38 : 42));

  useEffect(() => { setSelectedPoint(null); }, [report.period]);

  return (
    <View style={[styles.panel, styles.trendPanel]}>
      <View style={styles.panelHeading}>
        <View>
          <Text style={styles.panelTitle}>Sales trend</Text>
          <Text style={styles.panelSubtitle}>{report.period === "today" ? "Revenue by hour" : "Revenue by day"} · Jakarta time</Text>
        </View>
        <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>Live</Text></View>
      </View>
      <Text style={styles.yAxisTitle}>Revenue (Rp)</Text>
      <View style={styles.chartFrame}>
        <View style={styles.yAxis}>
          {yTicks.map((tick, index) => <Text key={`${tick}-${index}`} style={[styles.yTick, { top: (CHART_HEIGHT / 4) * index - 7 }]} numberOfLines={1}>{formatAxisRupiah(tick)}</Text>)}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.chartScroll}>
          <View style={[styles.chartCanvas, { minWidth: chartMinimumWidth }]}>
            <View style={styles.plotArea}>
              {yTicks.map((tick, index) => <View key={`line-${tick}-${index}`} pointerEvents="none" style={[styles.gridLine, { top: (CHART_HEIGHT / 4) * index }]} />)}
              {selectedPoint && (
                <View style={styles.chartTooltip}>
                  <View style={styles.tooltipCopy}>
                    <Text style={styles.tooltipTime}>{selectedPoint.label} WIB</Text>
                    <Text style={styles.tooltipRevenue}>{formatRupiah(selectedPoint.revenue)}</Text>
                    <Text style={styles.tooltipTransactions}>{selectedPoint.transactions} paid transaction{selectedPoint.transactions === 1 ? "" : "s"}</Text>
                  </View>
                  <Pressable accessibilityLabel="Close chart detail" onPress={() => setSelectedPoint(null)} style={styles.tooltipClose}><Ionicons name="close" size={15} color="#FFFFFF" /></Pressable>
                </View>
              )}
              <View style={styles.barsRow}>
                {report.trend.map((point, index) => {
                  const height = point.revenue > 0 ? Math.max(8, (point.revenue / maxRevenue) * CHART_HEIGHT) : 4;
                  const selected = selectedPoint?.label === point.label;
                  return (
                    <Pressable
                      key={`${point.label}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${point.label}, ${formatRupiah(point.revenue)}, ${point.transactions} paid transactions`}
                      accessibilityHint="Press and hold to show details"
                      delayLongPress={350}
                      onLongPress={() => setSelectedPoint(point)}
                      style={styles.barColumn}
                    >
                      <View style={[styles.bar, { height }, point.revenue === 0 && styles.emptyBar, selected && styles.selectedBar]} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.xLabels}>
              {report.trend.map((point, index) => <View key={`label-${point.label}-${index}`} style={styles.xLabelColumn}><Text style={styles.barLabel} numberOfLines={1}>{index % labelStep === 0 || index === report.trend.length - 1 ? point.label : ""}</Text></View>)}
            </View>
          </View>
        </ScrollView>
      </View>
      <Text style={styles.xAxisTitle}>Time ({report.period === "today" ? "WIB" : "Jakarta dates"}) · hold a bar for details</Text>
      {!hasSales && <Text style={styles.noSalesCopy}>Paid sales will appear here as soon as payment is recorded.</Text>}
    </View>
  );
}

function CategoryDistribution({ report }: { report: OperationsReport }) {
  const totalItems = report.categories.reduce((total, category) => total + category.items, 0);
  const totalRevenue = report.categories.reduce((total, category) => total + category.revenue, 0);

  return (
    <View style={[styles.panel, styles.categoryPanel]}>
      <View style={styles.panelHeading}>
        <View><Text style={styles.panelTitle}>Category distribution</Text><Text style={styles.panelSubtitle}>Paid items and revenue</Text></View>
      </View>
      <View style={styles.categorySummary}>
        <View style={styles.categoryRing}>
          <View style={styles.categoryRingInner}>
            <Text style={styles.categoryTotal}>{totalItems}</Text>
            <Text style={styles.categoryTotalLabel}>items</Text>
          </View>
        </View>
      </View>
      <View style={styles.categoryList}>
        {report.categories.length === 0
          ? <Text style={styles.noSalesCopy}>No paid item data in this period.</Text>
          : report.categories.map((category, index) => {
            const share = totalRevenue > 0 ? Math.round((category.revenue / totalRevenue) * 100) : 0;
            return (
              <View key={category.category} style={styles.categoryRow}>
                <View style={[styles.categoryDot, { backgroundColor: categoryColors[index % categoryColors.length] }]} />
                <View style={styles.categoryNameWrap}>
                  <Text style={styles.categoryName}>{category.category} ({share}%)</Text>
                  <Text style={styles.categoryItems}>{category.items} items</Text>
                </View>
                <Text style={styles.categoryRevenue}>{formatRupiah(category.revenue)}</Text>
              </View>
            );
          })}
      </View>
    </View>
  );
}

function TransactionsTable({ report, compact }: { report: OperationsReport; compact: boolean }) {
  const formatTime = (timestamp: string) => {
    if (!timestamp) return "—";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: report.timezone,
    }).format(new Date(timestamp));
  };

  return (
    <View style={[styles.panel, styles.transactionsPanel]}>
      <View style={styles.panelHeading}>
        <View><Text style={styles.panelTitle}>Latest transactions</Text><Text style={styles.panelSubtitle}>Orders created during the selected period</Text></View>
        <Text style={styles.timezoneText}></Text>
      </View>
      {!compact && (
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.orderColumn]}>Order</Text>
          <Text style={[styles.tableHeaderText, styles.timeColumn]}>Time</Text>
          <Text style={[styles.tableHeaderText, styles.methodColumn]}>Payment</Text>
          <Text style={[styles.tableHeaderText, styles.statusColumn]}>Status</Text>
          <Text style={[styles.tableHeaderText, styles.amountColumn]}>Amount</Text>
        </View>
      )}
      {report.transactionsList.length === 0
        ? <View style={styles.emptyTransactions}><Ionicons name="receipt-outline" size={28} color={COLORS.muted} /><Text style={styles.noSalesCopy}>No transactions in this period.</Text></View>
        : report.transactionsList.map((transaction) => (
          <View key={transaction.id} style={[styles.transactionRow, compact && styles.transactionRowCompact]}>
            <View style={[styles.orderColumn, compact && styles.compactOrderColumn]}>
              <Text style={styles.transactionId}>#{transaction.id.slice(0, 8).toUpperCase()}</Text>
              {compact && <Text style={styles.transactionTime}>{formatTime(transaction.createdAt)}</Text>}
            </View>
            {!compact && <Text style={[styles.transactionTime, styles.timeColumn]}>{formatTime(transaction.createdAt)}</Text>}
            <Text style={[styles.transactionMethod, styles.methodColumn]}>{transaction.paymentMethod === "midtrans_snap" ? "Online · Midtrans" : "Cashier · Counter"}</Text>
            <View style={[styles.statusColumn, compact && styles.compactStatusColumn]}><View style={[styles.transactionStatus, transaction.paymentStatus !== "paid" && styles.transactionStatusUnpaid]}><Text style={[styles.transactionStatusText, transaction.paymentStatus !== "paid" && styles.transactionStatusTextUnpaid]}>{transaction.paymentStatus === "paid" ? orderStatusLabel[transaction.status] : transaction.paymentStatus}</Text></View></View>
            <Text style={[styles.transactionAmount, styles.amountColumn]}>{formatRupiah(transaction.total)}</Text>
          </View>
        ))}
    </View>
  );
}

export function ReportsPanel({ compact, channelKey }: { compact: boolean; channelKey: string }) {
  const [period, setPeriod] = useState<OperationsReportPeriod>("today");
  const [report, setReport] = useState<OperationsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    const result = await loadOperationsReport(period);
    setReport(result.report);
    setError(result.error);
    setLoading(false);
  }, [period]);

  useEffect(() => { void refresh(true); }, [refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToOrderChanges({
      channelKey: `report-${channelKey}-${period}`,
      onChange: () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; void refresh(false); }, 200);
      },
      onSubscribed: () => { void refresh(false); },
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [channelKey, period, refresh]);

  const periodLabel = useMemo(() => periods.find((item) => item.id === period)?.label ?? "Today", [period]);

  if (loading && !report) return <View style={styles.loadingCard}><ActivityIndicator color={COLORS.ink} /><Text style={styles.loadingText}>Building your report…</Text></View>;

  return (
    <View>
      <View style={[styles.reportToolbar, compact && styles.reportToolbarCompact]}>
        <View><Text style={styles.reportTitle}>Sales report</Text><Text style={styles.reportSubtitle}>Verified payments only · {periodLabel}</Text></View>
        <View style={styles.periodSelector}>
          {periods.map((item) => (
            <Pressable key={item.id} onPress={() => setPeriod(item.id)} style={[styles.periodButton, period === item.id && styles.periodButtonActive]}>
              <Text style={[styles.periodButtonText, period === item.id && styles.periodButtonTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityLabel="Refresh report" onPress={() => { void refresh(true); }} style={styles.refreshButton}>
            {loading ? <ActivityIndicator size="small" color={COLORS.ink} /> : <Ionicons name="refresh" size={18} color={COLORS.ink} />}
          </Pressable>
        </View>
      </View>
      {error && <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={20} color={COLORS.danger} /><Text style={styles.errorText}>{error}</Text></View>}
      {report && (
        <>
          <View style={styles.metricGrid}>
            <ReportMetric label="Total sales" value={formatRupiah(report.summary.revenue)} icon="wallet-outline" change={report.summary.revenueChangePercent} />
            <ReportMetric label="Paid transactions" value={String(report.summary.transactions)} icon="receipt-outline" change={report.summary.transactionChangePercent} />
            <ReportMetric label="Average order" value={formatRupiah(report.summary.averageOrder)} icon="stats-chart-outline" detail={`${report.summary.itemsSold} items sold`} />
            <ReportMetric label="Best seller" value={report.summary.topProduct} icon="cafe-outline" detail={`${report.summary.topProductUnits} sold in this period`} />
          </View>
          <View style={[styles.analyticsGrid, compact && styles.analyticsGridCompact]}>
            <SalesTrend report={report} compact={compact} />
            <CategoryDistribution report={report} />
          </View>
          <TransactionsTable report={report} compact={compact} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  reportToolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 14 },
  reportToolbarCompact: { alignItems: "flex-start", flexDirection: "column" },
  reportTitle: { color: COLORS.ink, fontSize: 19, fontWeight: "900" }, reportSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  periodSelector: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  periodButton: { borderRadius: 10, borderWidth: 1, borderColor: COLORS.divider, backgroundColor: COLORS.card, paddingHorizontal: 11, paddingVertical: 8 },
  periodButtonActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink }, periodButtonText: { color: COLORS.muted, fontSize: 9, fontWeight: "800" }, periodButtonTextActive: { color: COLORS.card },
  refreshButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: COLORS.yellowSoft, borderWidth: 1, borderColor: COLORS.yellow },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  metricCard: { flexGrow: 1, flexBasis: 190, minHeight: 125, padding: 15, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.divider },
  metricTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, metricLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "800" }, metricValue: { color: COLORS.ink, fontSize: 20, lineHeight: 25, fontWeight: "900", marginTop: 14 }, metricDetail: { color: COLORS.muted, fontSize: 9, marginTop: 7 },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 7 }, changeText: { color: COLORS.ink, fontSize: 8.5, fontWeight: "800" }, negativeChange: { color: COLORS.danger }, neutralChange: { color: COLORS.muted, fontSize: 8.5, marginTop: 7 },
  analyticsGrid: { flexDirection: "row", gap: 10, alignItems: "stretch", marginBottom: 10 }, analyticsGridCompact: { flexDirection: "column" },
  panel: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.divider, borderRadius: 16, padding: 15 }, trendPanel: { flex: 2, minWidth: 0 }, categoryPanel: { flex: 1, minWidth: 240 }, transactionsPanel: { marginBottom: 10 },
  panelHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 13 }, panelTitle: { color: COLORS.ink, fontSize: 14, fontWeight: "900" }, panelSubtitle: { color: COLORS.muted, fontSize: 9, marginTop: 2 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: COLORS.greenSoft }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.ink }, liveText: { color: COLORS.ink, fontSize: 8, fontWeight: "900" },
  yAxisTitle: { color: COLORS.muted, fontSize: 8, fontWeight: "800", marginBottom: 7 }, chartFrame: { flexDirection: "row", alignItems: "flex-start" }, yAxis: { width: 66, height: CHART_HEIGHT, position: "relative", borderRightWidth: 1, borderRightColor: COLORS.divider }, yTick: { position: "absolute", right: 7, width: 58, color: COLORS.muted, fontSize: 7, textAlign: "right" },
  chartScroll: { flexGrow: 1 }, chartCanvas: { flexGrow: 1 }, plotArea: { height: CHART_HEIGHT, position: "relative", overflow: "hidden" }, gridLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: COLORS.divider }, barsRow: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end" },
  barColumn: { flex: 1, minWidth: 30, height: CHART_HEIGHT, justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 5 }, bar: { width: "100%", maxWidth: 34, backgroundColor: COLORS.ink, borderTopLeftRadius: 4, borderTopRightRadius: 4 }, emptyBar: { backgroundColor: "#CAD2CD" }, selectedBar: { backgroundColor: COLORS.yellow },
  xLabels: { minHeight: 28, flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.ink }, xLabelColumn: { flex: 1, minWidth: 30, alignItems: "center", paddingHorizontal: 2, paddingTop: 6 }, barLabel: { color: COLORS.muted, fontSize: 7, textAlign: "center" }, xAxisTitle: { color: COLORS.muted, fontSize: 8, textAlign: "center", marginTop: 7 },
  chartTooltip: { position: "absolute", zIndex: 5, elevation: 5, top: 8, left: "22%", right: "22%", minWidth: 150, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, backgroundColor: COLORS.ink, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9 }, tooltipCopy: { flex: 1 }, tooltipTime: { color: "#DCE5E0", fontSize: 7.5, fontWeight: "800" }, tooltipRevenue: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", marginTop: 2 }, tooltipTransactions: { color: "#DCE5E0", fontSize: 7.5, marginTop: 2 }, tooltipClose: { width: 24, height: 24, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.13)", alignItems: "center", justifyContent: "center" },
  noSalesCopy: { color: COLORS.muted, fontSize: 9.5, lineHeight: 14, textAlign: "center", paddingVertical: 10 },
  categorySummary: { alignItems: "center", paddingVertical: 5 }, categoryRing: { width: 112, height: 112, borderRadius: 56, borderWidth: 15, borderColor: COLORS.yellow, backgroundColor: COLORS.yellowSoft, alignItems: "center", justifyContent: "center" }, categoryRingInner: { width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" }, categoryTotal: { color: COLORS.ink, fontSize: 22, fontWeight: "900" }, categoryTotalLabel: { color: COLORS.muted, fontSize: 8 },
  categoryList: { marginTop: 10, gap: 9 }, categoryRow: { flexDirection: "row", alignItems: "center", gap: 7 }, categoryDot: { width: 9, height: 9, borderRadius: 5 }, categoryNameWrap: { flex: 1 }, categoryName: { color: COLORS.ink, fontSize: 9, fontWeight: "800" }, categoryItems: { color: COLORS.muted, fontSize: 7.5, marginTop: 1 }, categoryRevenue: { color: COLORS.ink, fontSize: 8.5, fontWeight: "900" },
  timezoneText: { color: COLORS.muted, fontSize: 8, fontWeight: "900" }, tableHeader: { minHeight: 32, flexDirection: "row", alignItems: "center", backgroundColor: "#F5F7F6", borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.divider, paddingHorizontal: 10 }, tableHeaderText: { color: COLORS.muted, fontSize: 8, fontWeight: "900" },
  transactionRow: { minHeight: 48, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.divider, paddingHorizontal: 10, gap: 8 }, transactionRowCompact: { flexWrap: "wrap", paddingVertical: 10 }, orderColumn: { flex: 1.1 }, compactOrderColumn: { minWidth: 130 }, timeColumn: { flex: 0.9 }, methodColumn: { flex: 1.5 }, statusColumn: { flex: 1 }, compactStatusColumn: { flexGrow: 0, flexBasis: "auto" }, amountColumn: { flex: 0.9, textAlign: "right" },
  transactionId: { color: COLORS.ink, fontSize: 9, fontWeight: "900" }, transactionTime: { color: COLORS.muted, fontSize: 8.5 }, transactionMethod: { color: COLORS.muted, fontSize: 8.5 }, transactionAmount: { color: COLORS.ink, fontSize: 9.5, fontWeight: "900" }, transactionStatus: { alignSelf: "flex-start", backgroundColor: COLORS.greenSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, transactionStatusUnpaid: { backgroundColor: COLORS.yellowSoft }, transactionStatusText: { color: COLORS.ink, fontSize: 7.5, fontWeight: "900", textTransform: "capitalize" }, transactionStatusTextUnpaid: { color: COLORS.danger }, emptyTransactions: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 4 },
  loadingCard: { minHeight: 300, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.divider, borderRadius: 16 }, loadingText: { color: COLORS.muted, fontSize: 10, fontWeight: "800" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#F5E1DD", borderRadius: 13, padding: 12, marginBottom: 14 }, errorText: { flex: 1, color: COLORS.danger, fontSize: 9.5, fontWeight: "700" },
});
