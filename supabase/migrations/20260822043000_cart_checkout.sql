create extension if not exists pgcrypto;

create table if not exists public.products (
  id bigint primary key,
  name text not null,
  category text not null check (category in ('Coffee', 'Non-coffee', 'Snacks')),
  accent text not null,
  coffee_color text not null,
  base_price integer not null check (base_price >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.products (id, name, category, accent, coffee_color, base_price)
values
  (1, 'Power Latte', 'Coffee', '#D9B38A', '#704129', 42000),
  (2, 'Orange Bolt', 'Coffee', '#EE9851', '#7A3825', 39000),
  (3, 'Sesame Charge', 'Non-coffee', '#A9A79C', '#413A35', 44000),
  (4, 'Matcha Pow', 'Non-coffee', '#9BAC75', '#66804C', 45000),
  (5, 'Cocoa Kick', 'Non-coffee', '#B68A6D', '#56382C', 38000),
  (6, 'Long Black', 'Coffee', '#948274', '#33231D', 32000),
  (7, 'Butter Croffle', 'Snacks', '#D3A45F', '#8B5D35', 35000),
  (8, 'Power Banana', 'Snacks', '#D9B75D', '#7A5330', 34000)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  accent = excluded.accent,
  coffee_color = excluded.coffee_color,
  base_price = excluded.base_price,
  active = true,
  updated_at = now();

alter table public.products enable row level security;

drop policy if exists "Active products are readable" on public.products;
create policy "Active products are readable"
on public.products for select
using (active = true);

create or replace function public.calculate_catalog_price(
  p_product_id bigint,
  p_customization jsonb
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_extra text;
  v_total integer;
begin
  select * into v_product
  from public.products
  where id = p_product_id and active = true;

  if not found then
    raise exception 'Product % is not available', p_product_id;
  end if;

  if v_product.category = 'Snacks' then
    return v_product.base_price;
  end if;

  if p_customization is null or jsonb_typeof(p_customization) <> 'object' then
    raise exception 'A valid customization is required';
  end if;

  if coalesce(p_customization->>'size', '') not in ('Small', 'Regular', 'Large')
    or coalesce(p_customization->>'temperature', '') not in ('Hot', 'Iced')
    or coalesce(p_customization->>'sugar', '') not in ('0%', '25%', '50%', '75%', '100%')
    or coalesce(p_customization->>'ice', '') not in ('No ice', 'Less ice', 'Normal ice', 'Extra ice')
    or coalesce(p_customization->>'milk', '') not in ('Fresh milk', 'Oat milk', 'Soy milk', 'Almond milk') then
    raise exception 'The customization contains an unsupported option';
  end if;

  if p_customization->'extras' is null or jsonb_typeof(p_customization->'extras') <> 'array' then
    raise exception 'Extras must be an array';
  end if;

  v_total := v_product.base_price
    + case p_customization->>'size'
        when 'Small' then -3000
        when 'Large' then 5000
        else 0
      end
    + case p_customization->>'milk'
        when 'Oat milk' then 7000
        when 'Soy milk' then 5000
        when 'Almond milk' then 7000
        else 0
      end;

  for v_extra in
    select value from jsonb_array_elements_text(p_customization->'extras')
  loop
    if v_extra = 'Extra espresso shot' then
      v_total := v_total + 7000;
    elsif v_extra = 'Syrup' then
      v_total := v_total + 5000;
    elsif v_extra = 'Whipped cream' then
      v_total := v_total + 6000;
    elsif v_extra = 'Caramel' then
      v_total := v_total + 5000;
    elsif v_extra = 'Additional topping' then
      v_total := v_total + 6000;
    else
      raise exception 'Unsupported extra: %', v_extra;
    end if;
  end loop;

  return v_total;
end;
$$;

create table if not exists public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  line_id text not null check (char_length(line_id) between 1 and 128),
  product_id bigint not null references public.products(id),
  name text not null,
  category text not null,
  accent text not null,
  coffee_color text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 20),
  note text not null default '' check (char_length(note) <= 120),
  customization jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, line_id)
);

alter table public.cart_items enable row level security;

drop policy if exists "Users can read their cart" on public.cart_items;
create policy "Users can read their cart"
on public.cart_items for select
using (auth.uid() = user_id);

create or replace function public.replace_my_cart(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_line_id text;
  v_quantity integer;
  v_note text;
  v_customization jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Cart items must be an array';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'The cart cannot contain more than 50 lines';
  end if;

  delete from public.cart_items where user_id = v_user_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_id := coalesce(v_item->>'lineId', '');
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    v_note := coalesce(v_item->>'note', '');
    v_customization := v_item->'customization';

    if char_length(v_line_id) not between 1 and 128 then
      raise exception 'A cart line identifier is invalid';
    end if;
    if v_quantity not between 1 and 20 then
      raise exception 'Cart quantities must be between 1 and 20';
    end if;
    if char_length(v_note) > 120 then
      raise exception 'Cart notes cannot exceed 120 characters';
    end if;

    select * into v_product
    from public.products
    where id = (v_item->>'productId')::bigint and active = true;

    if not found then
      raise exception 'A cart product is not available';
    end if;

    if v_product.category = 'Snacks' then
      v_customization := null;
    end if;

    insert into public.cart_items (
      user_id, line_id, product_id, name, category, accent, coffee_color,
      unit_price, quantity, note, customization
    ) values (
      v_user_id,
      v_line_id,
      v_product.id,
      v_product.name,
      v_product.category,
      v_product.accent,
      v_product.coffee_color,
      public.calculate_catalog_price(v_product.id, v_customization),
      v_quantity,
      v_note,
      v_customization
    );
  end loop;
end;
$$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'failed', 'refunded')),
  payment_method text not null default 'pay_at_counter' check (payment_method in ('pay_at_counter')),
  fulfillment_method text not null default 'pickup' check (fulfillment_method in ('pickup')),
  customer_name text not null check (char_length(customer_name) between 2 and 80),
  phone text,
  customer_note text not null default '' check (char_length(customer_note) <= 240),
  subtotal integer not null check (subtotal >= 0),
  total integer not null check (total >= 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id bigint not null references public.products(id),
  product_name text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 20),
  customization jsonb,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Users can read their orders" on public.orders;
create policy "Users can read their orders"
on public.orders for select
using (auth.uid() = user_id);

drop policy if exists "Users can read their order items" on public.order_items;
create policy "Users can read their order items"
on public.order_items for select
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
  )
);

create or replace function public.create_pickup_order(
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
    user_id, customer_name, phone, customer_note, subtotal, total
  ) values (
    v_user_id, v_customer_name, v_phone, v_customer_note, v_subtotal, v_subtotal
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

revoke all on function public.calculate_catalog_price(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.replace_my_cart(jsonb) from public, anon;
revoke all on function public.create_pickup_order(text, text, text) from public, anon;
grant execute on function public.replace_my_cart(jsonb) to authenticated;
grant execute on function public.create_pickup_order(text, text, text) to authenticated;

grant select on public.products to anon, authenticated;
grant select on public.cart_items to authenticated;
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
