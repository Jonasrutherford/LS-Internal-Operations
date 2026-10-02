"""Normalize Lucid Studio's spreadsheets into Lucid OS seed documents."""
import json, os, re, hashlib, datetime as dt
from zoneinfo import ZoneInfo
import openpyxl

import sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UP = os.path.join(ROOT, 'data') + '/'
OUT = os.path.join(ROOT, 'data', 'seed')
os.makedirs(OUT, exist_ok=True)
TZ = ZoneInfo('America/Los_Angeles')
NOW = '2026-09-29T14:00:00Z'

def sid(*parts):
    return hashlib.sha1('|'.join(map(str, parts)).encode()).hexdigest()[:10]

# ---------------------------------------------------------------- taxonomy
FAMILIES = [
 ('strategy','Strategy and research','revenue'),('web','Website and ecommerce','revenue'),('seo','SEO','revenue'),
 ('editorial','Editorial content','revenue'),('social','Social media','revenue'),('video','Video production','revenue'),
 ('design','Graphic design','revenue'),('email','Email and lifecycle marketing','revenue'),('paid','Paid media','revenue'),
 ('automation','Automation and integrations','revenue'),('reporting','Reporting and analytics','revenue'),
 ('sales','Sales and outreach','support'),('client','Client management','support'),('internal','Internal operations','admin'),
]
# code, family, name, unit, hours, source, level
T = [
 ('SA-01','strategy','Competitive analysis (full)','analysis',17.1,'MEASURED',4),
 ('SA-02','strategy','AI-assisted deck','deck',0.83,'MEASURED',3),
 ('SA-03','strategy','Growth diagnostic audit','audit',12,'ESTIMATE',4),
 ('SA-04','strategy','Brand and positioning direction','client',5,'ESTIMATE',4),
 ('SA-05','strategy','Research (general)','hour',1,'ESTIMATE',3),
 ('WB-01','web','Website build (standard project)','site',31.6,'MEASURED',4),
 ('WB-02','web','Custom component or section','component',1.27,'MEASURED',4),
 ('WB-03','web','Product page repair or refresh','session',1.65,'MEASURED',3),
 ('WB-04','web','AI product shot','shot',0.19,'MEASURED',2),
 ('WB-05','web','Website edit (minor)','edit',0.35,'ESTIMATE',2),
 ('WB-06','web','Website edit (structural)','edit',1,'ESTIMATE',3),
 ('WB-07','web','Bulk product upload','batch of 50',2,'ESTIMATE',1),
 ('WB-08','web','Campaign landing page','page',3,'ESTIMATE',3),
 ('WB-10','web','Full QA pass','site',2.5,'ESTIMATE',3),
 ('WB-11','web','Launch and handoff','site',2,'ESTIMATE',4),
 ('SE-01','seo','SEO programme (full site)','site',14,'ESTIMATE',4),
 ('SE-02','seo','On-page optimisation','page',0.5,'ESTIMATE',3),
 ('SE-03','seo','Google Business Profile setup','profile',1,'ESTIMATE',2),
 ('SE-04','seo','Monthly organic reporting','month/client',1,'ESTIMATE',3),
 ('SE-05','seo','SEO audit','audit',4,'ESTIMATE',4),
 ('SC-09','editorial','Blog post (end to end)','post',2.5,'BENCHMARK',3),
 ('SC-10','editorial','Blog images (prep and placement)','post',1.1,'MEASURED',2),
 ('SC-11','editorial','Weekly newsletter','newsletter',0.33,'MEASURED',3),
 ('SC-01','social','Static social graphic','graphic',0.4,'ESTIMATE',2),
 ('SC-02','social','Carousel','carousel',0.85,'ESTIMATE',2),
 ('SC-03','social','Caption and hashtags','post',0.12,'ESTIMATE',2),
 ('SC-04','social','Schedule 1 post','post/channel',0.03,'MEASURED',1),
 ('SC-05','social','Schedule a batch','batch of 15',0.45,'MEASURED',1),
 ('SC-06','social','Monthly content calendar','month/client',1.5,'ESTIMATE',3),
 ('SC-07','social','Content QC pass','batch',0.5,'ESTIMATE',3),
 ('SC-08','social','Community management','week/channel',0.75,'CONTRACT',2),
 ('SC-12','social','Social content session (mixed)','session',1,'ESTIMATE',3),
 ('VD-01','video','Short clip (automated)','clip',0.02,'MEASURED',1),
 ('VD-02','video','Reel edit (manual)','reel',0.47,'MEASURED',3),
 ('VD-03','video','Long-form or launch video edit','video',9.23,'MEASURED',3),
 ('VD-04','video','Captions and subtitles','video',0.2,'ESTIMATE',2),
 ('VD-05','video','Thumbnail','thumbnail',0.3,'ESTIMATE',2),
 ('VD-06','video','Filming or shoot','shoot',3,'ESTIMATE',3),
 ('GD-01','design','Print or flyer graphic','graphic',0.5,'ESTIMATE',2),
 ('GD-02','design','Brand asset or logo work','asset',1.5,'ESTIMATE',3),
 ('GD-03','design','Merch design','design',1.5,'ESTIMATE',3),
 ('EM-01','email','Email (AI-built, end to end)','email',0.72,'MEASURED',3),
 ('EM-02','email','Email (AI design only)','email',0.42,'MEASURED',3),
 ('EM-03','email','Email (edit and schedule)','email',0.3,'MEASURED',2),
 ('EM-04','email','Email (approved template deploy)','email',0.06,'MEASURED',1),
 ('EM-05','email','Email (custom design)','email',2.17,'MEASURED',3),
 ('EM-06','email','Email (custom, end to end)','email',2.47,'MEASURED',3),
 ('EM-07','email','Master template build','client',5.5,'ESTIMATE',3),
 ('EM-08','email','Lifecycle flow build','flow',5,'ESTIMATE',3),
 ('EM-09','email','List hygiene and segmentation','month/client',0.6,'ESTIMATE',2),
 ('PM-01','paid','Campaign plan','campaign',1.98,'MEASURED',4),
 ('PM-02','paid','Static ad creative','ad',1.01,'MEASURED',3),
 ('PM-03','paid','Video ad creative','ad',0.9,'ESTIMATE',3),
 ('PM-04','paid','Ad copy set','ad set',0.45,'ESTIMATE',3),
 ('PM-05','paid','Campaign build and launch','campaign',2.25,'ESTIMATE',4),
 ('PM-06','paid','Campaign management','week/campaign',1.25,'ESTIMATE',4),
 ('PM-07','paid','Pixel and tracking setup','account',2,'ESTIMATE',3),
 ('PM-08','paid','Commission reconciliation','cycle/client',0.9,'ESTIMATE',2),
 ('WB-09','automation','Form or integration build','build',2,'ESTIMATE',3),
 ('AU-01','automation','Custom tool build','build',4,'ESTIMATE',4),
 ('AU-02','automation','Tool or workspace setup (Notion, Metricool, CRM)','setup',1.5,'ESTIMATE',3),
 ('AU-03','automation','Troubleshooting and fixes','issue',0.75,'ESTIMATE',3),
 ('RP-01','reporting','Monthly report (multi-channel)','report',2.5,'ESTIMATE',3),
 ('RP-02','reporting','Monthly report (single channel)','report',1,'ESTIMATE',3),
 ('RP-03','reporting','Quarterly report','report',1.5,'ESTIMATE',3),
 ('SO-01','sales','Cold calls','call block',0.5,'ESTIMATE',2),
 ('SO-02','sales','Cold email or outreach campaign','campaign',1.5,'ESTIMATE',3),
 ('SO-03','sales','LinkedIn or social outreach','session',0.5,'ESTIMATE',2),
 ('SO-04','sales','Sales or discovery call','call',0.75,'ESTIMATE',4),
 ('SO-05','sales','Proposal or pitch deck','proposal',2,'ESTIMATE',4),
 ('SO-06','sales','Lead research and list building','session',0.75,'ESTIMATE',2),
 ('CM-01','client','Client call (15 min)','call',0.25,'MEASURED',4),
 ('CM-02','client','Client call (30 min)','call',0.5,'MEASURED',4),
 ('CM-03','client','Client call (45 min)','call',0.75,'MEASURED',4),
 ('CM-04','client','Client call (60 min)','call',1,'MEASURED',4),
 ('CM-05','client','Working session (90 min)','session',1.5,'MEASURED',4),
 ('CM-06','client','Async client comms','week/client',0.25,'ESTIMATE',3),
 ('CM-07','client','Approval packaging','submission',0.25,'ESTIMATE',2),
 ('CM-08','client','Client onboarding','client',3,'ESTIMATE',4),
 ('CM-09','client','Contract, scope change or negotiation','agreement',2,'MEASURED',4),
 ('CM-10','client','Invoicing and collections','invoice',0.25,'ESTIMATE',2),
 ('IO-01','internal','Time logging and admin','session',0.2,'ESTIMATE',1),
 ('IO-02','internal','Finance and accounting','session',0.5,'ESTIMATE',3),
 ('IO-03','internal','SOPs and documentation','document',2,'ESTIMATE',3),
 ('IO-04','internal','Internal meeting or strategy call','meeting',1,'ESTIMATE',4),
 ('IO-05','internal','Hiring, onboarding and training','session',1,'ESTIMATE',4),
 ('IO-06','internal','Business planning and modeling','session',2,'ESTIMATE',4),
 ('IO-07','internal','Mentorship, networking and programs','session',1,'ESTIMATE',4),
 ('IO-08','internal','Internal tools and systems','setup',1.5,'ESTIMATE',3),
]
fam_class = {f[0]: f[2] for f in FAMILIES}
types = {}
for i,(code,fam,name,unit,hrs,src,lvl) in enumerate(T):
    cls = fam_class[fam]
    types[code] = dict(code=code, family=fam, name=name, unit=unit, planHours=hrs, source=src, level=lvl,
        billable = cls=='revenue' or fam=='client', payoutEligible=True, cls=cls,
        description='', included='', excluded='', active=True, order=i)
