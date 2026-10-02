# Lucid OS

Lucid Studio's internal operating system: task-level time tracking linked to ClickUp, approvals, revenue, contracts, expenses, the 70% labor-pool payout engine, and company and individual dashboards.

**Live app:** https://claude.ai/artifact/Whr8uTA7z4by3d8wvt1VcU (private Claude artifact; ask Jonas for access)

## How it runs

Lucid OS is a single HTML page published as a Claude artifact. There is no server to host. The page gets everything else from the Claude platform at runtime:

| Capability | Used for |
|---|---|
| `db` | Shared database: time entries, timers, revenue, contracts, expenses, payouts, audit log |
| `user` | Knows who is signed in, so each person's timer and hours follow them |
| `mcp` (ClickUp) | Reads ClickUp tasks and lists with the viewer's own ClickUp connector |
| `sample` | Quick log: turns "made six Equipt emails" into a structured entry |
| `downloads` | CSV and Excel exports |

Editing files in this repo does **not** change the live app. You build, then publish `dist/lucid-os.html` to the artifact URL (see Deploying).

## Repo layout

```
src/
  head.html         <title>, fonts and all CSS (light and dark themes, brand tokens)
  core.js           State, time-zone helpers, payout engine, contract math, review checks, benchmarks, database writes + audit
  app.js            Boot, identity, shell, timer, start sheet, entry editor, quick log
  views-work.js     Track, Timesheet, Review queue, Company dashboard, My dashboard, charts
  views-money.js    Clients, Task types, Payouts, Revenue, Contracts, Expenses, Settings, Audit, event handling, ClickUp sync, export/import
assets/             Lucid logo (SVG and the path data inlined into the page)
scripts/
  build.py          Assembles src/ into dist/lucid-os.html
  build_seed.py     Normalizes the original spreadsheets into database seed documents (needs data/, not in git)
tests/
  payouts.test.js   Checks July to September payouts against the revenue ledger
  mock-db.js        In-browser fake of the db/user capabilities for local preview
dist/lucid-os.html  Built page. This is the file that gets published.
```

## Working on it

Requirements: Python 3 and Node 18+. No npm install.

```bash
python3 scripts/build.py          # build dist/lucid-os.html
node --check dist/app.js          # syntax check
```

Payout tests need the original spreadsheets in `data/` (ask Jonas; they are kept out of git on purpose):

```bash
python3 scripts/build_seed.py     # writes data/seed/*.json
node tests/payouts.test.js
```

The page only fully works inside Claude, because the database, sign-in and ClickUp come from the platform. For a quick local look, open the built page with `tests/mock-db.js` loaded first and `window.__SEED` set to the seed documents.

## Deploying

Publishing goes through Claude:

1. Open a Claude session with this repo attached.
2. Ask: "Build Lucid OS and publish dist/lucid-os.html to https://claude.ai/artifact/Whr8uTA7z4by3d8wvt1VcU, keeping the existing capabilities."

You need edit access to the artifact to publish. Publishing a new version keeps all data; the database lives with the artifact, not the page.

## Vercel

The repo deploys to Vercel as a static site with no build step: `vercel.json` serves the committed `dist/` folder (so always commit the rebuilt `dist/`). Import the repo in Vercel, keep the defaults, deploy.

What the Vercel URL does today: opened outside Claude, the page has no database, sign-in or ClickUp, so it shows a branded screen with a button into the live Claude app. It is a doorway, not a second copy. Running the full app directly on Vercel needs a backend of its own (database, auth, a ClickUp integration), which is the Next.js + Supabase version described in the original spec.

## Data model (database collections)

| Path | Contents |
|---|---|
| `config/settings` | Pool %, revenue basis, expense timing, goal, approvals, time zone, reminders |
| `config/taxonomy` | 14 service families and every task type (code, unit, planning hours, defaults) |
| `config/clients` | Clients, aliases, linked ClickUp list |
| `config/people` | Partners and contractors, pool membership, capacity, linked sign-in |
| `entries/<YYYY-MM>` | Time entries for that month, keyed by id |
| `timers/<person>` | The running timer, stored server-side |
| `fin/ledger`, `fin/contracts`, `fin/expenses` | Revenue lines, contracts, expenses and recurring rules |
| `payouts/<YYYY-MM>` | Locked payment periods with a snapshot |
| `audit/<YYYY-MM>` | Every change: who, when, field, before, after, reason |
| `sync/clickup` | Last ClickUp task sync |
| `source/*` | The original spreadsheet rows, read-only (only the artifact owner can write) |

Nothing is ever hard-deleted; records are marked `deleted: true`.

## Payout rules

- Monthly payment periods.
- Labor pool = eligible revenue × pool % (70%). Default basis is cash collected; other income such as bank bonuses is excluded.
- Expenses come out of the company's 30% (configurable to come out before the pool).
- Each partner's share = their approved, payout-eligible hours ÷ total approved hours. Cents are split so payouts always sum to the pool exactly.
- Joint sessions count in full for each person.
- Months through September 2026 are reconstructed from the imported log and labeled as such.

## Conventions

- Copy: plain words, active voice, no em dashes.
- Every change that affects payouts writes an audit row and asks for a reason.
- Colors are CSS tokens in `src/head.html`; components never use literal colors, so both themes stay readable.
