-- LS Command data model.
--
-- Replaces the V1 work model, which mixed concepts: categories were task types,
-- clients and leads shared one picker, and "Lucid Studio (internal)" sat in the
-- client list. Here every concept is its own table:
--
--   people                     who logs time
--   clients / prospects / partners   the three external relationships
--   task_categories            groupings, with Internal / External / Both eligibility
--   task_types                 the actual unit of work, with expected time
--   time_entries               one row per session; a running timer is an entry with no end
--   contracts, contract_price_changes, billing_events, expenses, revenue_goals
--   audit_log
--
-- When this ran, time_entries, timers, parallel_work, entry_participants,
-- revenue_lines and expenses held no rows, so they are rebuilt rather than altered.
-- clients, contracts and people held real rows and are altered in place.

-- ---------------------------------------------------------------- retire V1 tables

-- Moved aside, not dropped, so nothing is destroyed. They were empty when this ran.
create schema if not exists legacy_v1;
revoke all on schema legacy_v1 from anon, authenticated;
alter table public.parallel_work      set schema legacy_v1;
alter table public.entry_participants set schema legacy_v1;
alter table public.timers             set schema legacy_v1;
alter table public.time_entries       set schema legacy_v1;
alter table public.revenue_lines      set schema legacy_v1;
alter table public.expenses           set schema legacy_v1;
alter table public.task_types         set schema legacy_v1;

-- ---------------------------------------------------------------- enums

create type work_type_t     as enum ('internal', 'external');
create type eligibility_t   as enum ('internal', 'external', 'both');
create type entity_kind_t   as enum ('client', 'prospect', 'partner');
create type revenue_rel_t   as enum ('direct', 'pipeline', 'operational');
create type estimate_src_t  as enum ('measured', 'estimate', 'benchmark', 'contract');
create type entry_status_t  as enum ('finished', 'in_progress');
create type billing_kind_t  as enum ('retainer', 'one_off', 'hourly', 'ad_commission', 'additional_charge', 'other_income');
create type billing_status_t as enum ('paid', 'invoiced', 'scheduled', 'written_off');

-- ---------------------------------------------------------------- people

alter table people add column if not exists email text unique;
alter table people add column if not exists title text;
alter table people add column if not exists weekly_capacity_hours numeric(5,2);
alter table people add column if not exists legacy_key text unique;

-- ---------------------------------------------------------------- relationships

alter table clients add column if not exists brand_color_dark text;
alter table clients add column if not exists notes text;
alter table clients add column if not exists legacy_key text unique;
alter table clients add column if not exists client_since date;

create table prospects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  company     text,
  source      text,
  stage       text not null default 'open' check (stage in ('open', 'won', 'lost')),
  converted_client_id uuid references clients(id),
  notes       text,
  active      boolean not null default true,
  legacy_key  text unique,
  created_at  timestamptz not null default now()
);

create table partners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  kind        text,
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- taxonomy

create table task_categories (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  name                 text not null,
  description          text,
  eligibility          eligibility_t not null,
  -- Which external relationships the category applies to. Empty for internal-only.
  contexts             entity_kind_t[] not null default '{}',
  revenue_relationship revenue_rel_t not null,
  sort_order           integer not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  constraint contexts_match_eligibility check (
    (eligibility = 'internal' and cardinality(contexts) = 0) or
    (eligibility <> 'internal' and cardinality(contexts) > 0))
);

create table task_types (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  category_id          uuid not null references task_categories(id),
  name                 text not null,
  description          text,
  eligibility          eligibility_t not null,
  -- Optional override of the category's relationship.
  revenue_relationship revenue_rel_t,
  service_line         text,
  has_deliverable      boolean not null default false,
  deliverable_unit     text,
  -- Per deliverable when the task has one, otherwise per completed task.
  expected_minutes     numeric(8,2) check (expected_minutes is null or expected_minutes > 0),
  expected_source      estimate_src_t,
  expected_updated_at  timestamptz,
  quick_start          boolean not null default false,
  sort_order           integer not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  constraint unit_needs_deliverable check (
    (has_deliverable and deliverable_unit is not null) or
    (not has_deliverable and deliverable_unit is null)),
  constraint source_needs_estimate check (
    (expected_minutes is null and expected_source is null) or
    (expected_minutes is not null and expected_source is not null))
);
create index on task_types (category_id);

-- A task type may never be broader than its category.
create or replace function check_task_type_eligibility() returns trigger
  language plpgsql as $$
declare cat_elig eligibility_t;
begin
  select eligibility into cat_elig from task_categories where id = new.category_id;
  if cat_elig <> 'both' and new.eligibility <> cat_elig then
    raise exception 'Task "%" is %, but its category is % only', new.name, new.eligibility, cat_elig;
  end if;
  return new;
end $$;

create trigger task_type_eligibility
  before insert or update on task_types
  for each row execute function check_task_type_eligibility();

-- ---------------------------------------------------------------- time