taxonomy = dict(families={f[0]: dict(name=f[1], cls=f[2], order=i) for i,f in enumerate(FAMILIES)}, types=types,
                stages=['Planning','Production','Revision','QA','Delivery','Support'],
                complexity=['Low','Standard','High'])

# ---------------------------------------------------------------- clients
CL = [
 ('dk','Day & Knight Chess Club',['d&k','day & knight','day and knight','edwin','dk '],'901415542387'),
 ('equipt','EQUIPT Movement',['equipt','kodi'],'901416454931'),
 ('sos','Saturation of Sound',['sos','saturation of sound','joseph'],'901417243621'),
 ('hmd','HMD Fabrications',['hmd'],'901415720865'),
 ('hpc','Hospital Procedure Consultants',['hpc'],'901415542483'),
 ('casa','Casa Barranca',['casa barranca'],'901417243612'),
 ('terranova','Terranova Medica',['terranova','fdaw'],'901415542609'),
 ('ssi','Solid Supply Inc.',['ssi','solid supply'],'901415566594'),
 ('em','E&M Garage Solutions',['e&m'],'901418384679'),
 ('mycare','MyCARE',['mycare'],None),
 ('integrita','Integrita',['integrita'],None),
 ('dawn','Dawn Esthetics',['dawn'],None),
 ('yourhonor','Your Honor AI',['your honor','yourhonor'],None),
 ('prospects','New business (leads)',['django','school district','linda'],None),
 ('internal','Lucid Studio (internal)',[],None),
]
clients = {c[0]: dict(name=c[1], aliases=c[2],
    active=c[0] not in ('dawn','ssi'),
    kind='internal' if c[0]=='internal' else ('lead' if c[0]=='prospects' else 'client'),
    # Two brand hexes per client so charts read on either theme, Carter's answer 4.
    brandLight=None, brandDark=None) for c in CL}

