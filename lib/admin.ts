import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ProductCustomizationConfig } from "../appState";
import { supabase } from "./supabase";

export type AdminProduct = {
  id: number;
  sku: string;
  tag: string;
  name: string;
  description: string;
  category: "Coffee" | "Non-coffee" | "Snacks";
  basePrice: number;
  imagePath: string | null;
  accent: string;
  coffeeColor: string;
  active: boolean;
  customizationConfig: ProductCustomizationConfig;
};

export type AdminBranch = {
  id: string;
  code: string;
  name: string;
  address: string;
  active: boolean;
};

export type AdminPromotion = {
  id: string;
  code: string;
  name: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

export type AdminStaff = {
  userId: string;
  email: string;
  displayName: string;
  role: "staff" | "admin";
  branchId: string | null;
  enabled: boolean;
  createdAt: string;
};

type Result<T> = { data: T; error: string | null };

const missingClient = <T>(data: T): Result<T> => ({ data, error: "Supabase is not configured." });
const cleanOptionalDate = (value: string | null) => value?.trim() ? new Date(value).toISOString() : null;

export async function loadAdminProducts(): Promise<Result<AdminProduct[]>> {
  if (!supabase) return missingClient([]);
  const { data, error } = await supabase.from("products")
    .select("id, sku, tag, name, description, category, base_price, image_path, accent, coffee_color, active, customization_config")
    .order("name");
  return {
    data: (data ?? []).map((row) => ({
      id: Number(row.id), sku: row.sku, tag: row.tag, name: row.name, description: row.description,
      category: row.category, basePrice: Number(row.base_price), imagePath: row.image_path,
      accent: row.accent, coffeeColor: row.coffee_color, active: row.active,
      customizationConfig: row.customization_config,
    })) as AdminProduct[],
    error: error?.message ?? null,
  };
}

export async function saveAdminProduct(product: Omit<AdminProduct, "id"> & { id?: number }): Promise<Result<AdminProduct | null>> {
  if (!supabase) return missingClient(null);
  const values = {
    ...(product.id ? { id: product.id } : {}),
    sku: product.sku.trim().toUpperCase(), tag: product.tag.trim().toUpperCase(), name: product.name.trim(), description: product.description.trim(),
    category: product.category, base_price: Math.round(product.basePrice), image_path: product.imagePath?.trim() || null,
    accent: product.accent, coffee_color: product.coffeeColor, active: product.active, updated_at: new Date().toISOString(),
    customization_config: product.customizationConfig,
  };
  const query = product.id
    ? supabase.from("products").update(values).eq("id", product.id)
    : supabase.from("products").insert(values);
  const { data, error } = await query.select("id, sku, tag, name, description, category, base_price, image_path, accent, coffee_color, active, customization_config").single();
  if (error || !data) return { data: null, error: error?.message ?? "Product was not saved." };
  return { data: {
    id: Number(data.id), sku: data.sku, tag: data.tag, name: data.name, description: data.description,
    category: data.category, basePrice: Number(data.base_price), imagePath: data.image_path,
    accent: data.accent, coffeeColor: data.coffee_color, active: data.active,
    customizationConfig: data.customization_config,
  } as AdminProduct, error: null };
}

export async function deleteAdminProduct(id: number): Promise<Result<null>> {
  if (!supabase) return missingClient(null);
  const { error } = await supabase.from("products").delete().eq("id", id);
  return { data: null, error: error?.message ?? null };
}

export async function uploadAdminProductImage(sku: string, sourceUri: string): Promise<Result<string | null>> {
  if (!supabase) return missingClient(null);
  try {
    const context = ImageManipulator.manipulate(sourceUri);
    context.resize({ width: 1200, height: null });
    const rendered = await context.renderAsync();
    const converted = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: 0.82 });
    const body = await fetch(converted.uri).then((response) => response.arrayBuffer());
    const path = `catalog/${sku.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}.webp`;
    const { error } = await supabase.storage.from("product-images").upload(path, body, {
      contentType: "image/webp", cacheControl: "3600", upsert: true,
    });
    return { data: error ? null : path, error: error?.message ?? null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Image upload failed." };
  }
}

export async function loadAdminBranches(): Promise<Result<AdminBranch[]>> {
  if (!supabase) return missingClient([]);
  const { data, error } = await supabase.from("branches").select("id, code, name, address, active").order("name");
  return { data: (data ?? []).map((row) => ({ ...row })) as AdminBranch[], error: error?.message ?? null };
}

