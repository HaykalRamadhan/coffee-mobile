# KopiPow product photos

These WebP files are upload sources for the public Supabase Storage bucket
`product-images`. They are not imported with `require()`, so Metro does not
bundle them into the APK or IPA.

## Replace an existing photo

1. Prepare a square WebP, ideally 800 × 800 with a transparent background.
2. Upload it to Supabase Storage > `product-images` using a versioned filename.
3. Update that product's `image_path` in the `products` table.
4. Pull to refresh in the app. A new app build is not required.

Use versioned names such as `power-latte-v2.webp` so the CDN never serves a
stale replacement. Uploads and changes are restricted to the Supabase dashboard
or service role; ordinary app users cannot modify product images.

The app uses `contentFit="contain"` and disk caching. If the device is offline
before an image has ever been cached, the normal product placeholder appears.
