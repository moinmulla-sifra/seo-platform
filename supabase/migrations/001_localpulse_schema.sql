-- LocalPulse multi-tenant starter schema
-- Apply only in a fresh Supabase project after reviewing access policies.
-- Never place service_role keys or provider OAuth secrets in browser code.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  currency char(3) not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists workspace_members_user_workspace_idx on public.workspace_members(user_id, workspace_id);

-- SECURITY DEFINER helpers keep membership checks from recursing through workspace_members RLS.
create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.workspace_members wm where wm.workspace_id = target_workspace and wm.user_id = auth.uid()); $$;

create or replace function public.has_workspace_role(target_workspace uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.workspace_members wm where wm.workspace_id = target_workspace and wm.user_id = auth.uid() and wm.role = any(allowed_roles)); $$;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  category text,
  address text,
  city text,
  region text,
  country_code char(2) not null default 'IN',
  phone text,
  website text,
  service_areas jsonb not null default '[]'::jsonb,
  business_timezone text not null default 'Asia/Kolkata',
  currency char(3) not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists businesses_workspace_idx on public.businesses(workspace_id);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('google_search_console','google_analytics_4','google_business_profile','google_sheets','csv_import','pos_crm','rank_review_provider')),
  status text not null default 'not_connected' check (status in ('not_connected','pending','connected','error','paused')),
  account_label text,
  external_property_id text,
  approved_scopes text[] not null default '{}',
  public_config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_property_id)
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete set null,
  source text not null,
  status text not null check (status in ('queued','running','succeeded','partial','failed','cancelled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_seen integer not null default 0 check (rows_seen >= 0),
  rows_written integer not null default 0 check (rows_written >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.sales_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  file_name text not null,
  file_fingerprint text,
  imported_by uuid references auth.users(id) on delete set null,
  row_count integer not null default 0 check (row_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  status text not null default 'previewed' check (status in ('previewed','confirmed','failed','cancelled')),
  field_mapping jsonb not null default '{}'::jsonb,
  error_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists sales_imports_workspace_created_idx on public.sales_imports(workspace_id, created_at desc);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  import_run_id uuid references public.sales_imports(id) on delete set null,
  order_id text not null,
  order_date date not null,
  status text not null check (status in ('completed','pending','cancelled','refunded')),
  record_type text not null default 'sale_or_service',
  product_or_service text,
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null default 'INR',
  source_channel text,
  source_provider text not null default 'csv_import',
  source_record_id text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, order_id)
);
create index if not exists sales_orders_workspace_date_idx on public.sales_orders(workspace_id, order_date desc);
create index if not exists sales_orders_workspace_status_idx on public.sales_orders(workspace_id, status, order_date desc);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  lead_date date not null default current_date,
  lead_type text not null default 'enquiry',
  interest text,
  source_channel text,
  status text not null default 'new' check (status in ('new','qualified','contacted','won','lost')),
  external_lead_id text,
  customer_ref text,
  notes text,
  source_provider text not null default 'manual_import',
  source_record_id text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_workspace_date_idx on public.leads(workspace_id, lead_date desc);

create table if not exists public.tracked_keywords (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  keyword text not null check (char_length(trim(keyword)) between 1 and 300),
  intent text,
  search_location text,
  device text check (device in ('desktop','mobile','tablet','unknown') or device is null),
  landing_page text,
  tracker_provider text not null default 'user_entered',
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, keyword, search_location, device)
);
create index if not exists tracked_keywords_workspace_active_idx on public.tracked_keywords(workspace_id, active);

create table if not exists public.keyword_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  keyword_id uuid not null references public.tracked_keywords(id) on delete cascade,
  captured_at timestamptz not null default now(),
  position numeric(8,3),
  clicks integer check (clicks >= 0),
  impressions integer check (impressions >= 0),
  ctr numeric(8,5),
  source_provider text not null,
  source_location text,
  device text,
  is_demo boolean not null default false,
  sync_run_id uuid references public.sync_runs(id) on delete set null
);
create index if not exists keyword_snapshots_workspace_capture_idx on public.keyword_snapshots(workspace_id, captured_at desc);

create table if not exists public.seo_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  metric_date date not null,
  provider text not null check (provider in ('google_search_console','google_analytics_4','site_audit','user_tracker')),
  metric_type text not null,
  metric_value numeric(18,5) not null,
  metric_unit text,
  dimensions jsonb not null default '{}'::jsonb,
  source_record_id text,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  is_demo boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (workspace_id, metric_date, provider, metric_type, dimensions)
);
create index if not exists seo_metrics_daily_lookup_idx on public.seo_metrics_daily(workspace_id, provider, metric_date desc);