create table time_entries (
  id                   uuid primary key default gen_random_uuid(),
  person_id            uuid not null references people(id),
  work_type            work_type_t not null,
  entity_kind          entity_kind_t,
  client_id            uuid references clients(id),
  prospect_id          uuid references prospects(id),
  partner_id           uuid references partners(id),
  category_id          uuid not null references task_categories(id),
  task_type_id         uuid references task_types(id),
  -- Only when the task is not in the taxonomy yet. Reviewed by an admin.
  custom_task_name     text,
  started_at           timestamptz not null,
  -- Null while the timer is running.
  ended_at             timestamptz,
  paused_at            timestamptz,
  paused_seconds       integer not null default 0 check (paused_seconds >= 0),
  status               entry_status_t not null default 'in_progress',
  deliverable_qty      integer check (deliverable_qty is null or deliverable_qty >= 0),
  contract_deliverable boolean not null default false,
  joint                boolean not null default false,
  ai_assisted          boolean not null default false,
  -- Background work recorded alongside a primary session. Not counted as extra capacity.
  parallel_of          uuid references time_entries(id) on delete cascade,
  -- Snapshot taken on save, so history keeps its meaning if the taxonomy changes.
  revenue_relationship revenue_rel_t,
  source               text not null default 'timer' check (source in ('timer', 'manual', 'import')),
  legacy_ref           text unique,
  deleted              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint internal_has_no_entity check (
    work_type = 'external' or
    (entity_kind is null and client_id is null and prospect_id is null and partner_id is null)),
  constraint external_has_entity check (
    work_type = 'internal' or (
      (entity_kind = 'client'   and client_id is not null and prospect_id is null and partner_id is null) or
      (entity_kind = 'prospect' and client_id is null and partner_id is null) or
      (entity_kind = 'partner'  and client_id is null and prospect_id is null))),
  constraint has_task check (task_type_id is not null or nullif(trim(custom_task_name), '') is not null),
  constraint ends_after_start check (ended_at is null or ended_at >= started_at),
  constraint parallel_is_closed check (parallel_of is null or ended_at is not null)
);
create index on time_entries (person_id, started_at desc);
create index on time_entries (started_at desc) where not deleted;
create index on time_entries (client_id, started_at desc);
create index on time_entries (task_type_id);
create index on time_entries (category_id);
create index on time_entries (parallel_of);
-- One running timer per person.
create unique index one_running_timer on time_entries (person_id)
  where ended_at is null and not deleted;

-- Keeps every entry consistent with the taxonomy: the category must allow the work
-- type and the external relationship, and the task must sit in that category.
create or replace function check_time_entry() returns trigger
  language plpgsql as $$
declare
  cat task_categories%rowtype;
  tt  task_types%rowtype;
begin
  select * into cat from task_categories where id = new.category_id;
  if cat.eligibility <> 'both' and cat.eligibility::text <> new.work_type::text then
    raise exception 'Category "%" is not available for % work', cat.name, new.work_type;
  end if;
  if new.work_type = 'external' and not (new.entity_kind = any(cat.contexts)) then
    raise exception 'Category "%" does not apply to % work', cat.name, new.entity_kind;
  end if;

  if new.task_type_id is not null then
    select * into tt from task_types where id = new.task_type_id;
    if tt.category_id <> new.category_id then
      raise exception 'Task "%" is not in category "%"', tt.name, cat.name;
    end if;
    if tt.eligibility <> 'both' and tt.eligibility::text <> new.work_type::text then
      raise exception 'Task "%" is not available for % work', tt.name, new.work_type;
    end if;
    if not tt.has_deliverable then
      new.deliverable_qty := null;
    end if;
    new.revenue_relationship := coalesce(tt.revenue_relationship, cat.revenue_relationship);
  else
    new.revenue_relationship := cat.revenue_relationship;
  end if;

  -- Internal work is never direct fulfillment for a client.
  if new.work_type = 'internal' and new.revenue_relationship = 'direct' then
    new.revenue_relationship := 'operational';
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger time_entry_integrity
  before insert or update on time_entries
  for each row execute function check_time_entry();

create table entry_participants (
  entry_id  uuid not null references time_entries(id) on delete cascade,
  person_id uuid not null references people(id),
  primary key (entry_id, person_id)
);

-- ---------------------------------------------------------------- finances

alter table contracts add column if not exists status text not null default 'active'
  check (status in ('active', 'paused', 'ended'));
alter table contracts add column if not exists included_services text[] not null default '{}';
alter table contracts add column if not exists notes text;
alter table contracts add column if not exists legacy_ref text unique;

-- commission_shape from 0001 already requires a percentage-only ad commission.

