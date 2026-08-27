create or replace function public.reject_new_orders_during_maintenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.app_config
    where id = 'global'
      and maintenance_enabled = true
  ) then
    raise exception 'KopiPow is currently under maintenance. Your cart is safe; please try again later.';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_new_orders_during_maintenance on public.orders;
create trigger reject_new_orders_during_maintenance
before insert on public.orders
for each row
execute function public.reject_new_orders_during_maintenance();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_config'
  ) then
    alter publication supabase_realtime add table public.app_config;
  end if;
end;
$$;

comment on function public.reject_new_orders_during_maintenance() is
  'Blocks only new order creation during maintenance. Existing orders, payment synchronization, and Midtrans webhooks remain available.';
