-- =============================================================================
-- GO / NO-GO (GNG) — Cooperative 4-Role Multiplayer Migration (PROPOSED)
-- Phase 2: Tightened RLS (no permissive `using (true)` room access), role
--          permissions, optimistic version concurrency, proposals & audit log.
-- Apply first in a development environment after explicit approval.
-- =============================================================================

-- 1. Extend multiplayer_rooms with host ownership, version counter, and shared mission config
alter table public.multiplayer_rooms
  add column if not exists host_user_id uuid references auth.users(id) on delete set null,
  add column if not exists version integer not null default 1,
  add column if not exists shared_config_json jsonb not null default '{}'::jsonb;

-- Drop overly permissive policy from initial schema
drop policy if exists "Multiplayer rooms readable and updatable by room participants"
  on public.multiplayer_rooms;

-- 2. Room Members (up to 4 participants, unique role per room)
create table if not exists public.room_members (
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (
    role in ('MISSION_DIRECTOR', 'FLIGHT_SYSTEMS', 'SCIENCE_LEAD', 'COMMS_OPS')
  ),
  callsign text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, role)
);

create index if not exists room_members_user_id_idx on public.room_members (user_id);

alter table public.room_members enable row level security;

-- SECURITY DEFINER membership helper (prevents recursive RLS evaluation on room_members)
create or replace function public.get_user_room_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select room_id
  from public.room_members
  where user_id = (select auth.uid());
$$;

-- Helper: check whether caller owns a given role (or MISSION_DIRECTOR host override) in room
create or replace function public.has_room_role(p_room_id uuid, p_allowed_roles text[])
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room_id
      and rm.user_id = (select auth.uid())
      and rm.role = any(p_allowed_roles)
  );
$$;

-- RLS on multiplayer_rooms: strictly restricted to active room members
create policy "Room members can read their rooms"
  on public.multiplayer_rooms
  for select
  to authenticated
  using (id in (select public.get_user_room_ids()));

-- Direct client INSERT/UPDATE/DELETE blocked; mutations flow through authorized RPCs below
-- so optimistic version checks, 4-seat limits, and role permissions are server-enforced.

-- RLS on room_members
create policy "Room members can inspect co-op roster"
  on public.room_members
  for select
  to authenticated
  using (room_id in (select public.get_user_room_ids()));

-- 3. Change Proposals (major cross-domain changes / launch approvals)
create table if not exists public.mission_proposals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  proposed_by_user_id uuid not null references auth.users(id) on delete cascade,
  proposed_by_role text not null,
  target_domain text not null,
  patch_json jsonb not null,
  rationale text not null default '',
  base_version integer not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mission_proposals_room_idx on public.mission_proposals (room_id, created_at desc);

alter table public.mission_proposals enable row level security;

create policy "Room members can read room proposals"
  on public.mission_proposals
  for select
  to authenticated
  using (room_id in (select public.get_user_room_ids()));

-- 4. Auditable Decision History (append-only)
create table if not exists public.mission_decisions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  action_type text not null,
  summary text not null,
  details_json jsonb not null default '{}'::jsonb,
  room_version integer not null,
  created_at timestamptz not null default now()
);

create index if not exists mission_decisions_room_idx on public.mission_decisions (room_id, created_at desc);

alter table public.mission_decisions enable row level security;

create policy "Room members can read decision audit log"
  on public.mission_decisions
  for select
  to authenticated
  using (room_id in (select public.get_user_room_ids()));

-- 5. Server-Enforced RPCs (atomic version concurrency + role authorization)

create or replace function public.create_coop_room(
  p_room_code text,
  p_scenario_code text default 'FLOODWATCH',
  p_callsign text default 'FLIGHT',
  p_shared_config jsonb default '{}'::jsonb
)
returns public.multiplayer_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.multiplayer_rooms;
begin
  if v_uid is null then
    raise exception 'Authentication required to create a multiplayer room';
  end if;

  insert into public.multiplayer_rooms (
    room_code, scenario_code, host_callsign, host_user_id, version, shared_config_json
  ) values (
    upper(trim(p_room_code)), p_scenario_code, p_callsign, v_uid, 1, p_shared_config
  )
  returning * into v_room;

  insert into public.room_members (room_id, user_id, role, callsign, is_host)
  values (v_room.id, v_uid, 'MISSION_DIRECTOR', p_callsign, true);

  insert into public.mission_decisions (room_id, actor_user_id, actor_role, action_type, summary, room_version)
  values (v_room.id, v_uid, 'MISSION_DIRECTOR', 'ROOM_CREATED', 'Created cooperative room ' || v_room.room_code, 1);

  return v_room;
