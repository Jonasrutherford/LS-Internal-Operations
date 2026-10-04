-- Reference data for LS Command. Only facts already recorded in the repository
-- (scripts/build_seed.py, scripts/build_expenses.py) or given by Carter. No
-- revenue or time is invented: those come from real logging and from the
-- one-time import in System Admin.

-- ---------------------------------------------------------------- people

update people
   set name = 'Carter', email = 'carter@lucidstudiollc.com', title = 'CEO',
       weekly_capacity_hours = 15, legacy_key = 'carter'
 where auth_user_id = (select id from auth.users where lower(email) = 'carter@lucidstudiollc.com');

insert into people (name, email, role, title, weekly_capacity_hours, legacy_key)
values ('Jonas', 'jonas@lucidstudiollc.com', 'admin', 'COO', 12, 'jonas')
on conflict (email) do nothing;

-- ---------------------------------------------------------------- clients

update clients set legacy_key = 'dk'        where name = 'Day & Knight Chess Club';
update clients set legacy_key = 'equipt', name = 'EQUIPT Movement' where name = 'Equipt Movement';
update clients set legacy_key = 'em'        where name = 'E&M Garage Solutions';
update clients set legacy_key = 'terranova' where name = 'Terranova Medica';
update clients set legacy_key = 'sos'       where name = 'Saturation of Sound';
update clients set legacy_key = 'yourhonor' where name = 'Your Honor AI';
update clients set legacy_key = 'integrita' where name = 'Integrita';
update clients set legacy_key = 'mycare'    where name = 'MyCARE Foundation';

-- Former clients. Inactive, so they never appear in logging pickers, but their
-- revenue history stays attributable.
insert into clients (name, active, legacy_key) values
  ('HMD Fabrications', false, 'hmd'),
  ('Hospital Procedure Consultants', false, 'hpc'),
  ('Casa Barranca', false, 'casa'),
  ('Solid Supply Inc.', false, 'ssi'),
  ('Dawn Esthetics', false, 'dawn')
on conflict (name) do nothing;

-- ---------------------------------------------------------------- contracts

-- Commission agreements carry a percentage (Carter's answers, 2026-10-02).
update contracts k set percent_commission = 20
  from clients c where k.client_id = c.id and c.legacy_key = 'yourhonor' and k.type = 'ad_commission';

insert into contracts (client_id, type, billing_frequency, amount_per_billing, percent_commission, start_date, notes)
select id, 'ad_commission', 'commission', null, 10, date '2026-01-01', 'Commission on ad spend.'
  from clients c
 where legacy_key = 'em'
   and not exists (select 1 from contracts k where k.client_id = c.id and k.type = 'ad_commission');

-- ---------------------------------------------------------------- expenses

-- Recurring contractors, stated by Carter. Charges before October are real bank
-- transactions and arrive with the import, so these rules start in October.
insert into expenses (category, vendor, amount, recurring, frequency, date, notes, source, legacy_ref) values
  ('contractor', 'Melanie Lee', 400.00, true, 'monthly', '2026-10-01', 'Recurring contractor.', 'seed', 'seed:contractor:melanie'),
  ('contractor', 'Sofia Burke', 600.00, true, 'monthly', '2026-10-01', 'Recurring contractor.', 'seed', 'seed:contractor:sofia')
on conflict (legacy_ref) do nothing;

-- Annual subscriptions from the subscription register. The date is the next renewal.
insert into expenses (category, vendor, amount, recurring, frequency, date, notes, source, legacy_ref) values
  ('software',  'ClickUp',          336.00, true, 'annually', '2027-04-14', 'Annual subscription.', 'seed', 'seed:sub:clickup'),
  ('software',  'Calendly',         120.00, true, 'annually', '2027-03-02', 'Annual subscription.', 'seed', 'seed:sub:calendly'),
  ('software',  'Framer',           360.00, true, 'annually', '2027-02-18', 'Annual subscription.', 'seed', 'seed:sub:framer'),
  ('software',  'Mercury',          335.48, true, 'annually', '2027-01-23', 'Annual subscription.', 'seed', 'seed:sub:mercury'),
  ('software',  'Opus Clip',        174.00, true, 'annually', '2027-04-08', 'Annual subscription.', 'seed', 'seed:sub:opusclip'),
  ('software',  'Google Workspace', 336.00, true, 'annually', '2027-01-01', 'Annual subscription.', 'seed', 'seed:sub:google'),
  ('software',  'Claude Pro',       200.00, true, 'annually', '2027-03-25', 'Annual subscription.', 'seed', 'seed:sub:claude'),
  ('software',  'GoDaddy',           52.36, true, 'annually', '2028-01-24', 'Annual subscription.', 'seed', 'seed:sub:godaddy'),
  ('marketing', 'Metricool',        636.00, true, 'annually', '2027-09-16', 'Annual subscription.', 'seed', 'seed:sub:metricool')
on conflict (legacy_ref) do nothing;

-- ---------------------------------------------------------------- goals and settings

insert into revenue_goals (year, amount) values (2026, 100000) on conflict (year) do nothing;

insert into app_settings (id, pool_pct, hours_based_from, fixed_split, baseline_date)
values (1, 0.65, '2026-10',
        jsonb_build_object('carter', 0.40, 'jonas', 0.30), '2026-10-01')
on conflict (id) do nothing;
