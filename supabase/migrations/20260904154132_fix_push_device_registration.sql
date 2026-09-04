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
  if char_length(p_expo_push_token) not between 20 and 512
    or p_expo_push_token !~ '^(Expo|Exponent)PushToken[[][^]]+[]]$'
  then
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
