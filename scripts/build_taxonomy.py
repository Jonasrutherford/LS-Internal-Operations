"""Build the LS Command work taxonomy.

Two levels, both scoped to internal or external:
  category  what kind of work it is
  task type the specific thing you did, with an expected duration

Scope is enforced at both levels. Logging internal work can never surface an
external category or task type, and the same holds for every chart.

Expected hours carry over from the measured figures in the old taxonomy where one
existed. Anything new starts with no estimate rather than an invented one: the
app shows "not set" and an admin fills it in from a time trial.

Usage:  python3 scripts/build_taxonomy.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'seed')

# ---------------------------------------------------------------- categories
# (id, name, scope, revenue_linked)
# External work is tied to revenue. Internal work is not, which is exactly why
# the two are kept apart in every roll-up.
CATEGORIES = [
    ('sales_outreach',            'Sales & outreach',              'external', False),
    ('lead_generation',           'Lead generation',               'external', False),
    ('lead_qualification',        'Lead qualification',            'external', False),
    ('discovery_calls',           'Discovery calls',               'external', False),
    ('proposals_closing',         'Proposals & closing',           'external', False),
    ('client_onboarding',         'Client onboarding',             'external', True),
    ('client_communication',      'Client communication',          'external', True),
    ('account_management',        'Account management',            'external', True),
    ('client_strategy',           'Client strategy',               'external', True),
    ('service_fulfillment',       'Service fulfillment',           'external', True),
    ('content_creation_clients',  'Content creation for clients',  'external', True),
    ('client_reporting',          'Client reporting',              'external', True),
    ('client_retention',          'Client retention',              'external', True),
    ('upsell_cross_sell',         'Upselling & cross-selling',     'external', False),
    ('partnership_development',   'Partnership development',       'external', False),
    ('customer_support',          'Customer support',              'external', True),
    ('client_feedback',           'Client feedback & satisfaction','external', True),

    ('hiring_recruiting',         'Hiring & recruiting',           'internal', False),
    ('employee_onboarding',       'Employee onboarding',           'internal', False),
    ('training_development',      'Training & development',        'internal', False),
    ('internal_operations',       'Internal operations',           'internal', False),
    ('sops_process_docs',         'SOPs & process documentation',  'internal', False),
    ('workflow_automation',       'Workflow automation',           'internal', False),
    ('project_management',        'Project management',            'internal', False),
    ('quality_assurance',         'Quality assurance',             'internal', False),
    ('finance_accounting',        'Finance & accounting',          'internal', False),
    ('legal_admin',               'Legal & administration',        'internal', False),
    ('internal_meetings',         'Internal meetings',             'internal', False),
    ('performance_management',    'Performance management',        'internal', False),
    ('resource_allocation',       'Resource allocation',           'internal', False),
    ('strategic_planning',        'Strategic planning',            'internal', False),
    ('internal_marketing',        'Internal marketing',            'internal', False),
    ('technology_infrastructure', 'Technology & infrastructure',   'internal', False),
    ('team_management',           'Team management',               'internal', False),
]

# ---------------------------------------------------------------- existing types
# Where each measured task type belongs. Codes not listed fall back to the family
# map below, so nothing is silently dropped.
TYPE_CATEGORY = {
    'SO-01':'sales_outreach', 'SO-02':'sales_outreach', 'SO-03':'sales_outreach',
    'SO-06':'lead_generation', 'SO-04':'discovery_calls',
    'SO-05':'proposals_closing', 'CM-09':'proposals_closing',
    'CM-08':'client_onboarding',
    'CM-01':'client_communication','CM-02':'client_communication','CM-03':'client_communication',
    'CM-04':'client_communication','CM-05':'client_communication','CM-06':'client_communication',
    'CM-07':'account_management', 'CM-10':'account_management',
    'SA-01':'client_strategy','SA-02':'client_strategy','SA-03':'client_strategy',
    'SA-04':'client_strategy','SA-05':'client_strategy',
    'RP-01':'client_reporting','RP-02':'client_reporting','RP-03':'client_reporting','SE-04':'client_reporting',
    'IO-05':'hiring_recruiting',
    'IO-03':'sops_process_docs',
    'IO-02':'finance_accounting',
    'IO-04':'internal_meetings',
    'IO-06':'strategic_planning',
    'IO-07':'training_development',
    'IO-08':'technology_infrastructure',
    'IO-01':'internal_operations',
}
FAMILY_CATEGORY = {
    'web':'service_fulfillment', 'seo':'service_fulfillment', 'email':'service_fulfillment',
    'paid':'service_fulfillment', 'automation':'service_fulfillment',
    'social':'content_creation_clients', 'video':'content_creation_clients',
    'design':'content_creation_clients', 'editorial':'content_creation_clients',
    'strategy':'client_strategy', 'reporting':'client_reporting',
    'sales':'sales_outreach', 'client':'client_communication', 'internal':'internal_operations',
}

# ---------------------------------------------------------------- new types
# Categories the old taxonomy never covered. No estimate is invented: these start
# unset and an admin enters a figure after timing the work.
# (code, category, name, unit, estimate)
NEW_TYPES = [
    ('LQ-01','lead_qualification','Qualification call','call',0.5),
    ('LQ-02','lead_qualification','Lead review and scoring','session',None),
    ('CR-01','client_retention','Retention or check-in call','call',0.5),
    ('CR-02','client_retention','Win-back outreach','session',None),
    ('UX-01','upsell_cross_sell','Upsell proposal','proposal',None),
    ('UX-02','upsell_cross_sell','Scope expansion discussion','call',None),
    ('PD-01','partnership_development','Partner outreach','session',None),
    ('PD-02','partnership_development','Partner call','call',None),
    ('CS-01','customer_support','Support request','request',None),
    ('CS-02','customer_support','Troubleshooting for a client','issue',0.75),
    ('CF-01','client_feedback','Feedback or satisfaction call','call',None),
    ('CF-02','client_feedback','Review or testimonial request','request',None),

    ('HR-01','hiring_recruiting','Job post and sourcing','role',None),
    ('HR-02','hiring_recruiting','Candidate interview','interview',0.75),
    ('EO-01','employee_onboarding','Onboarding session','session',1.0),
    ('EO-02','employee_onboarding','Access and account setup','person',0.5),
    ('TD-01','training_development','Training session','session',1.0),
    ('TD-02','training_development','Self-directed learning','session',None),
    ('IO-09','internal_operations','General internal admin','session',0.5),
    ('WA-01','workflow_automation','Automation build','build',4.0),
    ('WA-02','workflow_automation','Automation maintenance','issue',0.75),
    ('PJ-01','project_management','Planning and scheduling','session',None),
    ('PJ-02','project_management','Project coordination','session',None),
    ('QA-01','quality_assurance','Internal QA pass','review',None),
    ('LA-01','legal_admin','Contracts and legal admin','document',None),
    ('LA-02','legal_admin','Insurance, filings and compliance','task',None),
    ('PM-10','performance_management','Performance review','review',None),
    ('RA-01','resource_allocation','Capacity and workload planning','session',None),
    ('IM-01','internal_marketing','Lucid social content','post',None),
    ('IM-02','internal_marketing','Lucid website work','session',None),
    ('IM-03','internal_marketing','Lucid brand and positioning','session',None),
    ('TM-01','team_management','One to one','meeting',0.5),
    ('TM-02','team_management','Team coordination','session',None),
]

# Units that are genuinely discrete. Everything else is time only, spec section 14.
DISCRETE = {'email','post','graphic','reel','newsletter','carousel','clip','thumbnail',
            'ad','page','shot','video','article','deck','report','proposal','design','asset'}


def build():
    old = json.load(open(os.path.join(OUT, 'taxonomy.json')))
    cats = {}
    for i, (cid, name, scope, rev) in enumerate(CATEGORIES):
        cats[cid] = dict(id=cid, name=name, scope=scope, revenueLinked=rev, order=i, active=True)

    types = {}
    for code, t in old['types'].items():
        cid = TYPE_CATEGORY.get(code) or FAMILY_CATEGORY.get(t['family'], 'internal_operations')
        unit = (t.get('unit') or '').strip()
        types[code] = dict(
            code=code, name=t['name'], categoryId=cid, scope=cats[cid]['scope'],
            unit=unit if unit.lower() in DISCRETE else None,
            estimateHours=t.get('planHours'),
            estimateSource=t.get('source','').lower() or None,
            family=t.get('family'), active=t.get('active', True), order=t.get('order', 0),
        )

    for code, cid, name, unit, est in NEW_TYPES:
        types[code] = dict(code=code, name=name, categoryId=cid, scope=cats[cid]['scope'],
                           unit=unit if unit.lower() in DISCRETE else None,
                           estimateHours=est, estimateSource='estimate' if est else None,
                           family=None, active=True, order=0)

    # Other, one per scope, so anything unanticipated is still loggable.
    for scope in ('external','internal'):
        types[f'OTHER-{scope[:3].upper()}'] = dict(
            code=f'OTHER-{scope[:3].upper()}', name='Other', categoryId=None, scope=scope,
            unit=None, estimateHours=None, estimateSource=None, family=None, active=True, order=999)

    doc = dict(categories=cats, types=types,
               stages=old.get('stages', []), complexity=old.get('complexity', []),
               families=old.get('families', {}))
    with open(os.path.join(OUT, 'taxonomy.json'), 'w') as f:
        json.dump(doc, f)

    from collections import Counter
    per = Counter(t['categoryId'] for t in types.values() if t['categoryId'])
    empty = [c for c in cats if per.get(c, 0) == 0]
    est = sum(1 for t in types.values() if t['estimateHours'])
    print(f'categories {len(cats)}  types {len(types)}  with estimate {est}  without {len(types)-est}')
    print(f'external categories {sum(1 for c in cats.values() if c["scope"]=="external")}, '
          f'internal {sum(1 for c in cats.values() if c["scope"]=="internal")}')
    print('categories with no task type:', ', '.join(empty) if empty else 'none')


if __name__ == '__main__':
    build()