def find_clients(text):
    t = ' '+text.lower()+' '
    hits=[]
    for cid,_,al,_ in CL:
        for a in al:
            m=re.search(r'(?<![a-z])'+re.escape(a.strip())+r'(?![a-z])', t)
            if m:
                if cid not in [h[1] for h in hits]: hits.append((m.start(),cid))
                break
    return [h[1] for h in sorted(hits)]

# ---------------------------------------------------------------- time log
def call_type(mins):
    return 'CM-01' if mins<=20 else 'CM-02' if mins<=37 else 'CM-03' if mins<=52 else 'CM-04' if mins<=75 else 'CM-05'

FUL_RULES = [
 (r'competitive analysis|competitve analysis','SA-01'), (r'audit','SA-03'), (r'quarterly report','RP-03'),
 (r'blog pic|blog image|pic.* onto site|picture edits','SC-10'), (r'product (shot|image|photo)|product images|swatches','WB-04'), (r'meta access|access','AU-02'), (r'press strip|custom code component|component','WB-02'),
 (r'product page','WB-03'), (r'landing page','WB-08'), (r'shopify|b2b|wholesale|website|site edit|site\b|colors, fonts','WB-01'),
 (r'blog pic|blog image|pic.* onto site|picture edits','SC-10'), (r'blog','SC-09'), (r'newsletter','SC-11'),
 (r'instant form|ad campaign|campaign on meta|meta ads campaign|campaign','PM-05'), (r'static ads','PM-02'),
 (r'\bads?\b','PM-06'), (r'figma|email templates','EM-05'), (r'email.*(schedul)|schedul.*email','EM-03'),
 (r'email edits','EM-03'), (r'email build|emails?\b','EM-01'), (r'klavio|klaviyo','EM-09'),
 (r'notion|metricool','AU-02'), (r'trouble ?shoot|fixes|issues','AU-03'), (r'negotiat','CM-09'),
 (r'requests|follow up|comms','CM-06'), (r'content calendar','SC-06'), (r'quality control|social media review|content review','SC-07'),
 (r'reel|vid\b|video','VD-02'), (r'clip','SC-05'), (r'scheduling|schedul','SC-05'), (r'flyer','GD-01'),
 (r'graphic|design|story post','SC-01'), (r'media|content|\bsos\b|d&k$|posting','SC-12'), (r'pre order|review|edits','WB-05'),
]
def rule(text, rules):
    t=text.lower()
    for pat,code in rules:
        if re.search(pat,t): return code
    return None

