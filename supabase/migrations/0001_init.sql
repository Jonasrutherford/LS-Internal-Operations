-- Lucid OS V1 schema.
-- Authorization is enforced here, in row-level security, not by hiding navigation.
-- Employees can run their own time and see company work. Finances are admin only.

create extension if not exists "pgcrypto";

create type role_t      as enum ('employee', 'admin');
create type scope_t     as enum ('internal', 'external');
create type unit_t      as enum ('emails', 'posts', 'graphics', 'reels', 'reports');
create type billing_t   as enum ('monthly', 'quarterly', 'biannually', 'annually', 'one_off', 'commission');
-- per_unit covers deliverable-rate work such as a fixed price per reel. It is not
-- in the V1 spec's four types, but modelling it as a retainer would misstate billing.
create type contract_t  as enum ('retainer', 'ad_commission', 'hourly', 'one_off', 'per_unit');
create type revenue_t   as enum ('recurring', 'one_off', 'ad_commission', 'hourly');
create type expense_t   as enum ('contractor', 'software', 'service', 'other');

-- ---------------------------------------------------------------- people

create table people (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name         text not null,
  role         role_t not null default 'employee',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Security definer so the policies below can read people without recursing
-- through people's own RLS.
create or replace function current_person_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from people where auth_user_id = auth.uid() and active
$$;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' from people where auth_user_id = auth.uid() and active),
    false)
$$;

-- ---------------------------------------------------------------- reference data

create table clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  brand_color text,
  created_at  timestamptz not null default now()
);

create table task_types (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  scope          scope_t not null,
  unit           unit_t,
  parent_code    text,
  quick_start    boolean not null default false,
  estimate_hours numeric(6,2),
  active         boolean not null default true
);

-- ---------------------------------------------------------------- time

create table time_entries (
  id                   uuid primary key default gen_random_uuid(),
  person_id            uuid not null references people(id),
  scope                scope_t not null,
  client_id            uuid references clients(id),
  task_type_id         uuid not null references task_types(id),
  custom_task_name     text,
  started_at           timestamptz not null,
  ended_at             timestamptz,
  paused_seconds       integer not null default 0 check (paused_seconds >= 0),
  completed            boolean not null default false,
  contract_deliverable boolean not null default false,
  unit_count           integer check (unit_count is null or unit_count >= 0),
  joint                boolean not null default false,
  notes                text,
  deleted              boolean not null default false,
  created_at           timestamptz not null default now(),
  -- External work is tied to a client; internal work never is.
  constraint client_matches_scope check (
    (scope = 'external' and client_id is not null) or
    (scope = 'internal'  and client_id is null)),
  constraint ends_after_start check (ended_at is null or ended_at >= started_at)
);
create index on time_entries (person_id, started_at desc);
create index on time_entries (client_id, started_at desc);
create index on time_entries (started_at desc) where not deleted;

create table entry_participants (
  entry_id  uuid not null references time_entries(id) on delete cascade,
  person_id uuid not null references people(id),
  primary key (entry_id, person_id)
);

create table parallel_work (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references time_entries(id) on delete cascade,
  client_id    uuid references clients(id),
  task_type_id uuid not null references task_types(id)
);

-- One running timer per person, held server side.
create table timers (
  person_id        uuid primary key references people(id) on delete cascade,
  scope            scope_t not null,
  client_id        uuid references clients(id),
  task_type_id     uuid not null references task_types(id),
  custom_task_name text,
  started_at       timestamptz not null,
  paused_at        timestamptz,
  paused_seconds   integer not null default 0 check (paused_seconds >= 0)
);

-- ---------------------------------------------------------------- finances

create table contracts (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id),
  type               contract_t not null,
  billing_frequency  billing_t not null,
  amount_per_billing numeric(12,2),
  percent_commission numeric(5,2),
  start_date         date not null,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  -- Ad commission carries a percentage; everything else carries an amount.
  -- percent_commission may be null on an ad_commission contract: that means the rate
  -- has not been agreed or recorded yet, and the app shows it as needing configuration
  -- rather than inventing a number.
  constraint commission_shape check (
    (type = 'ad_commission' and amount_per_billing is null) or
    (type <> 'ad_commission' and amount_per_billing is not null and percent_commission is null))
);

