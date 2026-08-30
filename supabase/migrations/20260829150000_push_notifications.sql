create table if not exists public.push_notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  app_version text,
  enabled boolean not null default true,
  order_updates_enabled boolean not null default true,
  news_enabled boolean not null default true,
  general_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_notification_devices_user_idx
on public.push_notification_devices (user_id)
where enabled;

alter table public.push_notification_devices enable row level security;

drop policy if exists "Users can read their notification devices" on public.push_notification_devices;
create policy "Users can read their notification devices"
on public.push_notification_devices for select
using (auth.uid() = user_id);

drop policy if exists "Users can register their notification devices" on public.push_notification_devices;
create policy "Users can register their notification devices"
on public.push_notification_devices for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their notification devices" on public.push_notification_devices;
create policy "Users can update their notification devices"
on public.push_notification_devices for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can remove their notification devices" on public.push_notification_devices;
create policy "Users can remove their notification devices"
on public.push_notification_devices for delete
using (auth.uid() = user_id);

grant select, insert, update, delete on table public.push_notification_devices to authenticated;

create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('order', 'news', 'general')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count integer not null default 0,
  last_error text
);

create index if not exists notification_outbox_pending_idx
on public.notification_outbox (created_at)
where processed_at is null;

alter table public.notification_outbox enable row level security;
revoke all on table public.notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_outbox to service_role;
grant usage, select on sequence public.notification_outbox_id_seq to service_role;

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

drop trigger if exists queue_order_push_notification on public.orders;
create trigger queue_order_push_notification
after update of status, payment_status on public.orders
for each row
when (
  old.status is distinct from new.status
  or old.payment_status is distinct from new.payment_status
)
execute function public.queue_order_push_notification();

revoke all on function public.queue_order_push_notification() from public, anon, authenticated;

create or replace function public.queue_broadcast_push_notification(
  p_category text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  queued_count integer;
begin
  if p_category not in ('news', 'general') then
    raise exception 'Broadcast category must be news or general';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then
    raise exception 'Notification title must contain 1 to 120 characters';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 500 then
    raise exception 'Notification body must contain 1 to 500 characters';
  end if;

  insert into public.notification_outbox (user_id, category, title, body, data)
  select
    devices.user_id,
    p_category,
    btrim(p_title),
    btrim(p_body),
    coalesce(p_data, '{}'::jsonb) || jsonb_build_object('category', p_category)
  from (
    select distinct user_id
    from public.push_notification_devices
    where enabled
      and case p_category
        when 'news' then news_enabled
        else general_enabled
      end
  ) as devices;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

revoke all on function public.queue_broadcast_push_notification(text, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.queue_broadcast_push_notification(text, text, text, jsonb)
to service_role;

comment on table public.notification_outbox is
  'Durable internal queue for order, news, and general push notification jobs.';

