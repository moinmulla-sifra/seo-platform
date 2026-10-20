-- Store authenticated, workspace-scoped PageSpeed Insights and CrUX audit snapshots.
create table public.website_performance_audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('pagespeed_insights', 'chrome_ux_report')),
  strategy text not null check (strategy in ('mobile', 'desktop')),
  target_url text not null,
  run_status text not null default 'completed' check (run_status in ('completed', 'failed')),
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index website_performance_audits_workspace_business_created_idx
  on public.website_performance_audits (workspace_id, business_id, created_at desc);

alter table public.website_performance_audits enable row level security;

-- Browser users may read only audits for workspaces they belong to. Writes use the
-- authenticated Edge Function's service-role client after checking user and membership.
revoke all on table public.website_performance_audits from anon, authenticated;
grant select on table public.website_performance_audits to authenticated;

create policy "workspace members can read website performance audits"
  on public.website_performance_audits
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = website_performance_audits.workspace_id
        and wm.user_id = auth.uid()
    )
  );
