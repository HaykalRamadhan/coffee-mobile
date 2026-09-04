-- Staff/admin-only manual order entry for walk-in customers.
-- Product names and prices are always read from the catalog on the server.

create or replace function public.create_walk_in_order(
  p_customer_name text,
  p_items jsonb
)
returns table (order_id uuid, subtotal integer, total integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.app_role;
  v_branch_id uuid;
  v_customer_name text;
  v_requested_count integer;
  v_catalog_count integer;
  v_total_quantity integer;
  v_quantities_valid boolean;
  v_subtotal integer;
  v_order_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in is required';
  end if;

  select role, branch_id into v_role, v_branch_id
  from public.user_roles
  where user_id = v_user_id and enabled = true;

  if v_role not in ('staff', 'admin') then
    raise exception 'Staff access is required';
  end if;

  v_branch_id := coalesce(v_branch_id, public.default_branch_id());
  if v_branch_id is null or not private.can_access_branch(v_branch_id) then
    raise exception 'No accessible branch is available';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product';
  end if;

  v_customer_name := coalesce(nullif(trim(p_customer_name), ''), 'Walk-in customer');
  if char_length(v_customer_name) > 80 then
    raise exception 'Customer name is too long';
  end if;

  with requested as (
    select
      (entry->>'productId')::bigint as product_id,
      sum((entry->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry
    group by (entry->>'productId')::bigint
  )
  select count(*), coalesce(sum(quantity), 0), coalesce(bool_and(quantity between 1 and 20), false)
  into v_requested_count, v_total_quantity, v_quantities_valid
  from requested;

  if not v_quantities_valid or v_requested_count = 0 or v_requested_count > 30 or v_total_quantity > 100 then
    raise exception 'Invalid walk-in order quantity';
  end if;

  with requested as (
    select
      (entry->>'productId')::bigint as product_id,
      sum((entry->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry
    group by (entry->>'productId')::bigint
  )
  select count(*), sum(products.base_price * requested.quantity)::integer
  into v_catalog_count, v_subtotal
  from requested
  join public.products on products.id = requested.product_id
  where products.active = true
    and requested.quantity between 1 and 20;

  if v_catalog_count <> v_requested_count or v_subtotal is null or v_subtotal <= 0 then
    raise exception 'One or more products are unavailable or invalid';
  end if;

  insert into public.orders (
    user_id,
    branch_id,
    status,
    payment_status,
    payment_method,
    fulfillment_method,
    customer_name,
    customer_note,
    subtotal,
    total,
    currency
  ) values (
    v_user_id,
    v_branch_id,
    'pending',
    'unpaid',
    'pay_at_counter',
    'pickup',
    v_customer_name,
    'Walk-in order',
    v_subtotal,
    v_subtotal,
    'IDR'
  ) returning id into v_order_id;

  with requested as (
    select
      (entry->>'productId')::bigint as product_id,
      sum((entry->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry
    group by (entry->>'productId')::bigint
  )
  insert into public.order_items (
    order_id, product_id, product_name, unit_price, quantity, customization, note
  )
  select
    v_order_id,
    products.id,
    products.name,
    products.base_price,
    requested.quantity,
    '{}'::jsonb,
    ''
  from requested
  join public.products on products.id = requested.product_id
  where products.active = true
    and requested.quantity between 1 and 20;

  return query select v_order_id, v_subtotal, v_subtotal;
end;
$$;

revoke all on function public.create_walk_in_order(text, jsonb) from public, anon;
grant execute on function public.create_walk_in_order(text, jsonb) to authenticated;

comment on function public.create_walk_in_order(text, jsonb) is
  'Creates a server-priced pay-at-counter order for an authenticated staff/admin user.';
