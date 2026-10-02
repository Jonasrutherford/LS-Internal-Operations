# Lucid OS

Lucid Studio's internal operating system: time tracking, task visibility, clients,
contracts, revenue, expenses and company projections.

**GitHub is the source of truth. Vercel is production.** Claude Artifacts are not a
deployment target.

## Stack

Next.js (App Router, TypeScript) and Supabase (Postgres, auth, row-level security).

```bash
npm install
cp .env.example .env.local     # fill in your Supabase project values
npm run dev                    # http://localhost:3000
npm run build                  # production build
npm test                       # finance math checks
```

## Database

Migrations are in `supabase/migrations/`, applied in order:

- `0001_init.sql` schema, roles and row-level security
- `0002_seed.sql` task types, clients and contracts

Seed data covers reference data only. No revenue, expense or time data is seeded,
because inventing financial values is worse than an empty table.

## Authorization

Two roles. Employees get Dashboard, Time Log and Tasks, and can see what the team is
working on. They cannot reach Finances or System Admin, cannot manage clients, task
types or contracts, and cannot edit anyone else's time.

Admins get everything, including editing historical entries, which writes an audit row.

This is enforced by row-level security in Postgres and by `requireAdmin()` on the
server. Navigation visibility is a convenience on top, not the control.

## Time logging

Start a task with three inputs: internal or external, the client when external, and
the task. Stopping asks only for what the system does not already know: completed,
contract deliverable, a unit count for discrete deliverables, joint participants and
any parallel work. It should take about a minute.

Units exist only for genuinely countable work (emails, posts, graphics, reels,
reports). The unit is derived from the task type and is never hand-edited. Calls,
website builds, strategy and meetings are never asked for a count.

## Previous architecture

`src/`, `dist/`, `scripts/build.py` and `tests/payouts.test.js` are the earlier
single-file Claude artifact build, kept until the Next.js app reaches feature parity
and the team cuts over. The payout test needs the spreadsheets in `data/`, which stay
out of git.

The live artifact and its database are untouched by this rewrite, so the historical
time, revenue and payout records remain available for migration.
