-- Prevent admins from elevating their own role or rewriting membership records.
-- Team invitation and role-edit UI is not implemented in the initial authenticated MVP.
-- Keep membership records read-only to non-owners; no client-side membership UPDATE policy exists.

drop policy if exists workspace_members_insert_scope on public.workspace_members;
drop policy if exists workspace_members_update_admin on public.workspace_members;
drop policy if exists workspace_members_delete_admin on public.workspace_members;

create policy workspace_members_insert_owner on public.workspace_members
  for insert
  with check (
    (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.created_by = auth.uid()
      )
    )
    or (
      public.has_workspace_role(workspace_id, array['owner'])
      and role in ('admin','member','viewer')
    )
  );

create policy workspace_members_delete_owner on public.workspace_members
  for delete
  using (
    public.has_workspace_role(workspace_id, array['owner'])
    and role <> 'owner'
  );

-- Intentionally no UPDATE policy on workspace_members:
-- the owner can later use a trusted admin UI/RPC to change roles with audit logging.
