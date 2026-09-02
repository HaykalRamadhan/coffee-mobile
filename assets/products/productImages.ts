/**
 * Product image paths in the public Supabase `product-images` bucket.
 *
 * The WebP files beside this module are upload sources only. They are not
 * required by Metro, so they are not bundled into the installed application.
 */
export const PRODUCT_IMAGE_PATHS = {
  powerLatte: "power-latte.webp",
  orangeBolt: "orange-bolt.webp",
  sesameCharge: "sesame-charge.webp",
  matchaPow: "matcha-pow.webp",
  cocoaKick: "cocoa-kick.webp",
  longBlack: "long-black.webp",
  butterCroffle: "butter-croffle.webp",
  powerBanana: "power-banana.webp",
} as const;

export const PRODUCT_IMAGE_PATH_BY_ID: Record<number, string> = {
  1: PRODUCT_IMAGE_PATHS.powerLatte,
  2: PRODUCT_IMAGE_PATHS.orangeBolt,
  3: PRODUCT_IMAGE_PATHS.sesameCharge,
  4: PRODUCT_IMAGE_PATHS.matchaPow,
  5: PRODUCT_IMAGE_PATHS.cocoaKick,
  6: PRODUCT_IMAGE_PATHS.longBlack,
  7: PRODUCT_IMAGE_PATHS.butterCroffle,
  8: PRODUCT_IMAGE_PATHS.powerBanana,
};
