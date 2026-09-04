-- Restore KopiPow push notifications with safe device ownership, a durable
-- outbox, immediate delivery, and a scheduled retry fail-safe.

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.notification_outbox
  add column if not exists claimed_at timestamptz;

create index if not exists notification_outbox_claim_idx
on public.notification_outbox (created_at)
where processed_at is null and attempt_count < 5;

create table if not exists public.push_notification_deliveries (
  id bigint generated always as identity primary key,
  outbox_id bigint not null references public.notification_outbox(id) on delete cascade,
  device_id uuid references public.push_notification_devices(id) on delete set null,
  expo_push_token text not null,
  ticket_id text,
  status text not null check (status in ('accepted', 'delivered', 'error')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  unique (outbox_id, expo_push_token)
);

create index if not exists push_notification_deliveries_receipt_idx
on public.push_notification_deliveries (created_at)
where status = 'accepted' and checked_at is null and ticket_id is not null;

alter table public.push_notification_deliveries enable row level security;
revoke all on table public.push_notification_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.push_notification_deliveries to service_role;
grant usage, select on sequence public.push_notification_deliveries_id_seq to service_role;

create or replace function public.register_my_push_device(
  p_expo_push_token text,
  p_platform text,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  device_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to register notifications';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'Unsupported notification platform';
  end if;
  if p_expo_push_token !~ '^(Expo|Exponent)PushToken\\[[^]]+\\]$' then
    raise exception 'Invalid Expo push token';
  end if;

  insert into public.push_notification_devices (
    user_id,
    expo_push_token,
    platform,
    app_version,
    enabled,
    updated_at,
    last_seen_at
  )
  values (
    current_user_id,
    p_expo_push_token,
    p_platform,
    nullif(btrim(p_app_version), ''),
    true,
    now(),
    now()
  )
  on conflict (expo_push_token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      app_version = excluded.app_version,
      enabled = true,
      updated_at = now(),
      last_seen_at = now()
  returning id into device_id;

  return device_id;
end;
$$;

revoke all on function public.register_my_push_device(text, text, text)
from public, anon, authenticated;
grant execute on function public.register_my_push_device(text, text, text)
to authenticated;

create or replace function public.unregister_my_push_device(p_expo_push_token text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.push_notification_devices
  set enabled = false,
      updated_at = now()
  where user_id = auth.uid()
    and expo_push_token = p_expo_push_token;
$$;

revoke all on function public.unregister_my_push_device(text)
from public, anon, authenticated;
grant execute on function public.unregister_my_push_device(text)
to authenticated;

-- Device writes go through the ownership-checking RPCs above.
revoke insert, update, delete on table public.push_notification_devices from authenticated;

create or replace function public.claim_notification_outbox(p_limit integer default 50)
returns setof public.notification_outbox
language sql
security definer
set search_path = public, pg_temp
as $$
  with pending as (
    select id
    from public.notification_outbox
    where processed_at is null
      and attempt_count < 5
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    for update skip locked
  )
  update public.notification_outbox as jobs
  set claimed_at = now(),
      attempt_count = jobs.attempt_count + 1,
      last_error = null
  from pending
  where jobs.id = pending.id
  returning jobs.*;
$$;

revoke all on function public.claim_notification_outbox(integer)
from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(integer) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'kopipow_push_worker_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'kopipow_push_worker_secret',
      'Authenticates database calls to the KopiPow push notification Edge Function.'
    );
  end if;
  if not exists (select 1 from vault.secrets where name = 'kopipow_push_worker_url') then
    perform vault.create_secret(
      'https://ybzemsrphnctgvderbwq.supabase.co/functions/v1/send-push-notification',
      'kopipow_push_worker_url',
      'KopiPow push notification Edge Function URL.'
    );
  end if;
end;
$$;

create or replace function public.verify_push_worker_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select char_length(coalesce(p_secret, '')) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'kopipow_push_worker_secret'
        and decrypted_secret = p_secret
    );
$$;

revoke all on function public.verify_push_worker_secret(text)
from public, anon, authenticated;
grant execute on function public.verify_push_worker_secret(text) to service_role;

create or replace function public.queue_order_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notification_title text;
  notification_body text;
  short_order_id text := upper(left(replace(new.id::text, '-', ''), 8));
begin
  -- Walk-in orders and preserved accounting rows have no customer to notify.
  if new.user_id is null then
    return new;
  end if;

  if old.status is distinct from new.status then
    notification_title := case new.status
      when 'confirmed' then 'Order confirmed'
      when 'preparing' then 'Your order is being prepared'
      when 'ready' then 'Your order is ready!'
      when 'completed' then 'Order completed'
      when 'cancelled' then 'Order cancelled'
      else 'Order update'
    end;
    notification_body := case new.status
      when 'confirmed' then format('Order #%s has been confirmed.', short_order_id)
      when 'preparing' then format('We are preparing order #%s now.', short_order_id)
      when 'ready' then format('Order #%s is ready for pickup.', short_order_id)
      when 'completed' then format('Order #%s has been completed. Enjoy your KopiPow!', short_order_id)
      when 'cancelled' then format('Order #%s was cancelled. Open the app for details.', short_order_id)
      else format('Order #%s is now %s.', short_order_id, replace(new.status, '_', ' '))
    end;
  elsif old.payment_status is distinct from new.payment_status then
    notification_title := case new.payment_status
      when 'paid' then 'Payment confirmed'
      when 'failed' then 'Payment failed'
      when 'expired' then 'Payment expired'
      when 'refunded' then 'Payment refunded'
      else 'Payment update'
    end;
    notification_body := case new.payment_status
      when 'paid' then format('Payment for order #%s was successful.', short_order_id)
      when 'failed' then format('Payment for order #%s was not completed.', short_order_id)
      when 'expired' then format('The payment window for order #%s expired.', short_order_id)
      when 'refunded' then format('Payment for order #%s was refunded.', short_order_id)
      else format('Payment for order #%s is now %s.', short_order_id, replace(new.payment_status, '_', ' '))
    end;
  else
    return new;
  end if;

  insert into public.notification_outbox (user_id, category, title, body, data)
  values (
    new.user_id,
    'order',
    notification_title,
    notification_body,
    jsonb_build_object(
      'category', 'order',
      'screen', 'order-history',
      'orderId', new.id,
      'orderStatus', new.status,
      'paymentStatus', new.payment_status
    )
  );
  return new;
end;
$$;

revoke all on function public.queue_order_push_notification()
from public, anon, authenticated;
alter table public.orders enable trigger queue_order_push_notification;

create or replace function public.queue_new_online_order_for_operations()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  short_order_id text := upper(left(replace(new.id::text, '-', ''), 8));
begin
  if new.user_id is null then
    return new;
  end if;

  insert into public.notification_outbox (user_id, category, title, body, data)
  values (
    new.user_id,
    'order',
    'Order received',
    format('We received order #%s.', short_order_id),
    jsonb_build_object(
      'category', 'order',
      'screen', 'order-history',
      'orderId', new.id,
      'orderStatus', new.status,
      'paymentStatus', new.payment_status
    )
  );

  insert into public.notification_outbox (user_id, category, title, body, data)
  select
    roles.user_id,
    'order',
    'New online order',
    format('Order #%s · Rp %s', short_order_id, to_char(new.total, 'FM999G999G999')),
    jsonb_build_object(
      'category', 'order',
      'screen', 'operations-orders',
      'orderId', new.id,
      'branchId', new.branch_id
    )
  from public.user_roles as roles
  where roles.enabled
    and (
      roles.role = 'admin'
      or (roles.role = 'staff' and roles.branch_id = new.branch_id)
    );

  return new;
end;
$$;

revoke all on function public.queue_new_online_order_for_operations()
from public, anon, authenticated;
drop trigger if exists queue_new_online_order_for_operations on public.orders;
create trigger queue_new_online_order_for_operations
after insert on public.orders
for each row execute function public.queue_new_online_order_for_operations();

create or replace function public.wake_push_notification_worker()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  worker_url text;
  worker_secret text;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets
  where name = 'kopipow_push_worker_url';

  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'kopipow_push_worker_secret';

  if worker_url is not null and worker_secret is not null then
    perform net.http_post(
      url := worker_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-worker-key', worker_secret
      ),
      body := '{}'::jsonb
    );
  end if;
  return null;
end;
$$;

revoke all on function public.wake_push_notification_worker()
from public, anon, authenticated;
drop trigger if exists wake_push_notification_worker on public.notification_outbox;
create trigger wake_push_notification_worker
after insert on public.notification_outbox
for each statement execute function public.wake_push_notification_worker();

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'kopipow-push-notification-retry';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'kopipow-push-notification-retry',
    '* * * * *',
    $cron$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'kopipow_push_worker_url'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-push-worker-key', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'kopipow_push_worker_secret'
          )
        ),
        body := '{}'::jsonb
      );
    $cron$
  );
end;
$$;

comment on table public.push_notification_deliveries is
  'Server-only delivery tickets and receipts for KopiPow push notifications.';
