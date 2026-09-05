-- Allow signed-in users to change only their own notification preference
-- columns. Device identity, ownership, platform, and token remain protected.

drop policy if exists "Users can update their notification preferences"
on public.push_notification_devices;

create policy "Users can update their notification preferences"
on public.push_notification_devices
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke update on table public.push_notification_devices from authenticated;
grant update (
  order_updates_enabled,
  news_enabled,
  general_enabled
) on public.push_notification_devices to authenticated;
