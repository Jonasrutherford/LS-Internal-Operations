# LS Command: notes for Claude

GitHub is the source of truth. Vercel (`lucid-os-original`) is production. Supabase
project `sakwqqljepiflbbqbyuj` is the only data store. Claude Artifacts and browser
storage are not used.

- Next.js (App Router, TypeScript) + Supabase. `npm run dev`, `npm run build`, `npm test`.
- Product name is LS Command. Lucid Studio is the company. Never "Lucid OS" in the UI.
- Authorization is enforced in the database. Every table has row-level security in
  `supabase/migrations/`. `requireAdmin()` guards admin pages and `assertAdmin()`
  guards admin server actions. Hiding a nav link is never the control.
- Work taxonomy rules live in two places that must agree: `lib/taxonomy.ts` (what
  the UI offers) and the `check_time_entry` trigger (what the database accepts).
- Clients, prospects and partners are separate. Internal work has no relationship.
  Never add a fake client for internal work or leads.
- Finance math is in `lib/finance.ts` and `lib/economics.ts`, covered by
  `tests/finance.test.mjs`. Run `npm test` after touching them.
- Never invent financial values, time entries or task estimates. Show N/A or an
  explained empty state instead.
- Every change to money, the taxonomy or someone else's time writes an audit row
  through `audit()` in `lib/auth.ts`.
- Payouts: fixed shares of paid revenue through 2026-09, then a 65% pool split by
  logged hours from 2026-10 (`app_settings`). Never recompute an old month under
  newer rules.
- Not to be reintroduced: ClickUp, AI Quick Log, Switch Task, Review Queue,
  approvals, compensation models, billable and payout-hour checkboxes, typed units.
- Style: plain copy, no em dashes, colors only via the tokens in `app/globals.css`.
  Headings Outfit, body Nunito. Heatmaps use the yellow to tangerine ramp.
- Destructive SQL through the Supabase MCP waits for a human confirmation. Prefer
  moving or archiving over dropping.
