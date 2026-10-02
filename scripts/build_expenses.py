"""Turn the Mercury transaction export into Lucid OS expense documents.

Every one-off row traces to a real bank transaction. Nothing is estimated.

Excluded on purpose, because they are not operating costs:
  - transfers between Lucid's own Mercury and Chase accounts
  - owner draws (a distribution, not an expense)
  - payments to Carter and Jonas (partner payouts come out of the labor pool;
    counting them here as well would charge the same money twice)

Third-party contractors (Melanie, Sofia, Rehaan) are expenses and are kept.

Recurring subscription rules start after the last observed charge, so forward
projections never double-count a payment that already appears in the history.

Usage:  python3 scripts/build_expenses.py <mercury_export.csv>
"""
import csv, hashlib, json, os, sys, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'seed')

sid = lambda *p: hashlib.sha1('|'.join(map(str, p)).encode()).hexdigest()[:10]

# Account names that are Lucid's own: money moving between these is not spending.
INTERNAL = ('lucid studio -', 'chase - checking', 'mercury checking', 'mercury savings')
# Partner payments: these are payouts from the pool, not operating expenses.
PARTNERS = ('jonas rutherford', 'carter davis')
CONTRACTORS = ('melanie lee', 'sofia burke', 'rehaan anjaria')

CATEGORY = {
    'Software & Subscriptions': 'Software',
    'Marketing & Advertising': 'Marketing',
    'Business Meals': 'Meals',
    'COGS': 'Cost of delivery',
    'Office Supplies & Equipment': 'Equipment',
    'Payroll': 'Contractors',
}

# Annual subscriptions, from the subscription register. Amount is the annual
# charge; the date is the next renewal, so these project forward without
# colliding with the charges already in the transaction history.
ANNUAL = [
    ('ClickUp',          'Software',  336.00, '2027-04-14'),
    ('Calendly',         'Software',  120.00, '2027-03-02'),
    ('Framer',           'Software',  360.00, '2027-02-18'),
    ('Mercury',          'Software',  335.48, '2027-01-23'),
    ('Opus Clip',        'Software',  174.00, '2027-04-08'),
    ('Google Workspace', 'Software',  336.00, '2027-01-01'),
    ('Claude Pro',       'Software',  200.00, '2027-03-25'),
    ('GoDaddy',          'Software',   52.36, '2028-01-24'),
    ('Metricool',        'Marketing', 636.00, '2027-09-16'),
]
# Xero appears in the register at 240.00/yr with no renewal date recorded, and
# the transactions show a trial. It is flagged for review rather than guessed.
ANNUAL_REVIEW = [('Xero', 'Software', 240.00, None)]


def parse_date(s):
    s = (s or '').strip()
    for f in ('%m-%d-%Y', '%m/%d/%Y', '%Y-%m-%d'):
        try:
            return dt.datetime.strptime(s, f).date()
        except ValueError:
            pass
    return None


def build(src):
    expenses, skipped = {}, {'internal': 0, 'partner': 0, 'credit': 0, 'failed': 0}

    for i, r in enumerate(csv.DictReader(open(src)), start=2):
        try:
            amt = float(r['Amount'] or 0)
        except ValueError:
            continue
        if r['Status'] != 'Sent':
            skipped['failed'] += 1
            continue
        if amt >= 0:
            skipped['credit'] += 1
            continue

        desc = (r['Description'] or '').strip()
        low = desc.lower()
        cat_raw = (r['Category'] or '').strip()

        if any(k in low for k in INTERNAL):
            skipped['internal'] += 1
            continue
        # Partner payments are payouts, not expenses, so they stay out. Two exceptions:
        # reimbursed software, and the $400 payments to Carter that reimburse him for
        # paying Melanie through his personal account.
        reimburses_melanie = 'carter davis' in low and abs(amt) == 400.0
        if any(p in low for p in PARTNERS) and cat_raw != 'Software & Subscriptions' and not reimburses_melanie:
            skipped['partner'] += 1
            continue

        d = parse_date(r['Date (UTC)'])
        if not d:
            continue

        if reimburses_melanie:
            category = 'Contractors'
            desc = 'Melanie Lee (reimbursed via Carter)'
        elif any(c in low for c in CONTRACTORS):
            category = 'Contractors'
        elif cat_raw in CATEGORY:
            category = CATEGORY[cat_raw]
        elif cat_raw:
            category = cat_raw
        else:
            category = 'Uncategorized'

        xid = 'exp' + sid('mercury', i, desc, d)
        expenses[xid] = dict(
            id=xid, vendor=desc, category=category, amount=round(-amt, 2),
            date=str(d), recurring=False, frequency=None, allocation='overhead',
            clientId=None, owner=None, renewalDate=None, cancelNoticeDate=None,
            notes=f"Mercury transaction, {r.get('Bank Description') or desc}".strip()[:160],
            source='mercury', deleted=False, needsReview=(category == 'Uncategorized'),
            reviewNotes=['No category on the bank export'] if category == 'Uncategorized' else [],
        )

    for name, category, amount, renew in ANNUAL + ANNUAL_REVIEW:
        review = renew is None
        xid = 'exp' + sid('sub', name)
        expenses[xid] = dict(
            id=xid, vendor=name, category=category, amount=amount,
            date=renew or '2027-01-01', recurring=True, frequency='annual', endDate=None,
            allocation='overhead', clientId=None, owner=None,
            renewalDate=renew, cancelNoticeDate=None,
            notes='Annual subscription from the subscription register.'
                  + ('' if renew else ' No renewal date recorded, so the date shown is a placeholder.'),
            source='register', deleted=False, needsReview=review,
            reviewNotes=['Confirm renewal date'] if review else [],
        )

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'expenses.json'), 'w') as f:
        json.dump(dict(items=expenses), f)

    real = [x for x in expenses.values() if not x['recurring']]
    total = sum(x['amount'] for x in real)
    print(f'expense rows from transactions : {len(real)}  (${total:,.2f})')
    print(f'recurring subscription rules   : {len(expenses) - len(real)}')
    print(f'skipped internal transfers     : {skipped["internal"]}')
    print(f'skipped partner payouts        : {skipped["partner"]}')
    by = {}
    for x in real:
        by[x['category']] = by.get(x['category'], 0) + x['amount']
    print('\nby category:')
    for k, v in sorted(by.items(), key=lambda kv: -kv[1]):
        print(f'  {k:20s} ${v:>10,.2f}')


if __name__ == '__main__':
    build(sys.argv[1])