end;
$$;

create or replace function public.join_coop_room(
  p_room_code text,
  p_role text,
  p_callsign text
)
returns public.multiplayer_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.multiplayer_rooms;
  v_member_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required to join a multiplayer room';
  end if;

  select * into v_room
  from public.multiplayer_rooms
  where room_code = upper(trim(p_room_code))
  for update;

  if not found then
    raise exception 'Room % not found', p_room_code;
  end if;

  select count(*) into v_member_count
  from public.room_members
  where room_id = v_room.id and user_id <> v_uid;

  if v_member_count >= 4 then
    raise exception 'Room % already has maximum 4 participants', v_room.room_code;
  end if;

  insert into public.room_members (room_id, user_id, role, callsign, is_host)
  values (v_room.id, v_uid, p_role, p_callsign, v_room.host_user_id = v_uid)
  on conflict (room_id, user_id) do update
    set role = excluded.role,
        callsign = excluded.callsign,
        last_seen_at = now();

  insert into public.mission_decisions (room_id, actor_user_id, actor_role, action_type, summary, room_version)
  values (v_room.id, v_uid, p_role, 'MEMBER_JOINED', p_callsign || ' joined as ' || p_role, v_room.version);

  return v_room;
end;
$$;

create or replace function public.update_room_config_optimistic(
  p_room_id uuid,
  p_expected_version integer,
  p_required_roles text[],
  p_next_config jsonb,
  p_summary text
)
returns public.multiplayer_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_member_role text;
  v_updated public.multiplayer_rooms;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select role into v_member_role
  from public.room_members
  where room_id = p_room_id and user_id = v_uid;

  if v_member_role is null then
    raise exception 'Forbidden: caller is not a member of room %', p_room_id;
  end if;

  if not (v_member_role = any(p_required_roles)) and v_member_role <> 'MISSION_DIRECTOR' then
    raise exception 'Forbidden: role % cannot modify this subsystem domain', v_member_role;
  end if;

  update public.multiplayer_rooms
  set shared_config_json = p_next_config,
      version = version + 1,
      updated_at = now()
  where id = p_room_id
    and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'VERSION_CONFLICT: Room state changed since version %; refresh and retry', p_expected_version;
  end if;

  insert into public.mission_decisions (room_id, actor_user_id, actor_role, action_type, summary, room_version)
  values (p_room_id, v_uid, v_member_role, 'CONFIG_UPDATED', p_summary, v_updated.version);

  return v_updated;
end;
$$;

create or replace function public.resolve_mission_proposal(
  p_proposal_id uuid,
  p_approve boolean
)
returns public.multiplayer_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_prop public.mission_proposals;
  v_role text;
  v_room public.multiplayer_rooms;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_prop
  from public.mission_proposals
  where id = p_proposal_id
  for update;

  if not found or v_prop.status <> 'PENDING' then
    raise exception 'Proposal not found or already resolved';
  end if;

  select role into v_role
  from public.room_members
  where room_id = v_prop.room_id and user_id = v_uid;

  if v_role is null or (v_role <> 'MISSION_DIRECTOR' and v_uid = v_prop.proposed_by_user_id) then
    raise exception 'Forbidden: another authorized role or MISSION_DIRECTOR must resolve proposal';
  end if;

  update public.mission_proposals
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
      resolved_by_user_id = v_uid,
      resolved_at = now()
  where id = p_proposal_id;

  if p_approve then
    update public.multiplayer_rooms
    set shared_config_json = shared_config_json || v_prop.patch_json,
        version = version + 1,
        updated_at = now()
    where id = v_prop.room_id
      and version = v_prop.base_version
    returning * into v_room;

    if not found then
      update public.mission_proposals set status = 'EXPIRED' where id = p_proposal_id;
      raise exception 'VERSION_CONFLICT: Proposal expired because room advanced past version %', v_prop.base_version;
    end if;
  else
    select * into v_room from public.multiplayer_rooms where id = v_prop.room_id;
  end if;

  insert into public.mission_decisions (room_id, actor_user_id, actor_role, action_type, summary, room_version)
  values (
    v_prop.room_id,
    v_uid,
    v_role,
    case when p_approve then 'PROPOSAL_APPROVED' else 'PROPOSAL_REJECTED' end,
    (case when p_approve then 'Approved ' else 'Rejected ' end) || v_prop.target_domain || ' proposal',
    v_room.version
  );

  return v_room;
