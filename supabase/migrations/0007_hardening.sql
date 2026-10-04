-- Security advisor fixes: pin search_path on trigger functions, and keep the
-- security definer helpers off the anonymous API.
alter function public.check_task_type_eligibility() set search_path = public;
alter function public.check_time_entry() set search_path = public;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.current_person_id() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_person_id() to authenticated;
