# LocalPulse — local business performance SaaS

LocalPulse helps local businesses review recorded sales, leads, authorized SEO metrics, local profile activity and reviews in one workspace. It has two explicit modes: a fictional demo preview and an authenticated workspace mode.

## Current build status

- **Demo preview:** the original polished eight-screen demo remains available when `VITE_LOCALPULSE_MODE` is unset or set to `demo`. All seeded metrics are fictional and labelled as demo.
- **Authenticated workspace mode:** added in the `implementation/secure-mvp` branch. It includes Supabase Auth sign-in/sign-up/reset, user-owned workspaces, a business profile, workspace-scoped reads, persisted CSV/Excel sales imports with mapping/validation/history, sales and revenue KPIs from recorded orders only, enquiry entry, keyword entry, persisted checklist tasks, settings, CSV exports and honest disconnected-provider states.
- **Database security:** migrations provide workspace membership, RLS policies and provenance guardrails. They must be applied to the intended Supabase project and tested before production launch.
- **Not yet implemented:** Google OAuth/callback/token refresh/scheduled sync, live Search Console/GA4/Business Profile APIs, Google Sheets sync, a crawler/audit engine, review syncing/posting, third-party local-rank grids, email notifications, team invitations, subscription enforcement, Dodo Payments and final production deployment.

Do not advertise a Google connector as working until its OAuth flow, provider calls, storage, sync jobs and failure handling have passed an end-to-end test.

## Run locally

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

The default app launches in DEMO mode without Supabase credentials. To test the authenticated workspace mode:

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_LOCALPULSE_MODE=production`.
3. Set `VITE_SUPABASE_URL` to the API URL for the chosen Supabase project.
4. Set `VITE_SUPABASE_ANON_KEY` to that project's publishable/anon key.
5. Apply the SQL migrations in `supabase/migrations/` to that same project.
6. Enable email/password auth in Supabase Auth and configure the site URL plus allowed redirect URLs for local development and the deployed domain.
7. Restart Vite after changing environment variables.

Use only the browser-safe publishable/anon key in `VITE_*`. Never put a `service_role` key, Google client secret, Google refresh token, or Dodo API key in client code or `.env.local` variables prefixed with `VITE_`. Server secrets belong in Supabase Edge Function secrets or a secure server secret manager.

## Validation

```bash
npm run typecheck
npm run build
npm run preview
```

A GitHub Actions workflow at `.github/workflows/ci.yml` runs the type check and production build on pushed implementation branches and pull requests. A green CI run does not replace RLS tests or real-provider integration testing.

## Demo mode vs authenticated mode

### Demo preview
- Uses fictional, deterministic data for TechNova Computers plus two other example businesses.
- Demo records are not copied into authenticated workspace tables.
- Demo imports, settings and checklist changes are session-only.
- Provider cards never pretend that Google or a POS is connected.

### Authenticated workspace mode
- A signed-in owner creates a workspace and its first business.
- All business-owned records carry a `workspace_id`; SQL RLS policies enforce membership at the database layer.
- Revenue and order counts come from non-demo `sales_orders` records with a completed status. Leads remain separate.
- CSV/XLS/XLSX import uses the first worksheet, supports column mapping, checks mandatory fields, flags duplicate order IDs, previews rejected rows, and appends valid rows only after explicit confirmation. It does not overwrite old records.
- The first importer caps files at 10 MB and 500 rows. Split larger spreadsheets into smaller files.
- Settings and task status are persisted to Supabase. Workspace member roles are exposed read-only in the initial interface; team invitation and role administration are not yet implemented.

## Data definitions and source truth

- Google Search Console clicks, impressions, CTR and average position must originate from authorized Search Console syncs.
- GA4 sessions/events must originate from an authorized Analytics property.
- Local profile metrics must originate from a supported Business Profile API/feed.
- Revenue and completed-order totals come only from recorded sales rows. Website sessions, search clicks or leads never create an order or revenue.
- Keyword records can be user-entered, but position is shown as untracked until a real tracking provider is implemented.
- The site audit is shown as “Not run” until a crawler is built and run.
- Metrics in a live workspace are queried with `is_demo = false`; workspace data must not include demo seed rows.

## Migrations

- `supabase/migrations/001_localpulse_schema.sql` — main multi-tenant tables and RLS.
- `supabase/migrations/002_secure_workspace_writes.sql` — additional restrictions for client-side sales/lead/task/keyword writes.
- `supabase/migrations/003_lock_down_workspace_membership.sql` — prevents client-side membership role escalation; membership updates are intentionally not available through the browser UI.

Review the SQL, apply migrations to the intended new Supabase project, and verify:
1. Two users in separate workspaces cannot read, update, export or delete one another's rows.
2. A viewer cannot write; a member cannot administer another member or delete workspace data.
3. Client writes cannot label sales as Google/POS-sourced; provider-sourced rows are written only by trusted sync jobs.
4. Demo records never enter customer workspaces.
5. Imports preserve previous rows, detect duplicates and report errors.
6. A signed-out user cannot read workspace data.

The first three migrations have been applied successfully to the accessible, newly created Supabase project named `seo-platform`. The project currently contains all 17 public application tables with Row Level Security enabled and no seeded customer records. This does not yet constitute an end-to-end authentication test across multiple real users.

The migrations are a security-focused starter, not a certification or substitute for a production review.

## Environment and service configuration

See `.env.example`. Configure only the variables needed for the environment in use. Google OAuth client secrets, refresh tokens and Dodo API credentials are not required for the demo and are intentionally not included yet.

## Current limitations / known gaps

- Google connections are not operational in this branch. The setup action clearly says no OAuth flow was attempted.
- No scheduled job is currently refreshing provider data; no sync interval is implied.
- No local business directory scan or rank-grid tracker is present.
- Email authentication behavior depends on the email confirmation policy configured in Supabase Auth.
- Dodo Payments is not integrated; pricing/subscriptions are not enforced.
- The authenticated user can create workspaces; team invitations, agency admin screens and subscription-aware limits remain future work.
- Before a paid launch, implement provider Edge Functions/cron jobs, payment checkout/webhooks, idempotent syncs, error logging/alerts, customer data export/deletion, tested backups/recovery, rate limits and a production security review.

## Project layout

- `src/App.tsx` — demo preview app.
- `src/ProductionApp.tsx` — authenticated workspace MVP.
- `src/lib/supabase.ts` — safe browser client; publishable key only.
- `src/data/mockData.ts` — deterministic demo-only records.
- `src/lib/utils.ts` — shared demo utilities.
- `src/production.css` — responsive authenticated SaaS UI.
- `supabase/migrations/` — tenant schema and RLS policies.