export async function saveAdminBranch(branch: Omit<AdminBranch, "id"> & { id?: string }): Promise<Result<AdminBranch | null>> {
  if (!supabase) return missingClient(null);
  const values = { code: branch.code.trim().toUpperCase(), name: branch.name.trim(), address: branch.address.trim(), active: branch.active, updated_at: new Date().toISOString() };
  const query = branch.id ? supabase.from("branches").update(values).eq("id", branch.id) : supabase.from("branches").insert(values);
  const { data, error } = await query.select("id, code, name, address, active").single();
  return { data: data as AdminBranch | null, error: error?.message ?? null };
}

export async function deleteAdminBranch(id: string): Promise<Result<null>> {
  if (!supabase) return missingClient(null);
  const { error } = await supabase.from("branches").delete().eq("id", id);
  return { data: null, error: error?.message ?? null };
}

export async function loadAdminPromotions(): Promise<Result<AdminPromotion[]>> {
  if (!supabase) return missingClient([]);
  const { data, error } = await supabase.from("promotions")
    .select("id, code, name, description, discount_type, discount_value, starts_at, ends_at, active").order("created_at", { ascending: false });
  return { data: (data ?? []).map((row) => ({
    id: row.id, code: row.code, name: row.name, description: row.description,
    discountType: row.discount_type, discountValue: Number(row.discount_value),
    startsAt: row.starts_at, endsAt: row.ends_at, active: row.active,
  })) as AdminPromotion[], error: error?.message ?? null };
}

export async function saveAdminPromotion(promotion: Omit<AdminPromotion, "id"> & { id?: string }): Promise<Result<AdminPromotion | null>> {
  if (!supabase) return missingClient(null);
  let startsAt: string | null;
  let endsAt: string | null;
  try { startsAt = cleanOptionalDate(promotion.startsAt); endsAt = cleanOptionalDate(promotion.endsAt); }
  catch { return { data: null, error: "Use a valid date such as 2026-09-30 18:00." }; }
  const values = {
    code: promotion.code.trim().toUpperCase(), name: promotion.name.trim(), description: promotion.description.trim(),
    discount_type: promotion.discountType, discount_value: Math.round(promotion.discountValue),
    starts_at: startsAt, ends_at: endsAt, active: promotion.active, updated_at: new Date().toISOString(),
  };
  const query = promotion.id ? supabase.from("promotions").update(values).eq("id", promotion.id) : supabase.from("promotions").insert(values);
  const { data, error } = await query.select("id, code, name, description, discount_type, discount_value, starts_at, ends_at, active").single();
  if (error || !data) return { data: null, error: error?.message ?? "Promotion was not saved." };
  return { data: {
    id: data.id, code: data.code, name: data.name, description: data.description,
    discountType: data.discount_type, discountValue: Number(data.discount_value),
    startsAt: data.starts_at, endsAt: data.ends_at, active: data.active,
  } as AdminPromotion, error: null };
}

export async function deleteAdminPromotion(id: string): Promise<Result<null>> {
  if (!supabase) return missingClient(null);
  const { error } = await supabase.from("promotions").delete().eq("id", id);
  return { data: null, error: error?.message ?? null };
}

async function staffRequest(body: Record<string, unknown>): Promise<Result<AdminStaff[]>> {
  if (!supabase) return missingClient([]);
  const { data, error } = await supabase.functions.invoke("admin-staff", { body });
  let responseError = typeof data?.error === "string" ? data.error : null;
  if (error && !responseError) {
    try {
      const response = (error as { context?: Response }).context;
      if (response) {
        const payload = await response.clone().json() as { error?: unknown };
        if (typeof payload.error === "string") responseError = payload.error;
      }
    } catch {
      // Fall back to the SDK message when the response has no JSON body.
    }
  }
  return { data: (data?.staff ?? []) as AdminStaff[], error: responseError ?? error?.message ?? null };
}

export const loadAdminStaff = () => staffRequest({ action: "list" });
export const saveAdminStaff = async (staff: Partial<AdminStaff> & { email: string; password?: string }): Promise<Result<AdminStaff[]>> => {
  if (!staff.email.trim() || !staff.email.includes("@")) return { data: [], error: "Enter a valid staff email." };
  if (!staff.userId && (staff.password?.length ?? 0) < 8) return { data: [], error: "Temporary password must contain at least 8 characters." };
  if (staff.userId && staff.password && staff.password.length < 8) return { data: [], error: "New password must contain at least 8 characters." };
  if (staff.role === "staff" && !staff.branchId) return { data: [], error: "Choose a branch for this staff member." };
  return staffRequest({ action: staff.userId ? "update" : "create", staff });
};
export const deleteAdminStaff = (userId: string) => staffRequest({ action: "delete", userId });
