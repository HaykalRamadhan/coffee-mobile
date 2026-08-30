insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.products
  add column if not exists image_path text;

alter table public.products
  drop constraint if exists products_image_path_check;

alter table public.products
  add constraint products_image_path_check
  check (
    image_path is null
    or image_path ~ '^[a-z0-9][a-z0-9/_-]*\.webp$'
  );

update public.products
set
  image_path = case id
    when 1 then 'power-latte.webp'
    when 2 then 'orange-bolt.webp'
    when 3 then 'sesame-charge.webp'
    when 4 then 'matcha-pow.webp'
    when 5 then 'cocoa-kick.webp'
    when 6 then 'long-black.webp'
    when 7 then 'butter-croffle.webp'
    when 8 then 'power-banana.webp'
    else image_path
  end,
  updated_at = now()
where id between 1 and 8;

comment on column public.products.image_path is
  'Object path inside the public product-images Supabase Storage bucket.';

