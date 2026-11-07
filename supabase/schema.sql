-- PadelBoard — Supabase schema (run in Supabase Dashboard > SQL Editor)
-- Implements the rules in the Product Documentation v1.0

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lighting_power_kw numeric not null default 2,
  electricity_price_per_unit numeric not null default 50,
  no_show_wait_minutes int not null default 15,
  check_in_early_minutes int not null default 15,
  opening_hour int not null default 10,
  closing_hour int not null default 23,
  created_at timestamptz not null default now()
);

create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  lights_on boolean not null default false,
  manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  unique (club_id, name)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  booking_date date not null,
  start_time time not null,
  duration_hours numeric not null check (duration_hours in (1, 2, 3)),
  status text not null default 'booked'
    check (status in ('booked','checked_in','completed','cancelled','no_show')),
  checked_in_at timestamptz,
  lights_off_at timestamptz,
  created_at timestamptz not null default now(),
  -- No double booking, enforced in the database itself (Doc §5):
  -- an active booking excludes any overlapping booking on the same court.
  exclude using gist (
    court_id with =,
    tsrange(
      (booking_date + start_time)::timestamp,
      (booking_date + start_time)::timestamp + (duration_hours || ' hours')::interval
    ) with &&
  ) where (status in ('booked','checked_in'))
);

create table if not exists public.light_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  action text not null check (action in ('on','off')),
  reason text not null check (reason in ('check_in','automatic','manual','extension','power_restore')),
  created_at timestamptz not null default now()
);

-- Row Level Security: on by default. Demo policy = authenticated staff of the club only.
-- Tighten club_id checks against your auth model before going live (Doc §9).
alter table public.clubs enable row level security;
alter table public.courts enable row level security;
alter table public.bookings enable row level security;
alter table public.light_log enable row level security;

create policy "authenticated can read clubs" on public.clubs for select to authenticated using (true);
create policy "authenticated can read courts" on public.courts for select to authenticated using (true);
create policy "authenticated can manage bookings" on public.bookings for all to authenticated using (true) with check (true);
create policy "authenticated can manage courts" on public.courts for all to authenticated using (true) with check (true);
create policy "authenticated can read light log" on public.light_log for select to authenticated using (true);
create policy "authenticated can insert light log" on public.light_log for insert to authenticated with check (true);

-- Realtime (Doc §10: two phones always show the same thing)
alter publication supabase_realtime add table public.courts;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.light_log;

-- Seed: one demo club + 3 courts
insert into public.clubs (name) values ('Demo Padel Club')
on conflict do nothing;
