create unique index if not exists payment_attempts_one_open_per_order_idx
  on public.payment_attempts (order_id)
  where status in ('created', 'pending');

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
    or target_payment_status <> 'pending'
    or target_payment_method <> 'midtrans_snap'
  then
    raise exception 'Order is not eligible for a new payment attempt.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_midtrans_payment_attempt_trigger
  on public.payment_attempts;

create trigger guard_midtrans_payment_attempt_trigger
before insert on public.payment_attempts
for each row execute function public.guard_midtrans_payment_attempt();

revoke all on function public.guard_midtrans_payment_attempt() from public, anon, authenticated;
