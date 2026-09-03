import type { OrderStatus, PaymentMethod, PaymentStatus } from "./orders";
import { supabase } from "./supabase";

export type OperationsOrder = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  customerName: string;
  total: number;
  createdAt: string;
  paidAt: string | null;
  itemCount: number;
};

export type OperationsSummary = {
  todayRevenue: number;
  todayPaidOrders: number;
  totalRevenue: number;
  totalPaidOrders: number;
  totalOrders: number;
  activeOrders: number;
  outstandingCounterAmount: number;
  outstandingCounterOrders: number;
};

export type OperationsReportPeriod = "today" | "7d" | "30d";

export type OperationsReport = {
  period: OperationsReportPeriod;
  timezone: string;
  generatedAt: string;
  summary: {
    revenue: number;
    transactions: number;
    averageOrder: number;
    itemsSold: number;
    topProduct: string;
    topProductUnits: number;
    revenueChangePercent: number | null;
    transactionChangePercent: number | null;
  };
  trend: Array<{ label: string; revenue: number; transactions: number }>;
  categories: Array<{ category: string; items: number; revenue: number }>;
  transactionsList: Array<{
    id: string;
    createdAt: string;
    paidAt: string | null;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    status: OrderStatus;
    total: number;
  }>;
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

export type OperationsProduct = {
  id: number;
  name: string;
  category: string;
  basePrice: number;
  active: boolean;
};

type OperationsOrderRow = {
  id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  customer_name: string;
  total: number;
  created_at: string;
  paid_at: string | null;
  order_items: Array<{ quantity: number }>;
};

type OperationsSummaryRow = {
  today_revenue: number | string;
  today_paid_orders: number | string;
  total_revenue: number | string;
  total_paid_orders: number | string;
  total_orders: number | string;
  active_orders: number | string;
  outstanding_counter_amount: number | string;
  outstanding_counter_orders: number | string;
};

type OperationsProductRow = {
  id: number;
  name: string;
  category: string;
  base_price: number;
  active: boolean;
};

type OperationsReportPayload = {
  period?: OperationsReportPeriod;
  timezone?: string;
  generatedAt?: string;
  summary?: Record<string, unknown>;
  trend?: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
  transactions?: Array<Record<string, unknown>>;
};

const numericValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumericValue = (value: unknown) => value === null || value === undefined
  ? null
  : numericValue(value);

export async function loadOperationsData() {
  if (!supabase) {
    return { orders: [], products: [], summary: emptySummary, error: "Supabase is not configured." };
  }

  const [ordersResult, productsResult, summaryResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, payment_status, payment_method, customer_name, total, created_at, paid_at, order_items(quantity)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("products")
      .select("id, name, category, base_price, active")
      .order("id", { ascending: true }),
    supabase.rpc("get_operations_revenue_summary"),
  ]);

  const error = ordersResult.error?.message ?? productsResult.error?.message ?? summaryResult.error?.message ?? null;
  const orders = ((ordersResult.data ?? []) as OperationsOrderRow[]).map((row) => ({
    id: row.id,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    customerName: row.customer_name,
    total: Number(row.total),
    createdAt: row.created_at,
    paidAt: row.paid_at,
    itemCount: (row.order_items ?? []).reduce((total, item) => total + Number(item.quantity), 0),
  }));
  const products = ((productsResult.data ?? []) as OperationsProductRow[]).map((row) => ({
    id: Number(row.id),
    name: row.name,
    category: row.category,
    basePrice: Number(row.base_price),
    active: row.active,
  }));
  const summaryRow = ((summaryResult.data ?? []) as OperationsSummaryRow[])[0];
  const summary: OperationsSummary = summaryRow ? {
    todayRevenue: Number(summaryRow.today_revenue),
    todayPaidOrders: Number(summaryRow.today_paid_orders),
    totalRevenue: Number(summaryRow.total_revenue),
    totalPaidOrders: Number(summaryRow.total_paid_orders),
    totalOrders: Number(summaryRow.total_orders),
    activeOrders: Number(summaryRow.active_orders),
    outstandingCounterAmount: Number(summaryRow.outstanding_counter_amount),
    outstandingCounterOrders: Number(summaryRow.outstanding_counter_orders),
  } : emptySummary;

  return { orders, products, summary, error };
}

export async function loadOperationsReport(period: OperationsReportPeriod) {
  if (!supabase) return { report: null, error: "Supabase is not configured." };

  const { data, error } = await supabase.rpc("get_operations_report", { p_period: period });
  if (error) return { report: null, error: error.message };

  const payload = (data ?? {}) as OperationsReportPayload;
  const summary = payload.summary ?? {};
  const report: OperationsReport = {
    period: payload.period ?? period,
    timezone: payload.timezone ?? "Asia/Jakarta",
    generatedAt: payload.generatedAt ?? new Date().toISOString(),
    summary: {
      revenue: numericValue(summary.revenue),
      transactions: numericValue(summary.transactions),
      averageOrder: numericValue(summary.averageOrder),
      itemsSold: numericValue(summary.itemsSold),
      topProduct: typeof summary.topProduct === "string" ? summary.topProduct : "No paid sales yet",
      topProductUnits: numericValue(summary.topProductUnits),
      revenueChangePercent: nullableNumericValue(summary.revenueChangePercent),
      transactionChangePercent: nullableNumericValue(summary.transactionChangePercent),
    },
    trend: (payload.trend ?? []).map((entry) => ({
      label: String(entry.label ?? ""),
      revenue: numericValue(entry.revenue),
      transactions: numericValue(entry.transactions),
    })),
    categories: (payload.categories ?? []).map((entry) => ({
      category: String(entry.category ?? "Other"),
      items: numericValue(entry.items),
      revenue: numericValue(entry.revenue),
    })),
    transactionsList: (payload.transactions ?? []).map((entry) => ({
      id: String(entry.id ?? ""),
      createdAt: String(entry.createdAt ?? ""),
      paidAt: typeof entry.paidAt === "string" ? entry.paidAt : null,
      paymentMethod: entry.paymentMethod as PaymentMethod,
      paymentStatus: entry.paymentStatus as PaymentStatus,
      status: entry.status as OrderStatus,
      total: numericValue(entry.total),
    })),
  };

  return { report, error: null };
}

export async function advanceOrder(orderId: string, nextStatus: OrderStatus) {
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.rpc("update_order_workflow", {
    p_order_id: orderId,
    p_next_status: nextStatus,
  });
  return { error: error?.message ?? null };
}

export async function markCounterPaymentReceived(orderId: string) {
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.rpc("mark_counter_payment_received", {
    p_order_id: orderId,
  });
  return { error: error?.message ?? null };
}

export async function createWalkInOrder(
  customerName: string,
  items: Array<{ productId: number; quantity: number }>,
) {
  if (!supabase) return { orderId: null, error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc("create_walk_in_order", {
    p_customer_name: customerName,
    p_items: items,
  });
  const row = (data as Array<{ order_id?: string }> | null)?.[0];
  return { orderId: row?.order_id ?? null, error: error?.message ?? null };
}

export async function setProductAvailability(productId: number, available: boolean) {
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.rpc("set_product_availability", {
    p_product_id: productId,
    p_available: available,
  });
  return { error: error?.message ?? null };
}
