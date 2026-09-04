import type { ImageSource } from "expo-image";
import { PRODUCT_IMAGE_PATH_BY_ID } from "../assets/products/productImages";
import type { MenuDrink } from "../components/MenuScreen";
import type { ProductCustomizationConfig } from "../appState";
import { supabase } from "./supabase";

const PRODUCT_IMAGE_BUCKET = "product-images";

type ProductImageRow = {
  id: number;
  image_path: string | null;
  updated_at: string;
};

export type ProductImageSources = Record<number, ImageSource>;

export const loadHostedProductImageSources = async (): Promise<ProductImageSources> => {
  const client = supabase;
  if (!client) return {};

  const { data, error } = await client
    .from("products")
    .select("id, image_path, updated_at")
    .eq("active", true);

  const databaseRows = error ? [] : (data as ProductImageRow[]);
  const rowsById = new Map(databaseRows.map((row) => [row.id, row]));

  return Object.fromEntries(
    Object.entries(PRODUCT_IMAGE_PATH_BY_ID).map(([rawId, fallbackPath]) => {
      const id = Number(rawId);
      const row = rowsById.get(id);
      const imagePath = row?.image_path || fallbackPath;
      const version = row?.updated_at || "initial-webp";
      const { data: publicUrlData } = client.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .getPublicUrl(imagePath);

      return [id, {
        uri: `${publicUrlData.publicUrl}?v=${encodeURIComponent(version)}`,
        cacheKey: `${imagePath}:${version}`,
        width: 800,
        height: 800,
      } satisfies ImageSource];
    }),
  );
};

type CatalogRow = {
  id: number;
  sku: string;
  tag: string;
  name: string;
  description: string;
  category: MenuDrink["category"];
  base_price: number;
  accent: string;
  coffee_color: string;
  image_path: string | null;
  updated_at: string;
  customization_config: ProductCustomizationConfig;
};

export const loadHostedProductCatalog = async (fallback: MenuDrink[]): Promise<MenuDrink[]> => {
  const client = supabase;
  if (!client) return fallback;
  const { data, error } = await client.from("products")
    .select("id, sku, tag, name, description, category, base_price, accent, coffee_color, image_path, updated_at, customization_config")
    .eq("active", true)
    .order("id");
  if (error) return fallback;

  return ((data ?? []) as CatalogRow[]).map((row) => {
    const imagePath = row.image_path || PRODUCT_IMAGE_PATH_BY_ID[row.id];
    const imageSource = imagePath ? (() => {
      const { data: publicUrl } = client.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(imagePath);
      return { uri: `${publicUrl.publicUrl}?v=${encodeURIComponent(row.updated_at)}`, cacheKey: `${imagePath}:${row.updated_at}`, width: 800, height: 800 } satisfies ImageSource;
    })() : null;
    return {
      id: Number(row.id), name: row.name, detail: row.description || row.category,
      price: `Rp ${Math.round(Number(row.base_price) / 1000)}k`, basePrice: Number(row.base_price),
      accent: row.accent, coffee: row.coffee_color, imagePath: imagePath ?? "", imageSource,
      tag: row.tag, category: row.category,
      customizationConfig: row.customization_config,
    };
  });
};
