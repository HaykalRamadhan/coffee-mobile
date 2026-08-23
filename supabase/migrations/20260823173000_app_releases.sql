create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('android')),
  version_name text not null check (length(trim(version_name)) between 1 and 40),
  version_code integer not null check (version_code > 0),
  apk_url text not null check (apk_url ~ '^https://'),
  release_notes text not null default '',
  is_mandatory boolean not null default false,
  is_active boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (platform, version_code)
);

alter table public.app_releases enable row level security;

revoke all on table public.app_releases from anon, authenticated;
grant select on table public.app_releases to anon, authenticated;

drop policy if exists "Anyone can read active app releases" on public.app_releases;
create policy "Anyone can read active app releases"
on public.app_releases
for select
to anon, authenticated
using (is_active = true and published_at <= now());

create index if not exists app_releases_latest_idx
on public.app_releases (platform, version_code desc)
where is_active = true;

comment on table public.app_releases is
  'Public, read-only release manifest used by installed KopiPow apps to discover signed APK updates.';