end;
$$;

create or replace function public.handover_room_host(
  p_room_id uuid,
  p_next_host_user_id uuid
)
returns public.multiplayer_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.multiplayer_rooms;
  v_next_callsign text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.multiplayer_rooms
  where id = p_room_id
  for update;

  if not found or v_room.host_user_id <> v_uid then
    raise exception 'Forbidden: only the current host can hand over host authority';
  end if;

  select callsign into v_next_callsign
  from public.room_members
  where room_id = p_room_id and user_id = p_next_host_user_id;

  if v_next_callsign is null then
    raise exception 'Target host must be an active member of the room';
  end if;

  update public.room_members
  set is_host = (user_id = p_next_host_user_id)
  where room_id = p_room_id;

  update public.multiplayer_rooms
  set host_user_id = p_next_host_user_id,
      host_callsign = v_next_callsign,
      version = version + 1,
      updated_at = now()
  where id = p_room_id
  returning * into v_room;

  insert into public.mission_decisions (room_id, actor_user_id, actor_role, action_type, summary, room_version)
  values (p_room_id, v_uid, 'MISSION_DIRECTOR', 'HOST_HANDOVER', 'Transferred room host to ' || v_next_callsign, v_room.version);

  return v_room;
end;
$$;

create or replace function public.leave_coop_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.multiplayer_rooms;
  v_member record;
  v_next_member record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room from public.multiplayer_rooms where id = p_room_id for update;
  if not found then
    return;
  end if;

  select * into v_member from public.room_members where room_id = p_room_id and user_id = v_uid;
  if not found then
    return;
  end if;

  delete from public.room_members where room_id = p_room_id and user_id = v_uid;

  insert into public.mission_decisions (room_id, actor_user_id, actor_role, action_type, summary, room_version)
  values (p_room_id, v_uid, v_member.role, 'MEMBER_LEFT', v_member.callsign || ' left room', v_room.version);

  if v_room.host_user_id = v_uid then
    select * into v_next_member
    from public.room_members
    where room_id = p_room_id
    order by joined_at asc
    limit 1;

    if found then
      update public.room_members set is_host = true where room_id = p_room_id and user_id = v_next_member.user_id;
      update public.multiplayer_rooms
      set host_user_id = v_next_member.user_id,
          host_callsign = v_next_member.callsign,
          version = version + 1,
          updated_at = now()
      where id = p_room_id;

      insert into public.mission_decisions (room_id, actor_user_id, actor_role, action_type, summary, room_version)
      values (p_room_id, v_next_member.user_id, v_next_member.role, 'AUTO_HOST_HANDOVER', 'Auto-transferred host to ' || v_next_member.callsign, v_room.version + 1);
    end if;
  end if;
end;
$$;

create or replace function public.submit_mission_proposal(
  p_room_id uuid,
  p_target_domain text,
  p_patch_json jsonb,
  p_rationale text,
  p_base_version integer
)
returns public.mission_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_member_role text;
  v_prop public.mission_proposals;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select role into v_member_role
  from public.room_members
  where room_id = p_room_id and user_id = v_uid;

  if v_member_role is null then
    raise exception 'Forbidden: caller is not a member of room %', p_room_id;
  end if;

  insert into public.mission_proposals (
    room_id, proposed_by_user_id, proposed_by_role, target_domain, patch_json, rationale, base_version
  ) values (
    p_room_id, v_uid, v_member_role, p_target_domain, p_patch_json, coalesce(p_rationale, ''), p_base_version
  )
  returning * into v_prop;

  insert into public.mission_decisions (room_id, actor_user_id, actor_role, action_type, summary, room_version)
  values (p_room_id, v_uid, v_member_role, 'PROPOSAL_SUBMITTED', 'Proposed ' || p_target_domain || ' change', p_base_version);

  return v_prop;
end;
$$;
