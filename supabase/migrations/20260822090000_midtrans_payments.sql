alter table public.orders
  drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'expired', 'refunded'));

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('pay_at_counter', 'midtrans_snap'));

alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists paid_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_provider_check;

alter table public.orders
  add constraint orders_payment_provider_check
  check (payment_provider is null or payment_provider in ('midtrans'));

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider in ('midtrans')),
  environment text not null check (environment in ('sandbox', 'production')),
  provider_order_id text not null unique,
  provider_transaction_id text,
  status text not null default 'created'
    check (status in ('created', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
  payment_type text,
  gross_amount integer not null check (gross_amount > 0),
  snap_token text,
  redirect_url text,
  expires_at timestamptz,
  raw_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_attempts_order_created_idx
on public.payment_attempts (order_id, created_at desc);

alter table public.payment_attempts enable row level security;

drop policy if exists "Users can read their payment attempts" on public.payment_attempts;
create policy "Users can read their payment attempts"
on public.payment_attempts for select
using (auth.uid() = user_id);

create or replace function public.create_midtrans_pickup_order(
  p_customer_name text,
  p_phone text default null,
  p_customer_note text default ''
)
returns table (order_id uuid, subtotal integer, total integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_subtotal integer;
  v_customer_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_customer_note text := btrim(coalesce(p_customer_note, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if char_length(v_customer_name) not between 2 and 80 then
    raise exception 'Enter a customer name between 2 and 80 characters';
  end if;
  if v_phone is not null and (char_length(v_phone) not between 8 and 20 or v_phone !~ '^[0-9+() -]+$') then
    raise exception 'Enter a valid phone number';
  end if;
  if char_length(v_customer_note) > 240 then
    raise exception 'Order notes cannot exceed 240 characters';
  end if;

  perform 1 from public.cart_items where user_id = v_user_id for update;
  if not found then
    raise exception 'Your cart is empty';
  end if;

  select sum(quantity * public.calculate_catalog_price(product_id, customization))::integer
  into v_subtotal
  from public.cart_items
  where user_id = v_user_id;

  insert into public.orders (
    user_id,
    status,
    payment_status,
    payment_method,
    payment_provider,
    customer_name,
    phone,
    customer_note,
    subtotal,
    total
  ) values (
    v_user_id,
    'pending',
    'pending',
    'midtrans_snap',
    'midtrans',
    v_customer_name,
    v_phone,
    v_customer_note,
    v_subtotal,
    v_subtotal
  ) returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, product_name, unit_price, quantity, customization, note
  )
  select
    v_order_id,
    cart.product_id,
    product.name,
    public.calculate_catalog_price(cart.product_id, cart.customization),
    cart.quantity,
    cart.customization,
    cart.note
  from public.cart_items as cart
  join public.products as product on product.id = cart.product_id
  where cart.user_id = v_user_id;

  delete from public.cart_items where user_id = v_user_id;

  return query select v_order_id, v_subtotal, v_subtotal;
end;
$$;

revoke all on function public.create_midtrans_pickup_order(text, text, text)
from public, anon;
grant execute on function public.create_midtrans_pickup_order(text, text, text)
to authenticated;

grant select on public.payment_attempts to authenticated;
