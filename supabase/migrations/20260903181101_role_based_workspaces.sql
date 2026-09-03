-- KopiPow role-based staff/admin access.
-- Customer is the implicit role for authenticated users without a row here.

do $$
begin
  create type public.app_role as enum ('staff', 'admin');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 2 and 24),
  name text not null check (char_length(name) between 2 and 80),
  address text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.branches (code, name, address)
values ('MAIN', 'Main Branch', '')
on conflict (code) do nothing;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  branch_id uuid references public.branches(id) on delete restrict,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_requires_branch check (role <> 'staff' or branch_id is not null)
);

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select role
  from public.user_roles
  where user_id = (select auth.uid())
    and enabled = true
  limit 1;
$$;

create or replace function private.can_access_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and enabled = true
      and (
        role = 'admin'
        or (role = 'staff' and branch_id = target_branch_id)
      )
  );
$$;

revoke all on function private.current_user_role() from public, anon;
revoke all on function private.can_access_branch(uuid) from public, anon;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.can_access_branch(uuid) to authenticated;

alter table public.branches enable row level security;
alter table public.user_roles enable row level security;

revoke all on table public.branches from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;
grant select on table public.branches to anon, authenticated;
grant select, insert, update, delete on table public.user_roles to authenticated;

drop policy if exists "Public can read active branches" on public.branches;
create policy "Public can read active branches"
on public.branches for select
to anon, authenticated
using (active = true or (select private.current_user_role()) = 'admin');

drop policy if exists "Users can read their access role" on public.user_roles;
create policy "Users can read their access role"
on public.user_roles for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.current_user_role()) = 'admin'
);

drop policy if exists "Admins can create access roles" on public.user_roles;
create policy "Admins can create access roles"
on public.user_roles for insert
to authenticated
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can update access roles" on public.user_roles;
create policy "Admins can update access roles"
on public.user_roles for update
to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can delete access roles" on public.user_roles;
create policy "Admins can delete access roles"
on public.user_roles for delete
to authenticated
using ((select private.current_user_role()) = 'admin');

alter table public.orders
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

update public.orders
set branch_id = (select id from public.branches where code = 'MAIN' limit 1)
where branch_id is null;

alter table public.orders alter column branch_id set not null;

create or replace function public.default_branch_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select id from public.branches where active = true order by created_at limit 1;
$$;

revoke all on function public.default_branch_id() from public, anon, authenticated;
alter table public.orders alter column branch_id set default public.default_branch_id();

grant update on table public.orders to authenticated;
grant update on table public.products to authenticated;

drop policy if exists "Operations can read branch orders" on public.orders;
create policy "Operations can read branch orders"
on public.orders for select
to authenticated
using ((select private.can_access_branch(branch_id)));

drop policy if exists "Operations can read branch order items" on public.order_items;
create policy "Operations can read branch order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and (select private.can_access_branch(orders.branch_id))
  )
);

drop policy if exists "Operations can read every product" on public.products;
create policy "Operations can read every product"
on public.products for select
to authenticated
using ((select private.current_user_role()) in ('staff', 'admin'));

create or replace function public.update_order_workflow(
  p_order_id uuid,
  p_next_status text
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_order public.orders%rowtype;
begin
  select * into current_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if not private.can_access_branch(current_order.branch_id) then
    raise exception 'You are not allowed to manage this order';
  end if;

  if not (
    (current_order.status = 'pending' and p_next_status in ('confirmed', 'cancelled'))
    or (current_order.status = 'confirmed' and p_next_status in ('preparing', 'cancelled'))
    or (current_order.status = 'preparing' and p_next_status in ('ready', 'cancelled'))
    or (current_order.status = 'ready' and p_next_status = 'completed')
  ) then
    raise exception 'Invalid order status transition from % to %', current_order.status, p_next_status;
  end if;

  update public.orders
  set status = p_next_status,
      updated_at = now()
  where id = p_order_id
  returning * into current_order;

  return current_order;
end;
$$;

create or replace function public.set_product_availability(
  p_product_id bigint,
  p_available boolean
)
returns public.products
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated_product public.products%rowtype;
begin
  if (select private.current_user_role()) not in ('staff', 'admin') then
    raise exception 'Staff access is required';
  end if;

  update public.products
  set active = p_available,
      updated_at = now()
  where id = p_product_id
  returning * into updated_product;

  if not found then
    raise exception 'Product not found';
  end if;

  return updated_product;
end;
$$;

revoke all on function public.update_order_workflow(uuid, text) from public, anon;
revoke all on function public.set_product_availability(bigint, boolean) from public, anon;
grant execute on function public.update_order_workflow(uuid, text) to authenticated;
grant execute on function public.set_product_availability(bigint, boolean) to authenticated;

comment on table public.user_roles is
  'Protected Staff/Admin access. Authenticated users without a row are customers.';