create table contract_price_changes (
  id                 uuid primary key default gen_random_uuid(),
  contract_id        uuid not null references contracts(id) on delete cascade,
  effective_date     date not null,
  amount_per_billing numeric(12,2),
  percent_commission numeric(5,2),
  changed_by         uuid references people(id),
  reason             text,
  created_at         timestamptz not null default now()
);

create table revenue_lines (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id),
  contract_id uuid references contracts(id),
  kind        revenue_t not null,
  amount      numeric(12,2) not null,
  date        date not null,
  collected   boolean not null default false,
  description text,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on revenue_lines (date desc) where not deleted;

create table expenses (
  id         uuid primary key default gen_random_uuid(),
  category   expense_t not null,
  vendor     text,
  label      text not null,
  amount     numeric(12,2) not null,
  recurring  boolean not null default false,
  frequency  billing_t,
  date       date not null,
  deleted    boolean not null default false,
  created_at timestamptz not null default now()
);
create index on expenses (date desc) where not deleted;

-- ---------------------------------------------------------------- audit

create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  at           timestamptz not null default now(),
  person_id    uuid references people(id),
  table_name   text not null,
  record_id    uuid not null,
  field        text,
  before_value text,
  after_value  text,
  reason       text
);
create index on audit_log (at desc);

-- ---------------------------------------------------------------- RLS

alter table people                  enable row level security;
alter table clients                 enable row level security;
alter table task_types              enable row level security;
alter table time_entries            enable row level security;
alter table entry_participants      enable row level security;
alter table parallel_work           enable row level security;
alter table timers                  enable row level security;
alter table contracts               enable row level security;
alter table contract_price_changes  enable row level security;
alter table revenue_lines           enable row level security;
alter table expenses                enable row level security;
alter table audit_log               enable row level security;

-- People: everyone signed in can see the roster. Only admins change it.
create policy people_read   on people for select using (current_person_id() is not null);
create policy people_write  on people for all    using (is_admin()) with check (is_admin());

-- Reference data: readable by all signed-in users because logging time needs it.
-- Only admins manage it, section 37.
create policy clients_read    on clients    for select using (current_person_id() is not null);
create policy clients_write   on clients    for all    using (is_admin()) with check (is_admin());
create policy tasktypes_read  on task_types for select using (current_person_id() is not null);
create policy tasktypes_write on task_types for all    using (is_admin()) with check (is_admin());

-- Time: company-wide visibility, section 34. Employees write only their own rows;
-- only admins edit anyone else's history, section 32.
create policy entries_read    on time_entries for select
  using (current_person_id() is not null and not deleted);
create policy entries_insert  on time_entries for insert
  with check (person_id = current_person_id() or is_admin());
create policy entries_update  on time_entries for update
  using (person_id = current_person_id() or is_admin())
  with check (person_id = current_person_id() or is_admin());
create policy entries_delete  on time_entries for delete using (is_admin());

create policy participants_read  on entry_participants for select
  using (current_person_id() is not null);
create policy participants_write on entry_participants for all
  using (exists (select 1 from time_entries e
                 where e.id = entry_id and (e.person_id = current_person_id() or is_admin())))
  with check (exists (select 1 from time_entries e
                 where e.id = entry_id and (e.person_id = current_person_id() or is_admin())));

create policy parallel_read  on parallel_work for select
  using (current_person_id() is not null);
create policy parallel_write on parallel_work for all
  using (exists (select 1 from time_entries e
                 where e.id = entry_id and (e.person_id = current_person_id() or is_admin())))
  with check (exists (select 1 from time_entries e
                 where e.id = entry_id and (e.person_id = current_person_id() or is_admin())));

-- Timers belong to one person only.
create policy timers_own on timers for all
  using (person_id = current_person_id() or is_admin())
  with check (person_id = current_person_id() or is_admin());

-- Finances: admin only, read included. Employees cannot reach these rows at all,
-- sections 31, 32 and 40.
create policy contracts_admin   on contracts                for all using (is_admin()) with check (is_admin());
create policy pricehist_admin   on contract_price_changes   for all using (is_admin()) with check (is_admin());
create policy revenue_admin     on revenue_lines            for all using (is_admin()) with check (is_admin());
create policy expenses_admin    on expenses                 for all using (is_admin()) with check (is_admin());

-- Audit is readable by admins. Rows are written through server actions.
create policy audit_read   on audit_log for select using (is_admin());
create policy audit_insert on audit_log for insert with check (current_person_id() is not null);