def map_row(cat, task, mins):
    t = (task or '').lower().strip()
    cls = find_clients(task or '')
    conf = 'high'; note=[]
    typ=None; client=None
    if cat=='Client Calls':
        if re.search(r'sales call|your honor|django', t):
            typ='SO-04'; client='prospects'
        else:
            typ=call_type(mins)
            client = cls[0] if cls else None
            if re.search(r'finn and joey', t): client='prospects'; conf='low'
    elif cat=='Update Calls':
        if 'finn' in t or 'sofia' in t: typ='IO-05'; client='internal'
        elif 'score' in t: typ='IO-07'; client='internal'
        elif 'linda' in t: typ='SO-04'; client='prospects'; conf='low'; note.append('Client call plus internal strategy')
        elif cls and cls[0]!='prospects': typ=call_type(mins); client=cls[0]; conf='low'; note.append('Mixed client and internal call')
        elif 'mycare' in t: typ='CM-09'; client='mycare'
        else: typ='IO-04'; client='internal'
    elif cat=='Outreach':
        client='internal'
        if 'cold call' in t: typ='SO-01'
        elif 'email outreach' in t: typ='SO-02'
        elif 'origami' in t or 'linkedin' in t: typ='SO-03'
        elif cls: client=cls[0]; typ='CM-06'; conf='low'
        else: typ='SO-02'; conf='low'
    elif cat=='Growth':
        client='internal'
        if re.search(r'score|mentor|networking',t): typ='IO-07'
        elif 'cold email research' in t: typ='SO-06'
        elif 'origami' in t: typ='SO-02'
        elif re.search(r'merch|shirt',t): typ='GD-03'
        elif 'projection' in t: typ='IO-06'
        elif 'finn' in t: typ='IO-05'
        else: typ='IO-06'; conf='low'
        if 'd&k newsletter' in t: conf='low'; note.append('Also includes D&K newsletter')
    elif cat=='Operations':
        client='internal'
        if 'time log' in t: typ='IO-01'
        elif re.search(r'financ|accounting',t): typ='IO-02'
        elif 'sop' in t: typ='IO-03'
        elif re.search(r'website',t): typ='WB-01'
        elif re.search(r'onboarding|lead tracker|deliverable assign',t): typ='IO-05'
        elif 'contract' in t: typ='CM-09'; client='prospects'
        elif 'metricool' in t: typ='IO-08'
        else: typ='IO-06'
        if 'merch' in t: conf='low'; note.append('Website plus merch')
    elif cat=='LS Social Media':
        client='internal'
        if 'filming' in t: typ='VD-06'
        elif 'launch video' in t or t=='editing': typ='VD-03'
        elif 'pitch deck' in t: typ='SO-05'; conf='low'; note.append('Pitch deck plus video production list')
        elif 'newsletter' in t: typ='SC-11'; conf='low'
        else: typ='SC-12'; conf='low'
    elif cat=='Client Fulfillment':
        typ = rule(task or '', FUL_RULES)
        client = cls[0] if cls else None
        if 'circle city' in t: client=None; note.append('Unknown client "Circle city"')
        if 'school district' in t: client='prospects'; conf='low'
        if 'ai project' in t: client='prospects'
    if len([c for c in cls if c!='prospects'])>1: conf='low'; note.append('Mentions more than one client; split if needed')
    if typ is None or client is None: conf='low'
    if typ is None: note.append('No task type matched')
    if client is None: note.append('No client matched')
    return client, typ, conf, note

