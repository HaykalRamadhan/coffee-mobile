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
  itemCount: number;
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
  order_items: Array<{ quantity: number }>;
};

type OperationsProductRow = {
  id: number;
  name: string;
  category: string;
  base_price: number;
  active: boolean;
};

export async function loadOperationsData() {
  if (!supabase) {
    return { orders: [], products: [], error: "Supabase is not configured." };
  }

  const [ordersResult, productsResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, payment_status, payment_method, customer_name, total, created_at, order_items(quantity)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("products")
      .select("id, name, category, base_price, active")
      .order("id", { ascending: true }),
  ]);

  const error = ordersResult.error?.message ?? productsResult.error?.message ?? null;
  const orders = ((ordersResult.data ?? []) as OperationsOrderRow[]).map((row) => ({
    id: row.id,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    customerName: row.customer_name,
    total: Number(row.total),
    createdAt: row.created_at,
    itemCount: (row.order_items ?? []).reduce((total, item) => total + Number(item.quantity), 0),
  }));
  const products = ((productsResult.data ?? []) as OperationsProductRow[]).map((row) => ({
    id: Number(row.id),
    name: row.name,
    category: row.category,
    basePrice: Number(row.base_price),
    active: row.active,
  }));

  return { orders, products, error };
}

export async function advanceOrder(orderId: string, nextStatus: OrderStatus) {
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.rpc("update_order_workflow", {
    p_order_id: orderId,
    p_next_status: nextStatus,
  });
  return { error: error?.message ?? null };
}

export async function setProductAvailability(productId: number, available: boolean) {
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.rpc("set_product_availability", {
    p_product_id: productId,
    p_available: available,
  });
  return { error: error?.message ?? null };
}
