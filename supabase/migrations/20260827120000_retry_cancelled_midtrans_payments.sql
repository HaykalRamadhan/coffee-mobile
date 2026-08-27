create or replace function public.guard_midtrans_payment_attempt()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_status text;
  target_payment_status text;
  target_payment_method text;
begin
  select status, payment_status, payment_method
    into target_status, target_payment_status, target_payment_method
  from public.orders
  where id = new.order_id
  for update;

  if not found then
    raise exception 'Payment order does not exist.' using errcode = '23503';
  end if;

  if target_status <> 'pending'
    or target_payment_status not in ('pending', 'failed', 'expired')
    or target_payment_method <> 'midtrans_snap'
  then
    raise exception 'Order is not eligible for a new payment attempt.' using errcode = '23514';
  end if;

  return new;
end;
$$;