wb = openpyxl.load_workbook(UP+'Lucid_Studio_Time_Log.xlsx')
ws = wb['Time Log']
raw_rows=[]; entries={}
seen={}
for i,r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
    if not r[1]: continue
    date=r[1].date(); name=r[2]; st=r[3]; en=r[4]; cat=r[6]; task=r[7]
    raw_rows.append(dict(row=i, date=str(date), name=name, start=st.strftime('%H:%M') if st else None,
                         end=en.strftime('%H:%M') if en else None, category=cat, task=task))
    pid = (name or '').lower()
    eid = 'imp'+sid('timelog',i)
    base = dict(id=eid, personId=pid, date=str(date), source='import', importRef=f'Time Log row {i}',
                importRaw=dict(category=cat, task=task), status='approved', approvedBy='import', approvedAt=NOW,
                createdAt=NOW, units=None, unitType=None, stage=None, complexity=None, ai=None, revision=None,
                note=task or '', clickupTaskId=None, clickupTaskName=None, allocations=None, deleted=False)
    if not st or not en:
        base.update(start=None, end=None, minutes=0, clientId=None, typeId=None, needsReview=True, reviewNotes=['Missing start or end time in the old log'],
                    status='draft', approvedBy=None, approvedAt=None, mapConfidence='low', joint=False, billable=False, payoutEligible=False, cls=None)
        entries[eid]=base; continue
    s = dt.datetime.combine(date, st, TZ); e = dt.datetime.combine(date, en, TZ)
    if e<=s: e += dt.timedelta(days=1)
    mins = round((e-s).total_seconds()/60)
    client, typ, conf, note = map_row(cat, task, mins)
    ty = types.get(typ) if typ else None
    base.update(start=int(s.timestamp()*1000), end=int(e.timestamp()*1000), minutes=mins, clientId=client, typeId=typ,
                mapConfidence=conf, needsReview=conf=='low', reviewNotes=note,
                billable = bool(ty and ty['billable'] and client not in (None,'internal','prospects')),
                payoutEligible=True, cls = ty['cls'] if ty else None, joint=False)
    key=(str(date), st, en, (task or '').strip().lower())
    seen.setdefault(key, []).append(eid)
    entries[eid]=base
# joint sessions: identical date/start/end/task logged by both people
for key, ids in seen.items():
    ppl = {entries[x]['personId'] for x in ids}
    if len(ids)>1 and ppl=={'carter','jonas'}:
        g='jg'+sid(*key)
        for x in ids: entries[x]['joint']=True; entries[x]['jointGroup']=g
# near-joint: same date/start, same category, both people (e.g. Debrief rows)
by_month={}
for e in entries.values():
    by_month.setdefault(e['date'][:7], {})[e['id']]=e

