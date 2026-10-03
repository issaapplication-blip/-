-- Persist the manager access fix for application_intakes.
-- Applied to project qmuxaehrahfsnabyjens on 2026-10-03.
grant select on table public.application_intakes to authenticated;
grant update on table public.application_intakes to authenticated;

drop policy if exists application_intakes_admin_select on public.application_intakes;
create policy application_intakes_admin_select
on public.application_intakes
for select to authenticated
using (public.is_admin());

drop policy if exists application_intakes_admin_update on public.application_intakes;
create policy application_intakes_admin_update
on public.application_intakes
for update to authenticated
using (public.is_admin())
with check (public.is_admin());
