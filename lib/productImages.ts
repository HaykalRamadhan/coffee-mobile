import type { ImageSource } from "expo-image";
import { PRODUCT_IMAGE_PATH_BY_ID } from "../assets/products/productImages";
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