# ---------------------------------------------------------------- revenue
wb2 = openpyxl.load_workbook(UP+'LucidStudio_tracker_revenue_2026-08-13.xlsx')
LEDGER_MAP = {'dawn esthetics':'dawn','day & knight':'dk','ssi':'ssi','hpc':'hpc','myCARE'.lower():'mycare','terranova':'terranova',
  'integrita':'integrita','hmd fabs':'hmd','saturation of sound':'sos','equipt':'equipt','equipt movement':'equipt','casa barranca':'casa','e&m garage':'em'}
ledger={}; raw_ledger=[]
for i,r in enumerate(wb2['Ledger'].iter_rows(min_row=3, values_only=True), start=3):
    if not r[0]: continue
    d=r[0].date(); client=r[1]; typ=r[2]; amt=float(r[3]); status=r[4]; notes=r[5]
    raw_ledger.append(dict(row=i, date=str(d), client=client, type=typ, amount=amt, status=status, notes=notes))
    lid='rev'+sid('ledger',i)
    other = client.lower().startswith('mercury')
    st = 'paid' if status=='Paid' else 'ar' if status=='Accounts Receivable' else status.lower()
    cid = None if other else LEDGER_MAP.get(client.lower())
    ledger[lid]=dict(id=lid, clientId=cid, clientName=client, contractId=None,
        revenueType='other income' if other else ('retainer' if typ=='Retainer' else 'one-off'),
        serviceLine=None, invoiceDate=str(d), recognitionDate=str(d), expectedDate=str(d) if st=='ar' else None,
        paidDate=str(d) if st=='paid' else None, amount=amt, paidAmount=amt if st=='paid' else 0, status=st,
        notes=notes or '', poolEligible=not other, source='import', importRef=f'Ledger row {i}', deleted=False,
        needsReview = cid is None and not other)

contracts={}; raw_contracts=[]
for i,r in enumerate(wb2['Contracts'].iter_rows(min_row=3, values_only=True), start=3):
    if not r[1]: continue
    st=r[0].date(); client=r[1]; typ=r[2]; amt=float(r[3]); life=(r[4] or '').strip(); end=r[6].date() if r[6] else None
    try:
        billing_day = int(r[5])
    except (TypeError, ValueError):
        billing_day = st.day   # column holds a formula in some rows
    raw_contracts.append(dict(row=i, start=str(st), client=client, type=typ, amount=amt, lifecycle=life, end=str(end) if end else None))
    # Churned contracts are superseded history, not live agreements. Carter asked for
    # them out of the app; the raw sheet above still holds them for reference.
    if life.lower() != 'active':
        continue
    cid = LEDGER_MAP.get(client.lower())
    kid='con'+sid('contract',i)
    freq, billed = 'monthly', amt
    if cid in ('terranova','integrita'):
        freq, billed = 'quarterly', round(amt * 3, 2)   # sheet holds the monthly equivalent
    contracts[kid]=dict(id=kid, clientId=cid, clientName=client, contractType=typ.lower(), start=str(st),
        amount=billed, frequency=freq, billingDay=billing_day, lifecycle='active',
        includedServices=[], notes='', source='import', importRef=f'Contracts row {i}', deleted=False,
        needsReview=False, reviewNotes=[])

# Commission agreements carry a percentage, not a fixed amount, spec section 38.
for cid, pct, label in [('em', 10.0, 'E&M Garage Solutions'), ('yourhonor', 20.0, 'Your Honor AI')]:
    kid='con'+sid('commission',cid)
    contracts[kid]=dict(id=kid, clientId=cid, clientName=label, contractType='ad commission', start='2026-01-01',
        amount=None, percentCommission=pct, frequency='commission', billingDay=None, lifecycle='active',
        includedServices=[], notes='Commission on ad revenue.', source='seed', importRef=None, deleted=False,
        needsReview=False, reviewNotes=[])

# link ledger retainers to contracts
for l in ledger.values():
    if l['revenueType']!='retainer': continue
    cands=[c for c in contracts.values() if c['clientId']==l['clientId'] and c['start']<=l['invoiceDate'] and (not c.get('end') or l['invoiceDate']<=c['end'])]
    if cands: l['contractId']=sorted(cands,key=lambda c:c['start'])[-1]['id']

