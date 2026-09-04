-- A production migration-ledger synchronization replayed the original role
-- workspace migration. Restore the newer payment-before-completion safeguard.

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
    raise exception 'Payment must be received before completing pickup';
  end if;

  update public.orders
  set status = p_next_status,
      updated_at = now()
  where id = p_order_id
  returning * into current_order;

  return current_order;
end;
$$;

revoke all on function public.update_order_workflow(uuid, text) from public, anon;
grant execute on function public.update_order_workflow(uuid, text) to authenticated;
