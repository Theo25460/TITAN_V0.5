-- SEC02: two tables let the signed-in player choose fields that belong to the staff. Found by sql/tests/300_client_writes.sql.
--  * contest_entries: the self-insert policy only checked user_id, so a player could insert an entry with
--    is_eligible = false / excluded_reason of their choosing (or, the other way, nothing prevents a pre-filled reason).
--    A player's own entry must be created eligible and without exclusion reason; only administrators set those.
--  * titan_moderation_reports: the insert policy only checked reporter_id, so a report could be created already
--    "resolved" with resolved_by / resolution_note / resolved_at of the reporter's choosing. A new report is open and unresolved.
-- Administrator policies (ALL, admin check) are untouched. Policy replacement only: no row changes, the caller owns the
-- transaction. Rollback: re-create the two policies with their previous single condition (user_id / reporter_id = auth.uid()).
drop policy if exists contest_entries_self_insert_v1 on public.contest_entries;
create policy contest_entries_self_insert_v1 on public.contest_entries as permissive for insert to authenticated
  with check (user_id = (select auth.uid()) and is_eligible is true and excluded_reason is null);

drop policy if exists titan_reports_insert_authenticated on public.titan_moderation_reports;
create policy titan_reports_insert_authenticated on public.titan_moderation_reports as permissive for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open'
              and resolved_by is null and resolution_note is null and resolved_at is null);
