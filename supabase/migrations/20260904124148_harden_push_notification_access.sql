-- Keep all notification queue and delivery details server-only, while allowing
-- signed-in users to see only their own registered devices.

create index if not exists push_notification_deliveries_device_idx
on public.push_notification_deliveries (device_id)
where device_id is not null;

drop policy if exists "Users can read their notification devices"
on public.push_notification_devices;
create policy "Users can read their notification devices"
on public.push_notification_devices
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can register their notification devices"
on public.push_notification_devices;
drop policy if exists "Users can update their notification devices"
on public.push_notification_devices;
drop policy if exists "Users can remove their notification devices"
on public.push_notification_devices;

drop policy if exists "Notification outbox is server only"
on public.notification_outbox;
create policy "Notification outbox is server only"
on public.notification_outbox
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "Notification deliveries are server only"
on public.push_notification_deliveries;
create policy "Notification deliveries are server only"
on public.push_notification_deliveries
for all
to anon, authenticated
using (false)
with check (false);
