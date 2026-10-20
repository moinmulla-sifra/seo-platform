-- Strengthen browser-write provenance for workspace-owned records.
-- Provider-sourced metrics, reviews and integration state remain service-role/server-job only.
-- Apply after 001_localpulse_schema.sql.

drop policy if exists sales_orders_member_insert on public.sales_orders;
create policy sales_orders_member_insert on public.sales_orders
  for insert
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and source_provider in ('csv_import','manual_entry')
  );

drop policy if exists sales_orders_member_update on public.sales_orders;
create policy sales_orders_member_update on public.sales_orders
  for update
  using (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and source_provider in ('csv_import','manual_entry')
  )
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and source_provider in ('csv_import','manual_entry')
  );

drop policy if exists leads_member_insert on public.leads;
create policy leads_member_insert on public.leads
  for insert
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and source_provider in ('manual_entry','manual_import')
  );

drop policy if exists leads_member_update on public.leads;
create policy leads_member_update on public.leads
  for update
  using (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and source_provider in ('manual_entry','manual_import')
  )
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and source_provider in ('manual_entry','manual_import')
  );

drop policy if exists tracked_keywords_member_insert on public.tracked_keywords;
create policy tracked_keywords_member_insert on public.tracked_keywords
  for insert
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and tracker_provider = 'user_entered'
  );

drop policy if exists tracked_keywords_member_update on public.tracked_keywords;
create policy tracked_keywords_member_update on public.tracked_keywords
  for update
  using (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and tracker_provider = 'user_entered'
  )
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and tracker_provider = 'user_entered'
  );

drop policy if exists seo_tasks_member_insert on public.seo_tasks;
create policy seo_tasks_member_insert on public.seo_tasks
  for insert
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and source in ('manual','onboarding')
  );

drop policy if exists seo_tasks_member_update on public.seo_tasks;
create policy seo_tasks_member_update on public.seo_tasks
  for update
  using (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and source in ('manual','onboarding')
  )
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','member'])
    and is_demo = false
    and source in ('manual','onboarding')
  );

-- These tables contain provider-derived information and intentionally remain read-only
-- to browser clients: integrations, sync_runs, keyword_snapshots, seo_metrics_daily,
-- local_profile_metrics_daily, reviews and audit_logs.
