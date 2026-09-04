-- Keep immutable accounting facts after Auth account deletion. The live Auth
-- relationship becomes NULL, while the previous UUID remains as an internal,
-- non-foreign-key audit reference that can never attach to a new account.
alter table public.orders
  add column if not exists original_user_id uuid;

alter table public.payment_attempts
  add column if not exists original_user_id uuid;

comment on column public.orders.original_user_id is
  'Historical Auth UUID retained for restricted accounting audit only; never used for authorization.';
comment on column public.payment_attempts.original_user_id is
  'Historical Auth UUID retained for restricted accounting audit only; never used for authorization.';

alter table public.orders
  drop constraint if exists orders_user_id_fkey;
alter table public.orders
  alter column user_id drop not null;
alter table public.orders
  add constraint orders_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.payment_attempts
  drop constraint if exists payment_attempts_user_id_fkey;
alter table public.payment_attempts
  alter column user_id drop not null;
alter table public.payment_attempts
  add constraint payment_attempts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

create or replace function public.anonymize_order_after_account_unlink()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if old.user_id is not null and new.user_id is null then
    new.original_user_id := coalesce(old.original_user_id, old.user_id);
    new.customer_name := 'Deleted customer';
    new.phone := null;
    new.customer_note := '';
  end if;
  return new;
end;
$$;

drop trigger if exists anonymize_order_after_account_unlink on public.orders;
create trigger anonymize_order_after_account_unlink
before update of user_id on public.orders
for each row
execute function public.anonymize_order_after_account_unlink();

create or replace function public.anonymize_payment_after_account_unlink()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if old.user_id is not null and new.user_id is null then
    new.original_user_id := coalesce(old.original_user_id, old.user_id);
    new.snap_token := null;
    new.redirect_url := null;
    new.raw_status := jsonb_strip_nulls(jsonb_build_object(
      'anonymized', true,
      'transaction_status', old.raw_status->'transaction_status',
      'fraud_status', old.raw_status->'fraud_status',
      'status_code', old.raw_status->'status_code',
      'gross_amount', old.raw_status->'gross_amount',
      'payment_type', old.raw_status->'payment_type'
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists anonymize_payment_after_account_unlink on public.payment_attempts;
create trigger anonymize_payment_after_account_unlink
before update of user_id on public.payment_attempts
for each row
execute function public.anonymize_payment_after_account_unlink();

revoke all on function public.anonymize_order_after_account_unlink() from public, anon, authenticated;
revoke all on function public.anonymize_payment_after_account_unlink() from public, anon, authenticated;