create table if not exists public.local_profile_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  metric_date date not null,
  provider text not null default 'google_business_profile',
  metric_type text not null check (metric_type in ('profile_views','call_clicks','direction_requests','website_clicks','other')),
  metric_value numeric(18,5) not null check (metric_value >= 0),
  dimensions jsonb not null default '{}'::jsonb,
  source_record_id text,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  is_demo boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (workspace_id, metric_date, provider, metric_type, dimensions)
);
create index if not exists local_profile_metrics_date_idx on public.local_profile_metrics_daily(workspace_id, metric_date desc);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  provider text not null,
  external_review_id text,
  reviewer_display_name text,
  rating smallint check (rating between 1 and 5),
  review_text text,
  review_date date,
  response_status text not null default 'unknown' check (response_status in ('replied','needs_reply','unknown','drafted')),
  response_text text,
  response_sent_at timestamptz,
  source_record_id text,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_review_id)
);
create index if not exists reviews_workspace_date_idx on public.reviews(workspace_id, review_date desc);

create table if not exists public.seo_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  category text,
  status text not null default 'open' check (status in ('open','in_progress','done','dismissed')),
  assigned_to uuid references auth.users(id) on delete set null,
  due_date date,
  source text not null default 'manual',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seo_tasks_workspace_status_idx on public.seo_tasks(workspace_id, status, priority);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  title text not null,
  report_type text not null default 'performance_summary',
  period_start date,
  period_end date,
  source_snapshot jsonb not null default '{}'::jsonb,
  output_path text,
  status text not null default 'draft' check (status in ('draft','generated','failed')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_workspace_created_idx on public.audit_logs(workspace_id, created_at desc);

-- RLS is enabled everywhere. Membership is the boundary; hidden UI controls are not authorization.
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

do $$
declare t text;
begin
  foreach t in array array['businesses','integrations','sync_runs','sales_imports','sales_orders','leads','tracked_keywords','keyword_snapshots','seo_metrics_daily','local_profile_metrics_daily','reviews','seo_tasks','reports','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_workspace_member(workspace_id))', t || '_member_select', t);
  end loop;

  -- User-editable workspace data. Views cannot write data because the role is checked here too.
  foreach t in array array['businesses','sales_imports','sales_orders','leads','tracked_keywords','seo_tasks','reports'] loop
    execute format('create policy %I on public.%I for insert with check (public.has_workspace_role(workspace_id, array[''owner'',''admin'',''member'']))', t || '_member_insert', t);
    execute format('create policy %I on public.%I for update using (public.has_workspace_role(workspace_id, array[''owner'',''admin'',''member''])) with check (public.has_workspace_role(workspace_id, array[''owner'',''admin'',''member'']))', t || '_member_update', t);
    execute format('create policy %I on public.%I for delete using (public.has_workspace_role(workspace_id, array[''owner'',''admin'']))', t || '_admin_delete', t);
  end loop;
end $$;

create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy workspaces_member_select on public.workspaces for select using (public.is_workspace_member(id) or created_by = auth.uid());
create policy workspaces_creator_insert on public.workspaces for insert with check (created_by = auth.uid());
create policy workspaces_admin_update on public.workspaces for update using (public.has_workspace_role(id, array['owner','admin'])) with check (public.has_workspace_role(id, array['owner','admin']));
create policy workspaces_owner_delete on public.workspaces for delete using (public.has_workspace_role(id, array['owner']));

create policy workspace_members_read_scope on public.workspace_members for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));
create policy workspace_members_insert_scope on public.workspace_members for insert with check (
  (user_id = auth.uid() and role = 'owner' and exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid()))
  or public.has_workspace_role(workspace_id, array['owner','admin'])
);
create policy workspace_members_update_admin on public.workspace_members for update using (public.has_workspace_role(workspace_id, array['owner','admin'])) with check (public.has_workspace_role(workspace_id, array['owner','admin']));
create policy workspace_members_delete_admin on public.workspace_members for delete using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- Connected data tables (integrations, sync_runs, keyword_snapshots, SEO/local metrics, reviews and audit_logs) intentionally have no client write policy.
-- Only trusted service-role server jobs should write those provider-sourced rows; service_role bypasses RLS and must never be shipped to the browser.
-- Recommended: provider credentials are kept in Supabase Vault or server-only secrets and accessed
-- only by trusted Edge Functions. Store only non-secret connector metadata in integrations.public_config.
-- For background syncs use a trusted service role job with explicit workspace scoping and audit logs.
