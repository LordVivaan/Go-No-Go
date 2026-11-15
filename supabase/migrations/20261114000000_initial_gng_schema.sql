-- =============================================================================
-- GO / NO-GO (GNG) — Production PostgreSQL Schema & Row-Level Security (RLS)
-- Reconciles README Section 8 ("Supabase Architecture") with generated types
-- =============================================================================

create extension if not exists "pgcrypto";

-- 1. Player Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  callsign text not null default 'FLIGHT-01',
  agency_name text not null default 'GNG Space Operations',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- 2. Mission Scenarios Catalog
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  celestial_body text not null check (celestial_body in ('EARTH', 'MOON', 'MARS', 'ASTEROID')),
  risk_class text not null check (risk_class in ('A', 'B', 'C', 'D')),
  budget_cap_musd numeric(8,2) not null,
  design_life_years numeric(5,2) not null default 3.0,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.missions enable row level security;

create policy "Missions are publicly readable"
  on public.missions for select using (true);

-- 3. Saved Spacecraft Configurations (Versioned)
create table if not exists public.mission_configurations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  scenario_code text not null,
  name text not null,
  version integer not null default 1,
  bus_id text not null,
  subsystem_ids text[] not null default '{}',
  instrument_ids text[] not null default '{}',
  orbit_id text not null,
  launch_vehicle_id text not null,
  gate_status text not null check (gate_status in ('GO', 'CAUTION', 'NO_GO')),
  engineering_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.mission_configurations enable row level security;

create policy "Configurations readable by owner or public demo"
  on public.mission_configurations for select
  using (user_id is null or auth.uid() = user_id);

create policy "Configurations insertable by authenticated or anon"
  on public.mission_configurations for insert
  with check (user_id is null or auth.uid() = user_id);

-- 4. Mission Debrief Reports & Scoring History
create table if not exists public.mission_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  scenario_code text not null,
  configuration_name text not null,
  total_score integer not null check (total_score between 0 and 1000),
  grade text not null check (grade in ('S', 'A', 'B', 'C', 'D', 'F')),
  outcome text not null check (outcome in ('SUCCESS', 'PARTIAL_SUCCESS', 'MISSION_LOSS')),
  report_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.mission_reports enable row level security;

create policy "Mission reports are publicly readable"
  on public.mission_reports for select using (true);

create policy "Mission reports insertable by all players"
  on public.mission_reports for insert with check (true);

-- 5. Cooperative Multiplayer Rooms (4-Console Flight Poll)
create table if not exists public.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  scenario_code text not null default 'FLOODWATCH',
  host_callsign text not null default 'FLIGHT',
  overall_poll_status text not null default 'GO',
  console_state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.multiplayer_rooms enable row level security;

create policy "Multiplayer rooms readable and updatable by room participants"
  on public.multiplayer_rooms for all using (true) with check (true);