# ---------------------------------------------------------------- expenses (seeded from operating model 06_Financials, Jan-Aug)
# Expense seed figures are business data, so they live in data/expense_seed.json (not in git).
_EXP = json.load(open(os.path.join(UP, 'expense_seed.json')))
SEED = [tuple(x) for x in _EXP['seed']]
expenses={}
months=['2026-%02d'%m for m in range(1,9)]
for name,cat,total,note in SEED:
    per = round(total/8, 2); rem = round(total - per*7, 2)
    for k,m in enumerate(months):
        xid='exp'+sid('seed',name,m)
        expenses[xid]=dict(id=xid, vendor=name, category=cat, amount=rem if k==7 else per, date=m+'-15', recurring=False,
            frequency=None, allocation='overhead', clientId=None, owner=None, renewalDate=None, cancelNoticeDate=None,
            notes='Seeded estimate: Jan to Aug total from the operating model, spread evenly by month. '+note,
            source='seed', deleted=False, needsReview=False)
# recurring subscriptions and retainers going forward
REC = [tuple(x) for x in _EXP['recurring']]
for name,cat,amt,start,note,rv in REC:
    xid='exp'+sid('rec',name)
    expenses[xid]=dict(id=xid, vendor=name, category=cat, amount=amt, date=start, recurring=True, frequency='monthly', endDate=None,
        allocation='overhead', clientId=None, owner=None, renewalDate=None, cancelNoticeDate=None, notes=note, source='seed',
        deleted=False, needsReview=rv, reviewNotes=['Confirm start date'] if rv else [])

# ---------------------------------------------------------------- people + settings
people = {
 'carter': dict(name='Carter', fullName='Carter Davis', role='partner', title='CEO', poolMember=True, userId=None, weeklyCapacity=15, active=True),
 'jonas':  dict(name='Jonas',  fullName='Jonas Rutherford', role='partner', title='COO', poolMember=True, userId=None, weeklyCapacity=12, active=True),
}
COMMISSION = {'em': 10.0, 'yourhonor': 20.0}
settings = dict(poolPct=0.65, fixedSplit={'carter':0.40,'jonas':0.30}, hoursBasedFrom='2026-10', revenueBasis='cash', expenseTiming='after', annualGoal=100000, goalYear=2026, period='monthly',
   approvalMode='partner', timezone='America/Los_Angeles', longTimerHours=3, forgottenTimerHours=10, idleMinutes=30,
   workHours=dict(enabled=False, start='09:00', end='18:00', days=[1,2,3,4,5]), customAmounts={}, reconstructedThrough='2026-09',
   clickup=dict(workspaceId='90141089150', spaceIds=['90144952012','90144952229','90144953177','90144953217','90145032627']))

def dump(name, obj):
    with open(os.path.join(OUT,name+'.json'),'w') as f: json.dump(obj,f)
    return os.path.getsize(os.path.join(OUT,name+'.json'))

sizes={}
sizes['settings']=dump('settings', settings)
sizes['taxonomy']=dump('taxonomy', taxonomy)
sizes['clients']=dump('clients', dict(items=clients))
sizes['people']=dump('people', dict(items=people))
for m,items in by_month.items(): sizes['entries_'+m]=dump('entries_'+m, dict(month=m, items=items))
sizes['ledger']=dump('ledger', dict(items=ledger))
sizes['contracts']=dump('contracts', dict(items=contracts))
sizes['expenses']=dump('expenses', dict(items=expenses))
sizes['src_timelog']=dump('src_timelog', dict(file='Lucid_Studio_Time_Log.xlsx', importedAt=NOW, rows=raw_rows))
sizes['src_ledger']=dump('src_ledger', dict(file='LucidStudio_tracker_revenue_2026-08-13.xlsx', sheet='Ledger', importedAt=NOW, rows=raw_ledger))
sizes['src_contracts']=dump('src_contracts', dict(file='LucidStudio_tracker_revenue_2026-08-13.xlsx', sheet='Contracts', importedAt=NOW, rows=raw_contracts))
print(sizes)
low=[e for e in entries.values() if e['needsReview']]
print('entries',len(entries),'needs review',len(low),'joint',sum(e['joint'] for e in entries.values()))
for e in low: print(e['importRef'], e['personId'], e['clientId'], e['typeId'], '|', e['note'], '|', e['reviewNotes'])
print('ledger',len(ledger),'contracts',len(contracts),'expenses',len(expenses))
