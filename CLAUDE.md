# LS Command: notes for Claude

GitHub is the source of truth. Vercel is production. Claude Artifacts are not used
for production and are not a deployment target.

- Next.js (App Router, TypeScript) + Supabase. `npm run dev`, `npm run build`, `npm test`.
- Authorization is enforced in the database. Every table has row-level security in
  `supabase/migrations/`. `requireAdmin()` in `lib/auth.ts` guards Finances and System
  Admin pages, and `assertAdmin()` guards server actions. Hiding a nav link is never
  the control.
- Finance math lives in `lib/finance.ts` and is covered by `tests/finance.test.mjs`.
  Run `npm test` after touching it.
- Never store a derived monthly figure as a contract. Billing frequency is recorded
  exactly as agreed; monthly equivalents are computed for analytics only.
- Never invent financial values, time entries or task estimates. Show N/A or
  Insufficient Data instead.
- Every change to money or to someone else's time writes an audit row through
  `audit()` in `lib/auth.ts`.
- Payouts have two regimes: fixed shares of revenue through 2026-09 (Carter 40%,
  Jonas 30%), then a 65% pool split by share of approved hours from 2026-10.
  `hoursBasedFrom` and `fixedSplit` in settings control this. Never recompute an
  old month under today's rules.
- Removed for V1 and not to be reintroduced: ClickUp, AI Quick Log, Switch,
  Review Queue, compensation models, manual task units.
- Style: plain copy, no em dashes, colors only via the CSS tokens in
  `app/globals.css`. The old yellow accent is retired; the accent is Lucid orange.

## Still on the old architecture

`src/`, `dist/`, `scripts/build.py` and `tests/payouts.test.js` are the previous
single-file Claude artifact build. They are kept until the Next.js app reaches
feature parity and the team cuts over, then removed. Do not add to them.

`tests/payouts.test.js` cannot run here: it needs the spreadsheets in `data/`, which
are deliberately kept out of git.
