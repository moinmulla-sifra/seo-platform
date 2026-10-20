-- Secure Google OAuth connection state and encrypted token storage.
-- Tokens and one-time OAuth state are accessible only to trusted server-side Edge Functions.
create table if not exists public.integration_oauth_states (
  state_hash text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  provider text not null check (provider in ('google_search_console','google_analytics_4','google_business_profile','google_sheets')),
  return_origin text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index if not exists integration_oauth_states_expiry_idx
  on public.integration_oauth_states(expires_at);

create table if not exists public.integration_credentials (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('google_search_console','google_analytics_4','google_business_profile','google_sheets')),
  token_ciphertext text not null,
  token_iv text not null,
  token_expires_at timestamptz,
  refresh_token_present boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.integration_oauth_states enable row level security;
alter table public.integration_credentials enable row level security;

-- Explicitly prevent normal browser roles from reading or writing tokens and OAuth state.
revoke all on public.integration_oauth_states from anon, authenticated;
revoke all on public.integration_credentials from anon, authenticated;
grant all on public.integration_oauth_states to service_role;
grant all on public.integration_credentials to service_role;

-- Preserve the distinction between Google Business Profile search/maps impressions
-- and interaction counts; do not incorrectly label impressions as "profile views".
alter table public.local_profile_metrics_daily
  drop constraint if exists local_profile_metrics_daily_metric_type_check;
alter table public.local_profile_metrics_daily
  add constraint local_profile_metrics_daily_metric_type_check
  check (metric_type in ('profile_views','call_clicks','direction_requests','website_clicks','search_impressions','maps_impressions','other'));

create index if not exists integrations_workspace_provider_updated_idx
  on public.integrations(workspace_id, provider, updated_at desc);
