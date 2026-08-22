import { supabase } from "./supabase";

export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "expired" | "refunded";
export type PaymentMethod = "pay_at_counter" | "midtrans_snap";

export type AccountOrderItem = {
  id: number;
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
  customization: Record<string, unknown> | null;
  note: string;
};

export type AccountOrder = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentProvider: "midtrans" | null;
  fulfillmentMethod: "pickup";
  customerName: string;
  phone: string | null;
  customerNote: string;
  subtotal: number;
  total: number;
  currency: "IDR";
  createdAt: string;
  items: AccountOrderItem[];
};

type OrderRow = {
  id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  payment_provider: "midtrans" | null;
  fulfillment_method: "pickup";
  customer_name: string;
  phone: string | null;
  customer_note: string;
  subtotal: number;
  total: number;
  currency: "IDR";
  created_at: string;
  order_items: Array<{
    id: number;
    product_id: number;
    product_name: string;
    unit_price: number;
    quantity: number;
    customization: Record<string, unknown> | null;
    note: string;
  }>;
};

export type OrdersResult = {
  orders: AccountOrder[];
  error: string | null;
};

export const orderStatusLabel: Record<OrderStatus, string> = {
  pending: "Order received",
  confirmed: "Confirmed",
  preparing: "Being prepared",
  ready: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const isActiveOrder = (order: AccountOrder) => !["completed", "cancelled"].includes(order.status);

export const loadAccountOrders = async (): Promise<OrdersResult> => {
  if (!supabase) return { orders: [], error: "Supabase is not configured." };
  const client = supabase;

  const fetchOrders = () => client
    .from("orders")
    .select(`
        id,
        status,
        payment_status,
        payment_method,
        payment_provider,
        fulfillment_method,
        customer_name,
        phone,
        customer_note,
        subtotal,
        total,
        currency,
        created_at,
        order_items (
          id,
          product_id,
          product_name,
          unit_price,
          quantity,
          customization,
          note
        )
      `)
      .order("created_at", { ascending: false })
      .order("id", { referencedTable: "order_items", ascending: true });

  let result = await fetchOrders();
  if (result.error && /abort|network|fetch|timed? out/i.test(result.error.message)) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    result = await fetchOrders();
  }

  const { data, error } = result;

  if (error) return { orders: [], error: error.message };

  return {
    error: null,
    orders: ((data ?? []) as OrderRow[]).map((row) => ({
      id: row.id,
      status: row.status,
      paymentStatus: row.payment_status,
      paymentMethod: row.payment_method,
      paymentProvider: row.payment_provider,
      fulfillmentMethod: row.fulfillment_method,
      customerName: row.customer_name,
      phone: row.phone,
      customerNote: row.customer_note,
      subtotal: Number(row.subtotal),
      total: Number(row.total),
      currency: row.currency,
      createdAt: row.created_at,
      items: (row.order_items ?? []).map((item) => ({
        id: Number(item.id),
        productId: Number(item.product_id),
        productName: item.product_name,
        unitPrice: Number(item.unit_price),
        quantity: Number(item.quantity),
        customization: item.customization,
        note: item.note,
      })),
    })),
  };
};
