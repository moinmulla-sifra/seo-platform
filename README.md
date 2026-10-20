# LocalPulse — local business performance SaaS

LocalPulse helps local businesses review recorded sales, leads, authorized SEO metrics, local profile activity and reviews in one workspace. It has two explicit modes: a fictional demo preview and an authenticated workspace mode.

## Current build status

- **Demo preview:** the original polished eight-screen demo remains available when `VITE_LOCALPULSE_MODE` is unset or set to `demo`. All seeded metrics are fictional and labelled as demo.
- **Authenticated workspace mode:** added in the `implementation/secure-mvp` branch. It includes Supabase Auth sign-in/sign-up/reset, user-owned workspaces, a business profile, workspace-scoped reads, persisted CSV/Excel sales imports with mapping/validation/history, sales and revenue KPIs from recorded orders only, enquiry entry, keyword entry, persisted checklist tasks, settings, CSV exports and honest disconnected-provider states.
- **Database security:** migrations provide workspace membership, RLS policies and provenance guardrails. They must be applied to the intended Supabase project and tested before production launch.
- **Google integration code:** an Edge Function now implements OAuth state/callback handling, encrypted refresh-token storage, token refresh, authorized resource selection and manual sync for Search Console, GA4, Business Profile and read-only Google Sheets. It is deployed to Supabase, but Google OAuth cannot complete until the three server secrets below are configured and the Google Cloud APIs/OAuth client are ready.
- **On-demand performance audits:** PageSpeed Insights and Chrome UX Report are implemented through an authenticated `website-audit` Edge Function, with workspace-scoped history in `website_performance_audits`. PageSpeed uses the saved business website and runs a mobile Lighthouse audit. CrUX returns aggregated real-user field data when eligible Chrome data exists; it requires the `CRUX_API_KEY` Edge Function secret and the Chrome UX Report API enabled in Google Cloud. `PAGESPEED_INSIGHTS_API_KEY` may be configured server-side if the current Google API quota requires it.
- **Still not implemented:** scheduled/background provider sync, a general-purpose crawler engine, review syncing/posting, third-party local-rank grids, email notifications, team invitations, subscription enforcement, Dodo Payments and final production deployment.
- **Integration catalog:** the authenticated app lists the requested search, analytics, performance, local listing, file/database and CMS providers. Cards marked **Planned** or **Experimental** are catalog/roadmap entries only; they do not connect, fetch, or display provider data yet. Google OAuth providers remain dependent on Google API access and server secrets. PageSpeed Insights and CrUX are live server-side audit flows, with the CrUX key requirement described above.
- **Capability guardrails:** Search Console average position is not an exact live rank check; CrUX can return no data for URLs/origins without enough eligible Chrome traffic; Business Profile performance metrics do not automatically grant access to review data; Google Trends has an official API in limited alpha access; `pytrends` remains an unofficial fallback. Treat the Trends connector as experimental until approved API access is available.

Do not advertise a Google connector as working until its OAuth flow, provider calls, storage, sync jobs and failure handling have passed an end-to-end test.

## Run locally

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

The app now defaults to authenticated SaaS mode. The shared LocalPulse Supabase URL and publishable key are configured as browser-safe defaults in `src/lib/supabase.ts` and documented in `.env.example`; override them using environment variables only when using a separate staging/development project.

1. Run `npm install` and `npm run dev`, or deploy the `main` branch to a static host.
2. Apply the SQL migrations in `supabase/migrations/` to the intended Supabase project (migrations 001–004 were applied to the connected `seo-platform` project in the `friday` organization).
3. Enable email/password auth in Supabase Auth, configure the Site URL and allowed redirect URLs for local development and the deployed domain, and verify the email confirmation flow.
4. The normal root URL opens sign-in/create-account. Use `/?demo=1` to opt into the demo preview.
5. When deploying, confirm that any pre-existing `VITE_LOCALPULSE_MODE=demo` build variable is removed; production builds default to the SaaS flow.

Use only the browser-safe publishable/anon key in `VITE_*`. Never put a `service_role` key, Google client secret, Google refresh token, or Dodo API key in client code or `.env.local` variables prefixed with `VITE_`. Server secrets belong in Supabase Edge Function secrets or a secure server secret manager.

