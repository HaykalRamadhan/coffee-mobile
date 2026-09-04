-- Admin-managed catalog, branches, staff access, and promotions.

create sequence if not exists public.products_id_seq;
select setval(
  'public.products_id_seq',
  greatest(coalesce((select max(id) from public.products), 0) + 1, 1),
  false
);
alter sequence public.products_id_seq owned by public.products.id;
alter table public.products alter column id set default nextval('public.products_id_seq');

alter table public.products
  add column if not exists sku text,
  add column if not exists description text not null default '',
  add column if not exists created_at timestamptz not null default now();

update public.products
set sku = 'KP-' || lpad(id::text, 4, '0')
where sku is null or trim(sku) = '';

alter table public.products alter column sku set not null;
create unique index if not exists products_sku_unique on public.products (upper(sku));

alter table public.products drop constraint if exists products_sku_length;
alter table public.products add constraint products_sku_length
  check (char_length(trim(sku)) between 2 and 40);
alter table public.products drop constraint if exists products_description_length;
alter table public.products add constraint products_description_length
  check (char_length(description) <= 500);

grant select, insert, update, delete on table public.products to authenticated;
grant usage, select on sequence public.products_id_seq to authenticated;

drop policy if exists "Admins can create products" on public.products;
create policy "Admins can create products"
on public.products for insert to authenticated
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products"
on public.products for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products"
on public.products for delete to authenticated
using ((select private.current_user_role()) = 'admin');

grant select, insert, update, delete on table public.branches to authenticated;

drop policy if exists "Admins can create branches" on public.branches;
create policy "Admins can create branches"
on public.branches for insert to authenticated
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can update branches" on public.branches;
create policy "Admins can update branches"
on public.branches for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can delete branches" on public.branches;
create policy "Admins can delete branches"
on public.branches for delete to authenticated
using ((select private.current_user_role()) = 'admin');

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text not null default '',
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_code_length check (char_length(trim(code)) between 2 and 30),
  constraint promotions_name_length check (char_length(trim(name)) between 2 and 100),
  constraint promotions_description_length check (char_length(description) <= 500),
  constraint promotions_percentage_limit check (discount_type <> 'percentage' or discount_value <= 100),
  constraint promotions_date_order check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create unique index if not exists promotions_code_unique on public.promotions (upper(code));
alter table public.promotions enable row level security;
grant select on table public.promotions to anon;
grant select, insert, update, delete on table public.promotions to authenticated;

drop policy if exists "Customers can read active promotions" on public.promotions;
create policy "Customers can read active promotions"
on public.promotions for select to anon, authenticated
using (
  (active = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
  or (select private.current_user_role()) = 'admin'
);

drop policy if exists "Admins can create promotions" on public.promotions;
create policy "Admins can create promotions"
on public.promotions for insert to authenticated
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can update promotions" on public.promotions;
create policy "Admins can update promotions"
on public.promotions for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can delete promotions" on public.promotions;
create policy "Admins can delete promotions"
on public.promotions for delete to authenticated
using ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and (select private.current_user_role()) = 'admin');

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and (select private.current_user_role()) = 'admin')
with check (bucket_id = 'product-images' and (select private.current_user_role()) = 'admin');

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and (select private.current_user_role()) = 'admin');
