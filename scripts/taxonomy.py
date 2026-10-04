"""LS Command work taxonomy, source of truth for the seed migration.

Writes supabase/migrations/0005_seed_taxonomy.sql. After that, the taxonomy is
edited in System Admin > Task Taxonomy, not here.

Audit notes (what changed from the V1 list of 34 categories):
- Customer Support is "Client Support": the people we support are clients.
- Client Feedback & Satisfaction merged into Client Retention. Both were about
  keeping a client happy and staying; one category is clearer.
- Performance Management merged into Team Management (reviews, one to ones).
- Resource Allocation merged into Project Management (capacity planning).
- Project Management and Quality Assurance are Both: planning and QA happen for
  client work and for Lucid itself.
- Service Fulfillment and Content Creation for Clients are grouped by service
  line (Web, SEO, Paid Media, Email, Automation / Social, Video, Design,
  Editorial) instead of becoming eight more categories.

Expected times carry over from the measured planning standards in
scripts/build_seed.py. Each keeps its source (measured, estimate, benchmark,
contract). New task types start with no expected time rather than a guess.

Usage: python3 scripts/taxonomy.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'supabase', 'migrations', '0005_seed_taxonomy.sql')

P, C, R = 'prospect', 'client', 'partner'

# code, name, eligibility, contexts, revenue relationship, description
CATEGORIES = [
    ('sales_outreach', 'Sales & Outreach', 'external', [P], 'pipeline',
     'Contacting potential clients: calls, emails and social outreach.'),
    ('lead_generation', 'Lead Generation', 'external', [P], 'pipeline',
     'Finding and researching potential clients before anyone is contacted.'),
    ('lead_qualification', 'Lead Qualification', 'external', [P], 'pipeline',
     'Deciding whether a lead is a fit before investing sales time.'),
    ('discovery_calls', 'Discovery Calls', 'external', [P], 'pipeline',
     'First real conversation about a prospect\'s needs.'),
    ('proposals_closing', 'Proposals & Closing', 'external', [P], 'pipeline',
     'Proposals, pitch decks, negotiation and signing a new client.'),
    ('partnership_development', 'Partnership Development', 'external', [R], 'pipeline',
     'Building referral, agency and vendor partnerships.'),
    ('client_onboarding', 'Client Onboarding', 'external', [C], 'direct',
     'Getting a newly signed client set up: kickoff, access, assets.'),
    ('client_communication', 'Client Communication', 'external', [C], 'direct',
     'Calls, working sessions and messages with an active client.'),
    ('account_management', 'Account Management', 'external', [C], 'direct',
     'Approvals, invoicing, scope changes and commercial admin for a client.'),
    ('client_strategy', 'Client Strategy', 'external', [C], 'direct',
     'Research, audits and strategic direction delivered to a client.'),
    ('service_fulfillment', 'Service Fulfillment', 'external', [C], 'direct',
     'Delivering contracted services: web, SEO, paid media, email and automation.'),
    ('content_creation_clients', 'Content Creation for Clients', 'external', [C], 'direct',
     'Social, video, design and editorial content produced for a client.'),
    ('client_reporting', 'Client Reporting', 'external', [C], 'direct',
     'Performance reports and analytics for a client.'),
    ('client_support', 'Client Support', 'external', [C], 'direct',
     'Fixing problems and handling support requests for a client.'),
    ('client_retention', 'Client Retention', 'external', [C], 'pipeline',
     'Check-ins, feedback and win-back work that keeps a client.'),
    ('upsell_cross_sell', 'Upselling & Cross-selling', 'external', [C], 'pipeline',
     'Growing an existing client into more services.'),

    ('project_management', 'Project Management', 'both', [C], 'direct',
     'Planning, scheduling, coordination and capacity planning.'),
    ('quality_assurance', 'Quality Assurance', 'both', [C], 'direct',
     'Reviewing work before it ships, for clients or for Lucid.'),

    ('hiring_recruiting', 'Hiring & Recruiting', 'internal', [], 'operational',
     'Finding and selecting new team members.'),
    ('employee_onboarding', 'Employee Onboarding', 'internal', [], 'operational',
     'Getting a new team member productive.'),
    ('training_development', 'Training & Development', 'internal', [], 'operational',
     'Training, learning and mentorship.'),
    ('internal_operations', 'Internal Operations', 'internal', [], 'operational',
     'Day-to-day running of the company that fits nowhere more specific.'),
    ('sops_process_docs', 'SOPs & Process Documentation', 'internal', [], 'operational',
     'Writing and maintaining how Lucid does things.'),
    ('workflow_automation', 'Workflow Automation', 'internal', [], 'operational',
     'Automating Lucid\'s own workflows.'),
    ('finance_accounting', 'Finance & Accounting', 'internal', [], 'operational',
     'Bookkeeping, reconciliation and financial planning.'),
    ('legal_admin', 'Legal & Administration', 'internal', [], 'operational',
     'Contracts, insurance, filings and compliance.'),
    ('internal_meetings', 'Internal Meetings', 'internal', [], 'operational',
     'Team and partner meetings.'),
    ('team_management', 'Team Management', 'internal', [], 'operational',
     'One to ones, performance reviews and team coordination.'),
    ('strategic_planning', 'Strategic Planning', 'internal', [], 'operational',
     'Business planning, modeling and goal setting.'),
    ('internal_marketing', 'Internal Marketing', 'internal', [], 'pipeline',
     'Marketing Lucid Studio itself: content, website and brand.'),
    ('technology_infrastructure', 'Technology & Infrastructure', 'internal', [], 'operational',
     'Lucid\'s own software, tools and systems.'),
]

E, I, B = 'external', 'internal', 'both'

# code, category, name, eligibility, unit, expected hours, source, service line, quick start
TYPES = [
    # Prospects
    ('SO-01', 'sales_outreach', 'Cold call block', E, None, 0.5, 'estimate', None, False),
    ('SO-02', 'sales_outreach', 'Cold email or outreach campaign', E, None, 1.5, 'estimate', None, False),
    ('SO-03', 'sales_outreach', 'LinkedIn or social outreach', E, None, 0.5, 'estimate', None, False),
    ('SO-07', 'sales_outreach', 'Follow-up outreach', E, None, None, None, None, False),
    ('SO-06', 'lead_generation', 'Lead research and list building', E, None, 0.75, 'estimate', None, False),
    ('LQ-01', 'lead_qualification', 'Qualification call', E, None, 0.5, 'estimate', None, False),
    ('LQ-02', 'lead_qualification', 'Lead review and scoring', E, None, None, None, None, False),
    ('SO-04', 'discovery_calls', 'Discovery call', E, None, 0.75, 'estimate', None, False),
    ('DC-02', 'discovery_calls', 'Discovery call prep', E, None, None, None, None, False),
    ('SO-05', 'proposals_closing', 'Proposal or pitch deck', E, 'proposal', 2, 'estimate', None, False),
    ('PC-02', 'proposals_closing', 'Negotiation or closing call', E, None, None, None, None, False),
    # Partners
    ('PD-01', 'partnership_development', 'Partner outreach', E, None, None, None, None, False),
    ('PD-02', 'partnership_development', 'Partner call', E, None, None, None, None, False),
    ('PD-03', 'partnership_development', 'Partnership agreement', E, None, None, None, None, False),
    # Clients: onboarding and communication
    ('CM-08', 'client_onboarding', 'Client onboarding (full)', E, None, 3, 'estimate', None, False),
    ('ON-02', 'client_onboarding', 'Kickoff call', E, None, None, None, None, False),
    ('ON-03', 'client_onboarding', 'Access and asset collection', E, None, None, None, None, False),
    ('CM-01', 'client_communication', 'Client call (15 min)', E, None, 0.25, 'measured', None, True),
    ('CM-02', 'client_communication', 'Client call (30 min)', E, None, 0.5, 'measured', None, True),
    ('CM-03', 'client_communication', 'Client call (45 min)', E, None, 0.75, 'measured', None, False),
    ('CM-04', 'client_communication', 'Client call (60 min)', E, None, 1, 'measured', None, False),
    ('CM-05', 'client_communication', 'Working session (90 min)', E, None, 1.5, 'measured', None, False),
    ('CM-06', 'client_communication', 'Email and messages', E, None, 0.25, 'estimate', None, False),
    ('CM-07', 'account_management', 'Approval packaging', E, None, 0.25, 'estimate', None, False),
    ('CM-09', 'account_management', 'Contract, scope change or negotiation', E, None, 2, 'measured', None, False),
    ('CM-10', 'account_management', 'Invoicing and collections', E, None, 0.25, 'estimate', None, False),
    ('PM-08', 'account_management', 'Ad commission reconciliation', E, None, 0.9, 'estimate', None, False),
    # Client strategy
    ('SA-01', 'client_strategy', 'Competitive analysis (full)', E, None, 17.1, 'measured', None, False),
    ('SA-02', 'client_strategy', 'AI-assisted deck', E, 'deck', 0.83, 'measured', None, False),
    ('SA-03', 'client_strategy', 'Growth diagnostic audit', E, None, 12, 'estimate', None, False),
    ('SA-04', 'client_strategy', 'Brand and positioning direction', E, None, 5, 'estimate', None, False),
    ('SA-05', 'client_strategy', 'Research', E, None, 1, 'estimate', None, False),
    ('ST-06', 'client_strategy', 'Campaign or content strategy', E, None, None, None, None, False),
    # Service fulfillment: Web
    ('WB-01', 'service_fulfillment', 'Website build (standard project)', E, None, 31.6, 'measured', 'Web', False),
    ('WB-02', 'service_fulfillment', 'Custom component or section', E, None, 1.27, 'measured', 'Web', False),
    ('WB-03', 'service_fulfillment', 'Product page repair or refresh', E, None, 1.65, 'measured', 'Web', False),
    ('WB-04', 'service_fulfillment', 'AI product shot', E, 'shot', 0.19, 'measured', 'Web', True),
    ('WB-05', 'service_fulfillment', 'Website edit (minor)', E, None, 0.35, 'estimate', 'Web', True),
    ('WB-06', 'service_fulfillment', 'Website edit (structural)', E, None, 1, 'estimate', 'Web', False),
    ('WB-07', 'service_fulfillment', 'Bulk product upload', E, None, 2, 'estimate', 'Web', False),
    ('WB-08', 'service_fulfillment', 'Campaign landing page', E, 'page', 3, 'estimate', 'Web', False),
    ('WB-10', 'service_fulfillment', 'Website QA pass', E, None, 2.5, 'estimate', 'Web', False),
    ('WB-11', 'service_fulfillment', 'Launch and handoff', E, None, 2, 'estimate', 'Web', False),
    # SEO
    ('SE-01', 'service_fulfillment', 'SEO program (full site)', E, None, 14, 'estimate', 'SEO', False),
    ('SE-02', 'service_fulfillment', 'On-page optimization', E, 'page', 0.5, 'estimate', 'SEO', False),
    ('SE-03', 'service_fulfillment', 'Google Business Profile setup', E, None, 1, 'estimate', 'SEO', False),
    ('SE-05', 'service_fulfillment', 'SEO audit', E, None, 4, 'estimate', 'SEO', False),
    # Paid media
    ('PM-01', 'service_fulfillment', 'Campaign plan', E, None, 1.98, 'measured', 'Paid Media', False),
    ('PM-02', 'service_fulfillment', 'Static ad creative', E, 'ad', 1.01, 'measured', 'Paid Media', True),
    ('PM-03', 'service_fulfillment', 'Video ad creative', E, 'ad', 0.9, 'estimate', 'Paid Media', False),
    ('PM-04', 'service_fulfillment', 'Ad copy set', E, None, 0.45, 'estimate', 'Paid Media', False),
    ('PM-05', 'service_fulfillment', 'Campaign build and launch', E, None, 2.25, 'estimate', 'Paid Media', False),
    ('PM-06', 'service_fulfillment', 'Campaign management (weekly)', E, None, 1.25, 'estimate', 'Paid Media', False),
    ('PM-07', 'service_fulfillment', 'Pixel and tracking setup', E, None, 2, 'estimate', 'Paid Media', False),
    # Email
    ('EM-01', 'service_fulfillment', 'Email (AI-built, end to end)', E, 'email', 0.72, 'measured', 'Email', True),
    ('EM-02', 'service_fulfillment', 'Email (AI design only)', E, 'email', 0.42, 'measured', 'Email', False),
    ('EM-03', 'service_fulfillment', 'Email (edit and schedule)', E, 'email', 0.3, 'measured', 'Email', True),
    ('EM-04', 'service_fulfillment', 'Email (approved template deploy)', E, 'email', 0.06, 'measured', 'Email', False),
    ('EM-05', 'service_fulfillment', 'Email (custom design)', E, 'email', 2.17, 'measured', 'Email', False),
    ('EM-06', 'service_fulfillment', 'Email (custom, end to end)', E, 'email', 2.47, 'measured', 'Email', False),
    ('EM-07', 'service_fulfillment', 'Master template build', E, None, 5.5, 'estimate', 'Email', False),
    ('EM-08', 'service_fulfillment', 'Lifecycle flow build', E, None, 5, 'estimate', 'Email', False),
    ('EM-09', 'service_fulfillment', 'List hygiene and segmentation', E, None, 0.6, 'estimate', 'Email', False),
    # Automation
    ('WB-09', 'service_fulfillment', 'Form or integration build', E, None, 2, 'estimate', 'Automation', False),
    ('AU-01', 'service_fulfillment', 'Custom tool build', E, None, 4, 'estimate', 'Automation', False),
    ('AU-02', 'service_fulfillment', 'Tool or workspace setup', E, None, 1.5, 'estimate', 'Automation', False),
    # Content: Social
    ('SC-01', 'content_creation_clients', 'Static social graphic', E, 'graphic', 0.4, 'estimate', 'Social', True),
    ('SC-02', 'content_creation_clients', 'Carousel', E, 'carousel', 0.85, 'estimate', 'Social', True),
    ('SC-03', 'content_creation_clients', 'Caption and hashtags', E, 'post', 0.12, 'estimate', 'Social', False),
    ('SC-04', 'content_creation_clients', 'Schedule a post', E, 'post', 0.03, 'measured', 'Social', False),
    ('SC-05', 'content_creation_clients', 'Schedule a batch of posts', E, None, 0.45, 'measured', 'Social', False),
    ('SC-06', 'content_creation_clients', 'Monthly content calendar', E, None, 1.5, 'estimate', 'Social', False),
    ('SC-07', 'content_creation_clients', 'Content QC pass', E, None, 0.5, 'estimate', 'Social', False),
    ('SC-08', 'content_creation_clients', 'Community management (weekly)', E, None, 0.75, 'contract', 'Social', False),
    ('SC-12', 'content_creation_clients', 'Social content session (mixed)', E, None, 1, 'estimate', 'Social', False),
    # Content: Video
    ('VD-01', 'content_creation_clients', 'Short clip (automated)', E, 'clip', 0.02, 'measured', 'Video', False),
    ('VD-02', 'content_creation_clients', 'Reel edit (manual)', E, 'reel', 0.47, 'measured', 'Video', True),
    ('VD-03', 'content_creation_clients', 'Long-form or launch video edit', E, 'video', 9.23, 'measured', 'Video', False),
    ('VD-04', 'content_creation_clients', 'Captions and subtitles', E, 'video', 0.2, 'estimate', 'Video', False),
    ('VD-05', 'content_creation_clients', 'Thumbnail', E, 'thumbnail', 0.3, 'estimate', 'Video', False),
    ('VD-06', 'content_creation_clients', 'Filming or shoot', E, None, 3, 'estimate', 'Video', False),
    # Content: Design
    ('GD-01', 'content_creation_clients', 'Print or flyer graphic', E, 'graphic', 0.5, 'estimate', 'Design', False),
    ('GD-02', 'content_creation_clients', 'Brand asset or logo work', E, None, 1.5, 'estimate', 'Design', False),
    ('GD-03', 'content_creation_clients', 'Merch design', E, 'design', 1.5, 'estimate', 'Design', False),
    # Content: Editorial
    ('SC-09', 'content_creation_clients', 'Blog post (end to end)', E, 'article', 2.5, 'benchmark', 'Editorial', False),
    ('SC-10', 'content_creation_clients', 'Blog images (prep and placement)', E, 'article', 1.1, 'measured', 'Editorial', False),
    ('SC-11', 'content_creation_clients', 'Newsletter', E, 'newsletter', 0.33, 'measured', 'Editorial', True),
    # Reporting, support, retention, upsell
    ('RP-01', 'client_reporting', 'Monthly report (multi-channel)', E, 'report', 2.5, 'estimate', None, False),
    ('RP-02', 'client_reporting', 'Monthly report (single channel)', E, 'report', 1, 'estimate', None, False),
    ('RP-03', 'client_reporting', 'Quarterly report', E, 'report', 1.5, 'estimate', None, False),
    ('SE-04', 'client_reporting', 'Monthly organic search reporting', E, 'report', 1, 'estimate', None, False),
    ('AU-03', 'client_support', 'Troubleshooting and fixes', E, None, 0.75, 'estimate', None, False),
    ('CS-01', 'client_support', 'Support request', E, None, None, None, None, False),
    ('CR-01', 'client_retention', 'Check-in call', E, None, 0.5, 'estimate', None, False),
    ('CR-02', 'client_retention', 'Win-back outreach', E, None, None, None, None, False),
    ('CF-01', 'client_retention', 'Feedback or satisfaction review', E, None, None, None, None, False),
    ('CF-02', 'client_retention', 'Review or testimonial request', E, None, None, None, None, False),
    ('UX-01', 'upsell_cross_sell', 'Upsell proposal', E, 'proposal', None, None, None, False),
    ('UX-02', 'upsell_cross_sell', 'Scope expansion call', E, None, None, None, None, False),
    # Both
    ('PJ-01', 'project_management', 'Project planning and scheduling', B, None, None, None, None, False),
    ('PJ-02', 'project_management', 'Project coordination', B, None, None, None, None, False),
    ('RA-01', 'project_management', 'Capacity and workload planning', I, None, None, None, None, False),
    ('QA-01', 'quality_assurance', 'QA review', B, None, None, None, None, False),
    # Internal
    ('HR-01', 'hiring_recruiting', 'Job post and recruiting outreach', I, None, None, None, None, False),
    ('HR-02', 'hiring_recruiting', 'Candidate interview', I, None, 0.75, 'estimate', None, False),
    ('HR-03', 'hiring_recruiting', 'Hiring review and decision', I, None, None, None, None, False),
    ('EO-01', 'employee_onboarding', 'Employee onboarding session', I, None, 1, 'estimate', None, False),
    ('EO-02', 'employee_onboarding', 'Access and account setup', I, None, 0.5, 'estimate', None, False),
    ('TD-01', 'training_development', 'Employee training session', I, None, 1, 'estimate', None, False),
    ('TD-02', 'training_development', 'Self-directed learning', I, None, None, None, None, False),
    ('IO-07', 'training_development', 'Mentorship, networking and programs', I, None, 1, 'estimate', None, False),
    ('IO-01', 'internal_operations', 'Time logging and admin', I, None, 0.2, 'estimate', None, False),
    ('IO-09', 'internal_operations', 'General internal admin', I, None, 0.5, 'estimate', None, False),
    ('IO-03', 'sops_process_docs', 'Create SOP', I, None, 2, 'estimate', None, False),
    ('SP-02', 'sops_process_docs', 'Update SOP', I, None, None, None, None, False),
    ('WA-03', 'workflow_automation', 'Workflow design', I, None, None, None, None, False),
    ('WA-01', 'workflow_automation', 'Automation build', I, None, 4, 'estimate', None, False),
    ('WA-02', 'workflow_automation', 'Automation maintenance', I, None, 0.75, 'estimate', None, False),
    ('IO-02', 'finance_accounting', 'Bookkeeping', I, None, 0.5, 'estimate', None, False),
    ('FA-02', 'finance_accounting', 'Expense reconciliation', I, None, None, None, None, False),
    ('FA-03', 'finance_accounting', 'Financial planning and forecasting', I, None, None, None, None, False),
    ('LA-01', 'legal_admin', 'Contracts and legal admin', I, None, None, None, None, False),
    ('LA-02', 'legal_admin', 'Insurance, filings and compliance', I, None, None, None, None, False),
    ('IO-04', 'internal_meetings', 'Internal strategy meeting', I, None, 1, 'estimate', None, False),
    ('MT-02', 'internal_meetings', 'Team meeting', I, None, None, None, None, False),
    ('TM-01', 'team_management', 'One to one', I, None, 0.5, 'estimate', None, False),
    ('PM-10', 'team_management', 'Employee performance review', I, None, None, None, None, False),
    ('TM-02', 'team_management', 'Team coordination', I, None, None, None, None, False),
    ('IO-06', 'strategic_planning', 'Business planning and modeling', I, None, 2, 'estimate', None, False),
    ('SG-02', 'strategic_planning', 'Annual or quarterly planning', I, None, None, None, None, False),
    ('IM-01', 'internal_marketing', 'Lucid social content', I, 'post', None, None, None, False),
    ('IM-02', 'internal_marketing', 'Lucid website maintenance', I, None, None, None, None, False),
    ('IM-03', 'internal_marketing', 'Lucid brand and positioning', I, None, None, None, None, False),
    ('IM-04', 'internal_marketing', 'Lucid video content', I, 'video', None, None, None, False),
    ('IO-08', 'technology_infrastructure', 'Software and tool setup', I, None, 1.5, 'estimate', None, False),
    ('TI-02', 'technology_infrastructure', 'Internal troubleshooting', I, None, None, None, None, False),
]


def q(s):
    return 'null' if s is None else "'" + str(s).replace("'", "''") + "'"


def build():
    cat_codes = {c[0] for c in CATEGORIES}
    elig = {c[0]: c[2] for c in CATEGORIES}
    seen = set()
    for t in TYPES:
        assert t[0] not in seen, f'duplicate code {t[0]}'
        seen.add(t[0])
        assert t[1] in cat_codes, f'{t[0]} has unknown category {t[1]}'
        assert elig[t[1]] == 'both' or elig[t[1]] == t[3], f'{t[0]} broader than its category'
        assert (t[5] is None) == (t[6] is None), f'{t[0]} estimate and source disagree'
    empty = cat_codes - {t[1] for t in TYPES}
    assert not empty, f'categories with no task: {empty}'

    out = ['-- Generated by scripts/taxonomy.py. Seeds the audited work taxonomy.',
           '-- Edit the taxonomy in System Admin afterwards, not here.', '',
           'insert into task_categories (code, name, eligibility, contexts, revenue_relationship, description, sort_order) values']
    rows = []
    for i, (code, name, el, ctx, rel, desc) in enumerate(CATEGORIES):
        arr = "'{" + ','.join(ctx) + "}'::entity_kind_t[]"
        rows.append(f"  ({q(code)}, {q(name)}, {q(el)}, {arr}, {q(rel)}, {q(desc)}, {i})")
    out.append(',\n'.join(rows) + '\non conflict (code) do nothing;\n')

    out.append('insert into task_types (code, category_id, name, eligibility, service_line, has_deliverable, '
               'deliverable_unit, expected_minutes, expected_source, expected_updated_at, quick_start, sort_order)')
    out.append('select v.code, c.id, v.name, v.elig::eligibility_t, v.line, v.unit is not null, v.unit, '
               'v.mins, v.src::estimate_src_t, case when v.mins is null then null else now() end, v.qs, v.ord')
    out.append('from (values')
    rows = []
    for i, (code, cat, name, el, unit, hrs, src, line, qs) in enumerate(TYPES):
        mins = 'null::numeric' if hrs is None else f'{round(hrs * 60, 2)}::numeric'
        rows.append(f"  ({q(code)}, {q(cat)}, {q(name)}, {q(el)}, {q(line)}, {q(unit)}, {mins}, "
                    f"{q(src)}, {'true' if qs else 'false'}, {i})")
    out.append(',\n'.join(rows))
    out.append(') as v(code, cat, name, elig, line, unit, mins, src, qs, ord)')
    out.append('join task_categories c on c.code = v.cat')
    out.append('on conflict (code) do nothing;\n')

    with open(OUT, 'w') as f:
        f.write('\n'.join(out))
    print(f'{len(CATEGORIES)} categories, {len(TYPES)} task types, '
          f'{sum(1 for t in TYPES if t[5])} with expected time -> {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    build()
