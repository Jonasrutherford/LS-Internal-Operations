-- Reference seed only. No revenue, expense or time data is invented here:
-- section 52 forbids fabricated financial values, so those tables start empty
-- and are filled by admins through the app.

-- ---------------------------------------------------------------- task types
insert into task_types (code, name, scope, unit, parent_code, quick_start) values
  ('sales_outreach',            'Sales & Outreach',             'external', null, null, false),
  ('lead_generation',           'Lead Generation',              'external', null, null, false),
  ('lead_qualification',        'Lead Qualification',           'external', null, null, false),
  ('discovery_calls',           'Discovery Calls',              'external', null, null, false),
  ('proposals_closing',         'Proposals & Closing',          'external', null, null, false),
  ('client_onboarding',         'Client Onboarding',            'external', null, null, false),
  ('client_communication',      'Client Communication',         'external', null, null, false),
  ('account_management',        'Account Management',           'external', null, null, false),
  ('client_strategy',           'Client Strategy',              'external', null, null, false),
  ('service_fulfillment',       'Service Fulfillment',          'external', null, null, false),
  ('content_creation_clients',  'Content Creation for Clients', 'external', null, null, false),
  ('client_reporting',          'Client Reporting',             'external', null, null, false),
  ('client_retention',          'Client Retention',             'external', null, null, false),
  ('upsell_cross_sell',         'Upselling & Cross-Selling',    'external', null, null, false),
  ('partnership_development',   'Partnership Development',      'external', null, null, false),
  ('customer_support',          'Customer Support',             'external', null, null, false),
  ('client_feedback',           'Client Feedback & Satisfaction','external', null, null, false),
  ('hiring_recruiting',         'Hiring & Recruiting',          'internal', null, null, false),
  ('employee_onboarding',       'Employee Onboarding',          'internal', null, null, false),
  ('training_development',      'Training & Development',       'internal', null, null, false),
  ('internal_operations',       'Internal Operations',          'internal', null, null, false),
  ('sops_process_docs',         'SOPs & Process Documentation', 'internal', null, null, false),
  ('workflow_automation',       'Workflow Automation',          'internal', null, null, false),
  ('project_management',        'Project Management',           'internal', null, null, false),
  ('quality_assurance',         'Quality Assurance',            'internal', null, null, false),
  ('finance_accounting',        'Finance & Accounting',         'internal', null, null, false),
  ('legal_admin',               'Legal & Administration',       'internal', null, null, false),
  ('internal_meetings',         'Internal Meetings',            'internal', null, null, false),
  ('performance_management',    'Performance Management',       'internal', null, null, false),
  ('resource_allocation',       'Resource Allocation',          'internal', null, null, false),
  ('strategic_planning',        'Strategic Planning',           'internal', null, null, false),
  ('internal_marketing',        'Internal Marketing',           'internal', null, null, false),
  ('technology_infrastructure', 'Technology & Infrastructure',  'internal', null, null, false),
  ('team_management',           'Team Management',              'internal', null, null, false),
  -- Discrete deliverables. Only these carry units and appear in Quick Start.
  ('email_outreach',  'Email Outreach',  'external', 'emails',   'sales_outreach',           true),
  ('social_post',     'Social Post',     'external', 'posts',    'content_creation_clients', true),
  ('graphic_design',  'Graphic Design',  'external', 'graphics', 'content_creation_clients', true),
  ('reel',            'Reel',            'external', 'reels',    'content_creation_clients', true),
  ('client_report',   'Client Report',   'external', 'reports',  'client_reporting',         true),
  -- Other reveals a single custom-name field when picked, section 19.
  ('other_external',  'Other',           'external', null, null, false),
  ('other_internal',  'Other',           'internal', null, null, false);

-- ---------------------------------------------------------------- clients
insert into clients (name) values
  ('Day & Knight Chess Club'),
  ('Equipt Movement'),
  ('E&M Garage Solutions'),
  ('Terranova Medica'),
  ('Saturation of Sound'),
  ('Your Honor AI'),
  ('Integrita'),
  ('MyCARE Foundation');

-- ---------------------------------------------------------------- contracts
-- Billing frequency is recorded exactly as agreed. Quarterly clients stay quarterly;
-- monthly-equivalent figures are derived for analytics and never stored as the contract.
insert into contracts (client_id, type, billing_frequency, amount_per_billing, percent_commission, start_date)
select c.id, v.type::contract_t, v.freq::billing_t, v.amount, v.pct, v.start_date
from (values
  ('Day & Knight Chess Club', 'retainer', 'monthly',    2000.00, null::numeric, date '2026-01-01'),
  ('Equipt Movement',         'retainer', 'monthly',    2400.00, null,          date '2026-01-01'),
  ('Terranova Medica',        'retainer', 'quarterly',   300.00, null,          date '2026-01-01'),
  ('Saturation of Sound',     'retainer', 'monthly',     500.00, null,          date '2026-01-01'),
  ('Integrita',               'retainer', 'quarterly',   150.00, null,          date '2026-01-01'),
  ('MyCARE Foundation',       'retainer', 'monthly',     250.00, null,          date '2026-01-01'),
  -- E&M is billed per deliverable at a fixed rate, not as a retainer.
  ('E&M Garage Solutions',    'per_unit', 'commission',    35.00, null,         date '2026-01-01')
) as v(client, type, freq, amount, pct, start_date)
join clients c on c.name = v.client;

-- Your Honor AI is commission-based but no percentage was supplied. The contract is
-- created with the rate unset so it shows as needing configuration rather than
-- carrying an invented number, section 52.
insert into contracts (client_id, type, billing_frequency, amount_per_billing, percent_commission, start_date)
select id, 'ad_commission', 'commission', null, null, date '2026-01-01'
from clients where name = 'Your Honor AI';

-- TODO: contract start dates default to 2026-01-01 because the spec did not supply
-- them. Section 49 derives expected payment dates from the start date, so an admin
-- should correct these before relying on projections.
