import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CartItem, ProductCustomization } from "../appState";
import { supabase } from "./supabase";

const GUEST_CART_KEY = "kopipow.guest-cart.v1";
const PENDING_ACCOUNT_CART_KEY = "kopipow.pending-account-cart.v1";

type CartResult = {
  error: string | null;
};

type LoadCartResult = CartResult & {
  items: CartItem[];
};

export type CheckoutOrder = {
  orderId: string;
  subtotal: number;
  total: number;
};

type CreateOrderResult = CartResult & {
  order: CheckoutOrder | null;
};

type CartRow = {
  line_id: string;
  product_id: number;
  name: string;
  category: string;
  accent: string;
  coffee_color: string;
  unit_price: number;
  quantity: number;
  note: string;
  customization: ProductCustomization | null;
};

const getCartServiceError = (error: { code?: string; message: string }) => {
  if (error.code === "42P01" || error.code === "PGRST202" || error.code === "PGRST205") {
    return "The cart database setup has not been applied to Supabase yet.";
  }
  return error.message;
};

export const loadGuestCart = async (): Promise<CartItem[]> => {
  try {
    const storedCart = await AsyncStorage.getItem(GUEST_CART_KEY);
    if (!storedCart) return [];
    const parsed = JSON.parse(storedCart) as unknown;
    return Array.isArray(parsed) ? parsed as CartItem[] : [];
  } catch {
    return [];
  }
};

export const saveGuestCart = async (items: CartItem[]) => {
  await AsyncStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
};

export const clearGuestCart = async () => {
  await AsyncStorage.removeItem(GUEST_CART_KEY);
};

const getPendingAccountCartKey = (userId: string) => `${PENDING_ACCOUNT_CART_KEY}.${userId}`;

export const loadPendingAccountCart = async (userId: string): Promise<CartItem[] | null> => {
  try {
    const storedCart = await AsyncStorage.getItem(getPendingAccountCartKey(userId));
    if (!storedCart) return null;
    const parsed = JSON.parse(storedCart) as { items?: unknown };
    return Array.isArray(parsed.items) ? parsed.items as CartItem[] : null;
  } catch {
    return null;
  }
};

export const savePendingAccountCart = async (userId: string, items: CartItem[]) => {
  await AsyncStorage.setItem(getPendingAccountCartKey(userId), JSON.stringify({
    items,
    updatedAt: new Date().toISOString(),
  }));
};

export const clearPendingAccountCart = async (userId: string) => {
  await AsyncStorage.removeItem(getPendingAccountCartKey(userId));
};

export const loadAccountCart = async (): Promise<LoadCartResult> => {
  if (!supabase) return { items: [], error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("cart_items")
    .select("line_id, product_id, name, category, accent, coffee_color, unit_price, quantity, note, customization")
    .order("created_at", { ascending: true });

  if (error) return { items: [], error: getCartServiceError(error) };

  return {
    error: null,
    items: ((data ?? []) as CartRow[]).map((row) => ({
      lineId: row.line_id,
      productId: Number(row.product_id),
      name: row.name,
      category: row.category,
      accent: row.accent,
      coffee: row.coffee_color,
      unitPrice: Number(row.unit_price),
      quantity: Number(row.quantity),
      note: row.note,
      customization: row.customization,
    })),
  };
};

export const replaceAccountCart = async (items: CartItem[], signal?: AbortSignal): Promise<CartResult> => {
  if (!supabase) return { error: "Supabase is not configured." };

  let request = supabase.rpc("replace_my_cart", {
    p_items: items.map((item) => ({
      lineId: item.lineId,
      productId: item.productId,
      quantity: item.quantity,
      note: item.note,
      customization: item.customization,
    })),
  });
  if (signal) request = request.abortSignal(signal);

  const { error } = await request;

  return { error: error ? getCartServiceError(error) : null };
};

export const createMidtransPickupOrder = async ({
  customerName,
  phone,
  customerNote,
}: {
  customerName: string;
  phone: string;
  customerNote: string;
}): Promise<CreateOrderResult> => {
  if (!supabase) return { order: null, error: "Supabase is not configured." };

  const { data, error } = await supabase.rpc("create_midtrans_pickup_order", {
    p_customer_name: customerName.trim(),
    p_phone: phone.trim() || null,
    p_customer_note: customerNote.trim(),
  });

  if (error) return { order: null, error: getCartServiceError(error) };

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { order: null, error: "Supabase did not return the created order." };

  return {
    error: null,
    order: {
      orderId: String(row.order_id),
      subtotal: Number(row.subtotal),
      total: Number(row.total),
    },
  };
};
