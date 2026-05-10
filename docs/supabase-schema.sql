create table if not exists public.work_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  status text not null default 'todo',
  priority text not null default 'normal',
  tags text[] not null default array[]::text[],
  started_at timestamptz,
  ended_at timestamptz,
  note text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_records enable row level security;

drop policy if exists users_can_read_own_work_records on public.work_records;
drop policy if exists users_can_insert_own_work_records on public.work_records;
drop policy if exists users_can_update_own_work_records on public.work_records;
drop policy if exists users_can_delete_own_work_records on public.work_records;

create policy users_can_read_own_work_records
on public.work_records
for select
using (auth.uid() = user_id);

create policy users_can_insert_own_work_records
on public.work_records
for insert
with check (auth.uid() = user_id);

create policy users_can_update_own_work_records
on public.work_records
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy users_can_delete_own_work_records
on public.work_records
for delete
using (auth.uid() = user_id);

create index if not exists work_records_user_created_idx
on public.work_records(user_id, created_at desc);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.user_profiles enable row level security;

drop policy if exists users_can_read_own_profile on public.user_profiles;
drop policy if exists users_can_insert_own_profile on public.user_profiles;
drop policy if exists users_can_update_own_profile on public.user_profiles;

create policy users_can_read_own_profile
on public.user_profiles
for select
using (auth.uid() = user_id);

create policy users_can_insert_own_profile
on public.user_profiles
for insert
with check (auth.uid() = user_id);

create policy users_can_update_own_profile
on public.user_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  opacity numeric not null default 0.92,
  always_on_top boolean not null default true,
  collapsed boolean not null default false,
  popup_shortcut text not null default 'CommandOrControl+Alt+W',
  storage_mode text not null default 'supabase',
  data_dir text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists users_can_read_own_settings on public.user_settings;
drop policy if exists users_can_insert_own_settings on public.user_settings;
drop policy if exists users_can_update_own_settings on public.user_settings;

create policy users_can_read_own_settings
on public.user_settings
for select
using (auth.uid() = user_id);

create policy users_can_insert_own_settings
on public.user_settings
for insert
with check (auth.uid() = user_id);

create policy users_can_update_own_settings
on public.user_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