-- One row per bill: retainer cycles, one-off projects, hourly work, ad commission
-- and additional charges on an existing contract. A new bill never needs a new contract.
create table billing_events (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references clients(id),
  contract_id  uuid references contracts(id),
  kind         billing_kind_t not null,
  status       billing_status_t not null default 'paid',
  amount       numeric(12,2) not null check (amount >= 0),
  invoice_date date not null,
  paid_date    date,
  hours        numeric(8,2),
  rate         numeric(10,2),
  description  text,
  source       text not null default 'manual' check (source in ('manual', 'import')),
  legacy_ref   text unique,
  deleted      boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint client_unless_other check (kind = 'other_income' or client_id is not null),
  constraint paid_has_date check (status <> 'paid' or paid_date is not null)
);
create index on billing_events (invoice_date desc) where not deleted;
create index on billing_events (client_id);

create table expenses (
  id         uuid primary key default gen_random_uuid(),
  category   text not null check (category in
               ('contractor', 'software', 'marketing', 'service', 'equipment', 'meals', 'cost_of_delivery', 'other')),
  vendor     text not null,
  amount     numeric(12,2) not null check (amount >= 0),
  recurring  boolean not null default false,
  frequency  text check (frequency in ('monthly', 'quarterly', 'annually')),
  -- One-off: the date it was paid. Recurring: the first charge.
  date       date not null,
  end_date   date,
  notes      text,
  source     text not null default 'manual' check (source in ('manual', 'import', 'seed')),
  legacy_ref text unique,
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  constraint recurring_has_frequency check (recurring = (frequency is not null))
);
create index on expenses (date desc) where not deleted;

create table revenue_goals (
  year   integer primary key,
  amount numeric(12,2) not null check (amount > 0)
);

-- Single row of company settings.
create table app_settings (
  id              integer primary key default 1 check (id = 1),
  pool_pct        numeric(4,3) not null default 0.65,
  hours_based_from text not null default '2026-10',
  fixed_split     jsonb not null default '{}',
  baseline_date   date not null default '2026-10-01',
  updated_at      timestamptz not null default now()
);

-- Audit ids are text so non-uuid keys (settings, goals) can be recorded too.
alter table audit_log alter column record_id type text using record_id::text;

-- ---------------------------------------------------------------- RLS

alter table prospects        enable row level security;
alter table partners         enable row level security;
alter table task_categories  enable row level security;
alter table task_types       enable row level security;
alter table time_entries     enable row level security;
alter table entry_participants enable row level security;
alter table billing_events   enable row level security;
alter table expenses         enable row level security;
alter table revenue_goals    enable row level security;
alter table app_settings     enable row level security;

-- Reference data: every signed-in person reads it because logging needs it.
-- Only admins change it.
create policy prospects_read  on prospects       for select using (current_person_id() is not null);
create policy prospects_write on prospects       for all using (is_admin()) with check (is_admin());
create policy partners_read   on partners        for select using (current_person_id() is not null);
create policy partners_write  on partners        for all using (is_admin()) with check (is_admin());
create policy cats_read       on task_categories for select using (current_person_id() is not null);
create policy cats_write      on task_categories for all using (is_admin()) with check (is_admin());
create policy types_read      on task_types      for select using (current_person_id() is not null);
create policy types_write     on task_types      for all using (is_admin()) with check (is_admin());

-- Time: the team sees company work. People write their own rows; admins can
-- correct anyone's. Nothing is hard-deleted by employees.
create policy entries_read   on time_entries for select
  using (current_person_id() is not null and (not deleted or is_admin()));
create policy entries_insert on time_entries for insert
  with check (person_id = current_person_id() or is_admin());
create policy entries_update on time_entries for update
  using (person_id = current_person_id() or is_admin())
  with check (person_id = current_person_id() or is_admin());
create policy entries_delete on time_entries for delete using (is_admin());

create policy participants_read  on entry_participants for select
  using (current_person_id() is not null);
create policy participants_write on entry_participants for all
  using (exists (select 1 from time_entries e
                 where e.id = entry_id and (e.person_id = current_person_id() or is_admin())))
  with check (exists (select 1 from time_entries e
                 where e.id = entry_id and (e.person_id = current_person_id() or is_admin())));

-- Finances: admin only, reads included.
create policy billing_admin  on billing_events for all using (is_admin()) with check (is_admin());
create policy expenses_admin on expenses       for all using (is_admin()) with check (is_admin());
create policy goals_admin    on revenue_goals  for all using (is_admin()) with check (is_admin());
create policy settings_admin on app_settings   for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- sign-up

-- Only Lucid Studio addresses may hold an account. A person an admin already
-- added (matched by email) is linked to their existing row and keeps its role;
-- anyone else starts as an employee.
create or replace function handle_new_auth_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  linked uuid;
begin
  if lower(new.email) not like '%@lucidstudiollc.com' then
    raise exception 'LS Command accounts are limited to lucidstudiollc.com addresses';
  end if;

  update people set auth_user_id = new.id
   where lower(email) = lower(new.email) and auth_user_id is null
  returning id into linked;

  if linked is null then
    insert into people (auth_user_id, name, email, role)
    values (
      new.id,
      initcap(coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))),
      lower(new.email),
      'employee')
    on conflict (auth_user_id) do nothing;
  end if;

  return new;
end;
$$;