## Validation

```bash
npm run typecheck
npm run build
npm run preview
```

A GitHub Actions workflow at `.github/workflows/ci.yml` runs the type check and production build on pushed implementation branches and pull requests. A green CI run does not replace RLS tests or real-provider integration testing.

## Demo mode vs authenticated SaaS mode

### Optional demo preview (`/?demo=1`)
- Uses fictional, deterministic data for TechNova Computers plus two other example businesses.
- Demo records are not copied into authenticated workspace tables.
- Demo imports, settings and checklist changes are session-only.
- Provider cards never pretend that Google or a POS is connected.

### Default authenticated SaaS mode
- A customer signs up once, verifies their email if confirmation is enabled, signs in, and creates their own workspace and first business inside the shared app. No customer-specific website or deployment is required.
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

## ## Google OAuth setup (required before Connect with Google can finish)

The OAuth handler is deployed as Supabase Edge Function `google-oauth` at:

`https://qrmglpizfjaoumbejcww.supabase.co/functions/v1/google-oauth`

Register that **exact URL** as an Authorized redirect URI on a Google Cloud OAuth Client ID whose application type is **Web application**. The callback exchanges the one-time authorization code on the server; Google passwords and tokens are never exposed to the browser. Official setup guide: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server).

### One-time administrator setup

1. In Google Cloud Console, choose/create the platform's Google Cloud project, configure its OAuth consent screen, and create a Web application OAuth client. If the consent screen is in Testing mode, add the relevant Google accounts as test users.
2. Enable the APIs used by your plan: **Google Search Console API**, **Google Analytics Data API**, **Google Analytics Admin API**, and **Google Sheets API**. For Google Business Profile, request/enable the supported Business Profile APIs and confirm the project has API access; some accounts/projects can have zero quota until access is approved. See [Business Profile API setup](https://developers.google.com/my-business/content/basic-setup).
3. In the Supabase dashboard for the `seo-platform` project, open **Edge Functions → Secrets** and add:
   - `GOOGLE_CLIENT_ID` — the Web application's OAuth client ID.
   - `GOOGLE_CLIENT_SECRET` — the secret from that same OAuth client.
   - `OAUTH_TOKEN_ENCRYPTION_KEY` — a Base64 string that decodes to exactly 32 random bytes. Generate one locally with PowerShell:
     ```powershell
     [byte[]]$bytes = New-Object byte[] 32
     [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
     [Convert]::ToBase64String($bytes)
     ```
   - Optional: `GOOGLE_OAUTH_REDIRECT_URI` — only set this if you need to override the callback URL above; it must match the Google Cloud redirect URI byte-for-byte.
4. Keep all three required values in Supabase server-side secrets. **Never paste the client secret or encryption key into GitHub, frontend environment variables, or chat.** The encryption key protects stored OAuth access/refresh tokens with AES-GCM.
5. Return to LocalPulse → Data Sources → Connect with Google. Choose the authorized site/property/location, then select **Sync now**. The connector only reports a successful connection after OAuth succeeds; it only reports data after an API call and database write succeed.

### Supported live data flows in this build

- **Google Search Console:** list authorized Search Console properties; manually sync daily clicks, impressions, CTR, average position and query/page keyword snapshots.
- **Google Analytics 4:** list accessible GA4 properties; manually sync sessions by date.
- **Google Business Profile:** list authorized locations; manually sync supported search/maps impressions, call clicks, website clicks and direction requests. API access/quota is controlled by Google.
- **Google Sheets:** authorize read-only access; paste a spreadsheet URL/ID and manually import rows using headers for Order ID, Order date, Status and Revenue amount. The first version accepts up to 1,000 rows per sync and reports rejected duplicates/invalid rows in import history.
- All integrations use a one-time OAuth state, least-privilege provider scopes, server-side encrypted tokens and refresh-token handling. No Google credential is stored in a Vite/browser variable.

## Current limitations / known gaps

- The OAuth flow is deployed but still requires the Google Cloud client and the three Supabase Edge Function secrets above before the provider buttons can complete authorization.
- Sync is currently manual; no background schedule or automatic periodic refresh is enabled.
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
