-- Big Dog Math: prevent browser roles from calling privileged database helpers.
--
-- `nb_reset_class` deletes Number Blaster scores and must never be callable by
-- anonymous or signed-in student clients. `rls_auto_enable` is an event trigger
-- function, so direct RPC execution is unnecessary for every non-owner role.

begin;

revoke all on function public.nb_reset_class(text, text)
  from public, anon, authenticated;
grant execute on function public.nb_reset_class(text, text)
  to service_role;

revoke all on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

commit;
