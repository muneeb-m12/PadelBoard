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
  -- Changeover grace: with a consecutive booking on the same court (starting
  -- at the session end or within this many minutes after it), lights hold on
  -- past the end waiting for the next team. Lights state only — never a
  -- session extension — and never applies without a next booking. 0 = off.
  changeover_grace_minutes int not null default 3,
  check_in_early_minutes int not null default 15,
  court_rate_per_hour numeric not null default 4800,
  default_advance_amount int not null default 1000,
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
  duration_minutes int not null check (duration_minutes > 0),
  -- Free minutes granted when a delay was the club's fault. The session end is
  -- anchored to the booked end: start_time + duration_minutes + comp_minutes
  -- (paid extensions add to duration_minutes; check-in time never moves the
  -- end). comp_minutes is deliberately separate: it never changes total_amount
  -- and never re-splits booking_shares, and it is NOT part of the exclusion
  -- range below — the club absorbs a comp overrun.
  comp_minutes int not null default 0 check (comp_minutes >= 0),
  status text not null default 'booked'
    check (status in ('booked','checked_in','completed','cancelled','no_show')),
  total_amount numeric not null default 0,
  -- Advance + balance (Pakistan custom: part advance at booking, balance
  -- after the match). The advance is one organizer payment; booking_shares
  -- split only the balance (total_amount - advance_amount).
  advance_amount numeric not null default 0,
  advance_paid boolean not null default false,
  advance_method text check (advance_method in ('cash','jazzcash','easypaisa','card')),
  advance_paid_at timestamptz,
  split_payment boolean not null default false,
  checked_in_at timestamptz,
  -- Set at check-in to the session end: (booking_date + start_time) +
  -- duration_minutes + comp_minutes. The cron switch-off compares against it.
  lights_off_at timestamptz,
  created_at timestamptz not null default now(),
  -- No double booking, enforced in the database itself (Doc §5):
  -- an active booking excludes any overlapping booking on the same court.
  exclude using gist (
    court_id with =,
    tsrange(
      (booking_date + start_time)::timestamp,
      (booking_date + start_time)::timestamp + (duration_minutes || ' minutes')::interval
    ) with &&
  ) where (status in ('booked','checked_in'))
);

-- Split payment: one row per player share of a booking's court fee.
-- Shares of a booking sum to bookings.total_amount - bookings.advance_amount
-- (the advance is a single organizer payment, not a share). Stage 1 (prototype):
-- staff mark a share paid when money lands on the club's own JazzCash /
-- Easypaisa / cash; Stage 2 replaces the manual mark with gateway webhooks.
create table if not exists public.booking_shares (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  player_name text not null,
  player_phone text not null,
  amount_due numeric not null check (amount_due >= 0),
  paid boolean not null default false,
  method text check (method in ('cash','jazzcash','easypaisa','card')),
  paid_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.light_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  -- 'arrived' is not a switch event: it records an early check-in (arrival
  -- registered, lights still off — they turn on at the booked start, which
  -- gets its own 'on' row). Light-hours maths must ignore 'arrived' rows.
  action text not null check (action in ('on','off','arrived')),
  reason text not null check (reason in ('check_in','automatic','manual','extension','power_restore','club_delay','changeover')),
  -- Free-text detail for the history line; club-delay grants record e.g. 'Club delay +10 min' here,
  -- and a 'changeover' off records 'Changeover grace expired — next team did not check in'.
  note text,
  created_at timestamptz not null default now()
);

-- Row Level Security: on by default. Demo policy = authenticated staff of the club only.
-- Tighten club_id checks against your auth model before going live (Doc §9).
alter table public.clubs enable row level security;
alter table public.courts enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_shares enable row level security;
alter table public.light_log enable row level security;

create policy "authenticated can read clubs" on public.clubs for select to authenticated using (true);
create policy "authenticated can read courts" on public.courts for select to authenticated using (true);
create policy "authenticated can manage bookings" on public.bookings for all to authenticated using (true) with check (true);
create policy "authenticated can manage booking shares" on public.booking_shares for all to authenticated using (true) with check (true);
create policy "authenticated can manage courts" on public.courts for all to authenticated using (true) with check (true);
create policy "authenticated can read light log" on public.light_log for select to authenticated using (true);
create policy "authenticated can insert light log" on public.light_log for insert to authenticated with check (true);

-- Realtime (Doc §10: two phones always show the same thing)
alter publication supabase_realtime add table public.courts;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.booking_shares;
alter publication supabase_realtime add table public.light_log;

-- Seed: one demo club + 3 courts
insert into public.clubs (name) values ('Demo Padel Club')
on conflict do nothing;
