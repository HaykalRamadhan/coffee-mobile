alter table public.orders
  add column if not exists payment_environment text;

alter table public.orders
  drop constraint if exists orders_payment_environment_check;

alter table public.orders
  add constraint orders_payment_environment_check
  check (payment_environment is null or payment_environment in ('sandbox', 'production'));

-- Payment attempts contain provider responses and hosted checkout tokens. They
-- are intentionally available only through the authenticated Edge Functions.
revoke select on public.payment_attempts from authenticated;
drop policy if exists "Users can read their payment attempts" on public.payment_attempts;
