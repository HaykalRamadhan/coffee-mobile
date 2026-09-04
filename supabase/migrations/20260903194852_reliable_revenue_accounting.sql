-- Reliable revenue accounting for both Midtrans and counter payments.
-- Revenue is recognized when payment_status becomes paid, not when an order is created.

alter table public.orders
  add column if not exists paid_at timestamptz;

-- Preserve the best available settlement time for payments completed before this column existed.
update public.orders as orders
set paid_at = coalesce(
  (
    select max(attempts.updated_at)
    from public.payment_attempts as attempts
    where attempts.order_id = orders.id
      and attempts.status = 'paid'
  ),
  orders.updated_at,
  orders.created_at
)
where orders.payment_status = 'paid'
  and orders.paid_at is null;

create or replace function private.set_order_paid_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.payment_status = 'paid'
    and (tg_op = 'INSERT' or old.payment_status is distinct from 'paid')
  then
    new.paid_at := coalesce(new.paid_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists set_order_paid_at on public.orders;
create trigger set_order_paid_at
before insert or update of payment_status on public.orders
for each row
execute function private.set_order_paid_at();

create index if not exists orders_paid_at_idx
on public.orders (paid_at)
where payment_status = 'paid';

create or replace function public.mark_counter_payment_received(p_order_id uuid)
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

  if current_order.payment_method <> 'pay_at_counter' then
    raise exception 'Online payments are settled by Midtrans';
  end if;

  if current_order.status = 'cancelled' then
    raise exception 'A cancelled order cannot be marked as paid';
  end if;

  if current_order.payment_status = 'refunded' then
    raise exception 'A refunded order cannot be marked as paid';
  end if;

  if current_order.payment_status = 'paid' then
    return current_order;
  end if;

  update public.orders
  set payment_status = 'paid',
      updated_at = now()
  where id = p_order_id
  returning * into current_order;

  return current_order;
end;
$$;

create or replace function public.get_operations_revenue_summary()
returns table (
  today_revenue numeric,
  today_paid_orders bigint,
  total_revenue numeric,
  total_paid_orders bigint,
  total_orders bigint,
  active_orders bigint,
  outstanding_counter_amount numeric,
  outstanding_counter_orders bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with boundaries as (
    select
      date_trunc('day', timezone('Asia/Jakarta', now())) at time zone 'Asia/Jakarta' as day_start,
      (date_trunc('day', timezone('Asia/Jakarta', now())) + interval '1 day') at time zone 'Asia/Jakarta' as day_end
  ),
  scoped_orders as (
    select orders.*
    from public.orders as orders
    where (select private.current_user_role()) in ('staff', 'admin')
  )
  select
    coalesce(sum(total) filter (
      where payment_status = 'paid'
        and paid_at >= boundaries.day_start
        and paid_at < boundaries.day_end
    ), 0) as today_revenue,
    count(*) filter (
      where payment_status = 'paid'
        and paid_at >= boundaries.day_start
        and paid_at < boundaries.day_end
    ) as today_paid_orders,
    coalesce(sum(total) filter (where payment_status = 'paid'), 0) as total_revenue,
    count(*) filter (where payment_status = 'paid') as total_paid_orders,
    count(*) as total_orders,
    count(*) filter (where status not in ('completed', 'cancelled')) as active_orders,
    coalesce(sum(total) filter (
      where payment_method = 'pay_at_counter'
        and payment_status <> 'paid'
        and status <> 'cancelled'
    ), 0) as outstanding_counter_amount,
    count(*) filter (
      where payment_method = 'pay_at_counter'
        and payment_status <> 'paid'
        and status <> 'cancelled'
    ) as outstanding_counter_orders
  from scoped_orders
  cross join boundaries;
$$;

-- Pickup completion requires settlement. Existing completed counter orders can still
-- be settled with mark_counter_payment_received so historical revenue is recoverable.
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

  if p_next_status = 'completed' and current_order.payment_status <> 'paid' then
    raise exception 'Record payment before completing pickup';
  end if;

  update public.orders
  set status = p_next_status,
      updated_at = now()
  where id = p_order_id
  returning * into current_order;

  return current_order;
end;
$$;

revoke all on function public.mark_counter_payment_received(uuid) from public, anon;
revoke all on function public.get_operations_revenue_summary() from public, anon;
revoke all on function public.update_order_workflow(uuid, text) from public, anon;

grant execute on function public.mark_counter_payment_received(uuid) to authenticated;
grant execute on function public.get_operations_revenue_summary() to authenticated;
grant execute on function public.update_order_workflow(uuid, text) to authenticated;

comment on column public.orders.paid_at is
  'Timestamp when payment was first settled. Revenue reporting uses this instead of order creation time.';
