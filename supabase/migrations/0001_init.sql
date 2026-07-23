-- ============================================================================
-- Automatic Call Routing & Tracking System — schema (PRD §13 / §14)
-- Single organization MVP. All org-scoped tables carry organization_id and are
-- protected by Row Level Security (PRD §9.1, §18, AC-09).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums (PRD §14 + §6 roles + §9.2 availability)
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('super_admin', 'manager', 'agent', 'auditor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type availability_state as enum ('available', 'busy', 'break', 'offline', 'leave');
exception when duplicate_object then null; end $$;

do $$ begin
  create type call_direction as enum ('inbound', 'outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type call_status as enum
    ('initiated', 'routing', 'ringing', 'answered', 'completed', 'missed', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attempt_status as enum
    ('queued', 'ringing', 'answered', 'busy', 'rejected', 'no_answer', 'failed', 'skipped', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type callback_status as enum
    ('open', 'scheduled', 'in_progress', 'attempted', 'resolved', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type callback_priority as enum ('high', 'medium', 'low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type disposition_type as enum
    ('connected', 'no_answer', 'busy', 'wrong_number', 'follow_up', 'resolved', 'not_interested');
exception when duplicate_object then null; end $$;

do $$ begin
  create type routing_mode as enum ('sequential', 'round_robin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Core tables (PRD §13)
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  timezone     text not null default 'Asia/Kolkata',
  settings     jsonb not null default '{}'::jsonb,
  status       text not null default 'active',
  created_at   timestamptz not null default now()
);

-- profiles.user_id references auth.users; role + org live here.
create table if not exists profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null,
  email           text not null,
  role            user_role not null default 'agent',
  status          text not null default 'active',
  created_at      timestamptz not null default now()
);
create index if not exists profiles_org_idx on profiles (organization_id);
create index if not exists profiles_user_idx on profiles (user_id);

create table if not exists teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null,
  status          text not null default 'active',
  created_at      timestamptz not null default now()
);
create index if not exists teams_org_idx on teams (organization_id);

create table if not exists agents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  profile_id      uuid references profiles (id) on delete set null,
  name            text not null,
  email           text,
  employee_code   text,
  phone           text not null,
  phone_verified  boolean not null default true,
  team_id         uuid references teams (id) on delete set null,
  priority        integer not null default 100,
  ring_timeout    integer not null default 20,           -- seconds (PRD §8)
  availability    availability_state not null default 'offline',
  shift_start     time,
  shift_end       time,
  fallback_owner  boolean not null default false,        -- receives missed-call callbacks
  active          boolean not null default true,         -- deactivate, never delete (§9.2)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists agents_org_idx on agents (organization_id);
create index if not exists agents_priority_idx on agents (organization_id, priority);

create table if not exists routing_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null,
  mode            routing_mode not null default 'sequential',
  ring_timeout    integer not null default 20,
  max_attempts    integer,                               -- null => number of eligible agents
  allow_repeat    boolean not null default false,        -- repeat prevention (PRD §8)
  fallback_message text,
  after_hours_number text,
  notify_manager_on_miss boolean not null default true,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists routing_rules_org_idx on routing_rules (organization_id);

create table if not exists routing_rule_agents (
  id             uuid primary key default gen_random_uuid(),
  rule_id        uuid not null references routing_rules (id) on delete cascade,
  agent_id       uuid not null references agents (id) on delete cascade,
  sequence       integer not null,
  enabled        boolean not null default true,
  timeout_override integer,
  unique (rule_id, agent_id)
);
create index if not exists rra_rule_idx on routing_rule_agents (rule_id, sequence);

create table if not exists business_numbers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  number          text not null,
  label           text,
  routing_rule_id uuid references routing_rules (id) on delete set null,
  status          text not null default 'active',
  created_at      timestamptz not null default now()
);
create index if not exists business_numbers_org_idx on business_numbers (organization_id);

create table if not exists calls (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete cascade,
  provider_call_id  text unique,                          -- idempotency (AC-10)
  direction         call_direction not null,
  caller            text not null,
  destination       text,
  business_number_id uuid references business_numbers (id) on delete set null,
  routing_rule_id   uuid references routing_rules (id) on delete set null,
  status            call_status not null default 'initiated',
  connected_agent_id uuid references agents (id) on delete set null,
  initiated_by_agent_id uuid references agents (id) on delete set null, -- outbound attribution (§7.2, AC-07)
  attempts_count    integer not null default 0,
  talk_seconds      integer not null default 0,
  started_at        timestamptz not null default now(),
  connected_at      timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists calls_org_started_idx on calls (organization_id, started_at desc);
create index if not exists calls_status_idx on calls (organization_id, status);
create index if not exists calls_connected_agent_idx on calls (connected_agent_id);

create table if not exists call_attempts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  call_id         uuid not null references calls (id) on delete cascade,
  agent_id        uuid references agents (id) on delete set null,
  sequence        integer not null,
  provider_leg_id text,
  status          attempt_status not null default 'queued',
  ring_seconds    integer,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);
create index if not exists attempts_call_idx on call_attempts (call_id, sequence);
create index if not exists attempts_agent_idx on call_attempts (agent_id);

create table if not exists recordings (
  id           uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  call_id      uuid not null references calls (id) on delete cascade,
  provider_ref text,                                      -- never a public URL (PRD §18)
  duration     integer,
  access_meta  jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists recordings_call_idx on recordings (call_id);

create table if not exists call_notes (
  id           uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  call_id      uuid not null references calls (id) on delete cascade,
  author_id    uuid references profiles (id) on delete set null,
  note         text,
  disposition  disposition_type,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists call_notes_call_idx on call_notes (call_id);

create table if not exists callbacks (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  call_id       uuid references calls (id) on delete set null,
  caller        text not null,
  owner_agent_id uuid references agents (id) on delete set null,
  team_id       uuid references teams (id) on delete set null,
  priority      callback_priority not null default 'medium',
  status        callback_status not null default 'open',
  due_at        timestamptz not null default now(),
  attempts      integer not null default 0,
  outcome       disposition_type,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists callbacks_org_idx on callbacks (organization_id, status);
create index if not exists callbacks_owner_idx on callbacks (owner_agent_id);
-- one callback per missed inbound journey (PRD §7.3 rule 15)
create unique index if not exists callbacks_unique_per_call
  on callbacks (call_id) where call_id is not null;

create table if not exists business_hours (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  day_of_week     integer not null,                      -- 0=Sun .. 6=Sat
  open_time       time not null default '09:00',
  close_time      time not null default '18:00',
  enabled         boolean not null default true,
  unique (organization_id, day_of_week)
);

create table if not exists holidays (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  holiday_date    date not null,
  label           text,
  fallback_rule   text,
  unique (organization_id, holiday_date)
);

create table if not exists webhook_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid references organizations (id) on delete cascade,
  provider_event_id text not null unique,                -- idempotency key (AC-10, §15)
  event_type        text,
  payload_hash      text,
  payload           jsonb,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  process_status    text not null default 'received',    -- received | processed | failed
  error             text
);

create table if not exists audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  actor_id        uuid references profiles (id) on delete set null,
  actor_name      text,
  action          text not null,
  entity          text not null,
  entity_id       text,
  old_values      jsonb,
  new_values      jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists audit_org_idx on audit_logs (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions used by RLS policies (SECURITY DEFINER to read profile of
-- the current auth user without recursive RLS on profiles).
-- ---------------------------------------------------------------------------
create or replace function current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from profiles where user_id = auth.uid() limit 1;
$$;

create or replace function current_role_name()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid() limit 1;
$$;

create or replace function current_agent_id()
returns uuid language sql stable security definer set search_path = public as $$
  select a.id from agents a
  join profiles p on p.id = a.profile_id
  where p.user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Everyone authenticated is scoped to their organization. Agents are further
-- narrowed to their own calls/callbacks; managers/super_admin/auditor see the
-- whole org. Writes to operational data are restricted to elevated roles;
-- provider-derived call facts stay immutable from the client (§9.3) because the
-- server uses the service-role key which bypasses RLS for webhook processing.
-- ---------------------------------------------------------------------------
alter table organizations      enable row level security;
alter table profiles           enable row level security;
alter table teams              enable row level security;
alter table agents             enable row level security;
alter table routing_rules      enable row level security;
alter table routing_rule_agents enable row level security;
alter table business_numbers   enable row level security;
alter table calls              enable row level security;
alter table call_attempts      enable row level security;
alter table recordings         enable row level security;
alter table call_notes         enable row level security;
alter table callbacks          enable row level security;
alter table business_hours     enable row level security;
alter table holidays           enable row level security;
alter table webhook_events     enable row level security;
alter table audit_logs         enable row level security;

-- organizations: read own org
drop policy if exists org_read on organizations;
create policy org_read on organizations for select using (id = current_org_id());
drop policy if exists org_write on organizations;
create policy org_write on organizations for update using (id = current_org_id() and current_role_name() = 'super_admin');

-- profiles: read own org; self-insert on signup; super_admin manages
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (organization_id = current_org_id());
drop policy if exists profiles_self_insert on profiles;
create policy profiles_self_insert on profiles for insert with check (user_id = auth.uid());
drop policy if exists profiles_admin_write on profiles;
create policy profiles_admin_write on profiles for update
  using (organization_id = current_org_id() and current_role_name() = 'super_admin');

-- generic org-read helper policies
drop policy if exists teams_read on teams;
create policy teams_read on teams for select using (organization_id = current_org_id());
drop policy if exists teams_write on teams;
create policy teams_write on teams for all
  using (organization_id = current_org_id() and current_role_name() in ('super_admin','manager'))
  with check (organization_id = current_org_id() and current_role_name() in ('super_admin','manager'));

drop policy if exists agents_read on agents;
create policy agents_read on agents for select using (organization_id = current_org_id());
drop policy if exists agents_write on agents;
create policy agents_write on agents for all
  using (organization_id = current_org_id() and current_role_name() in ('super_admin','manager'))
  with check (organization_id = current_org_id() and current_role_name() in ('super_admin','manager'));
-- agents may update their own availability row
drop policy if exists agents_self_update on agents;
create policy agents_self_update on agents for update
  using (organization_id = current_org_id() and profile_id in (select id from profiles where user_id = auth.uid()));

drop policy if exists routing_read on routing_rules;
create policy routing_read on routing_rules for select using (organization_id = current_org_id());
drop policy if exists routing_write on routing_rules;
create policy routing_write on routing_rules for all
  using (organization_id = current_org_id() and current_role_name() in ('super_admin','manager'))
  with check (organization_id = current_org_id() and current_role_name() in ('super_admin','manager'));

drop policy if exists rra_read on routing_rule_agents;
create policy rra_read on routing_rule_agents for select
  using (rule_id in (select id from routing_rules where organization_id = current_org_id()));
drop policy if exists rra_write on routing_rule_agents;
create policy rra_write on routing_rule_agents for all
  using (rule_id in (select id from routing_rules where organization_id = current_org_id())
         and current_role_name() in ('super_admin','manager'))
  with check (rule_id in (select id from routing_rules where organization_id = current_org_id())
         and current_role_name() in ('super_admin','manager'));

drop policy if exists numbers_read on business_numbers;
create policy numbers_read on business_numbers for select using (organization_id = current_org_id());
drop policy if exists numbers_write on business_numbers;
create policy numbers_write on business_numbers for all
  using (organization_id = current_org_id() and current_role_name() = 'super_admin')
  with check (organization_id = current_org_id() and current_role_name() = 'super_admin');

-- calls: agents see calls they were connected to / initiated / were attempted on
drop policy if exists calls_read on calls;
create policy calls_read on calls for select using (
  organization_id = current_org_id() and (
    current_role_name() in ('super_admin','manager','auditor')
    or connected_agent_id = current_agent_id()
    or initiated_by_agent_id = current_agent_id()
    or exists (select 1 from call_attempts ca where ca.call_id = calls.id and ca.agent_id = current_agent_id())
  )
);

drop policy if exists attempts_read on call_attempts;
create policy attempts_read on call_attempts for select using (
  organization_id = current_org_id() and (
    current_role_name() in ('super_admin','manager','auditor')
    or agent_id = current_agent_id()
    or call_id in (select id from calls where connected_agent_id = current_agent_id() or initiated_by_agent_id = current_agent_id())
  )
);

drop policy if exists recordings_read on recordings;
create policy recordings_read on recordings for select using (
  organization_id = current_org_id() and current_role_name() in ('super_admin','manager','auditor')
);

-- notes: readable within org; agents can add/edit notes & disposition (§9.3)
drop policy if exists notes_read on call_notes;
create policy notes_read on call_notes for select using (organization_id = current_org_id());
drop policy if exists notes_write on call_notes;
create policy notes_write on call_notes for all
  using (organization_id = current_org_id() and current_role_name() in ('super_admin','manager','agent'))
  with check (organization_id = current_org_id() and current_role_name() in ('super_admin','manager','agent'));

-- callbacks: agents see their own; managers/admin see all; agents update own
drop policy if exists callbacks_read on callbacks;
create policy callbacks_read on callbacks for select using (
  organization_id = current_org_id() and (
    current_role_name() in ('super_admin','manager','auditor')
    or owner_agent_id = current_agent_id()
  )
);
drop policy if exists callbacks_write on callbacks;
create policy callbacks_write on callbacks for all
  using (organization_id = current_org_id() and (
    current_role_name() in ('super_admin','manager')
    or owner_agent_id = current_agent_id()
  ))
  with check (organization_id = current_org_id());

drop policy if exists hours_read on business_hours;
create policy hours_read on business_hours for select using (organization_id = current_org_id());
drop policy if exists hours_write on business_hours;
create policy hours_write on business_hours for all
  using (organization_id = current_org_id() and current_role_name() = 'super_admin')
  with check (organization_id = current_org_id() and current_role_name() = 'super_admin');

drop policy if exists holidays_read on holidays;
create policy holidays_read on holidays for select using (organization_id = current_org_id());
drop policy if exists holidays_write on holidays;
create policy holidays_write on holidays for all
  using (organization_id = current_org_id() and current_role_name() = 'super_admin')
  with check (organization_id = current_org_id() and current_role_name() = 'super_admin');

-- webhook_events: no client access (server/service-role only)
drop policy if exists webhook_none on webhook_events;
create policy webhook_none on webhook_events for select using (false);

-- audit_logs: elevated read only; inserts happen via service role
drop policy if exists audit_read on audit_logs;
create policy audit_read on audit_logs for select using (
  organization_id = current_org_id() and current_role_name() in ('super_admin','manager','auditor')
);
