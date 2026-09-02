create table if not exists public.app_config (
  id text primary key,
  maintenance_enabled boolean not null default false,
  maintenance_message text not null default
    'We are tuning the machines and charging up something better. Please check back shortly.',
  updated_at timestamptz not null default now()
);

insert into public.app_config (id, maintenance_enabled)
values ('global', false)
on conflict (id) do nothing;

alter table public.app_config enable row level security;

revoke all on table public.app_config from anon, authenticated;
grant select on table public.app_config to anon, authenticated;

drop policy if exists "Anyone can read the public app configuration" on public.app_config;
create policy "Anyone can read the public app configuration"
on public.app_config
for select
to anon, authenticated
using (id = 'global');

comment on table public.app_config is
  'Public, read-only runtime configuration used by installed KopiPow apps before sign-in.';

comment on column public.app_config.maintenance_enabled is
  'Remote maintenance switch. Change only from the Supabase dashboard or a trusted backend.';
