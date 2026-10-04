-- No email confirmation step: sign-up is limited to the two team addresses and
-- confirmed on creation.
create or replace function public.auto_confirm_allowed() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) not in ('carter@lucidstudiollc.com', 'jonas@lucidstudiollc.com') then
    raise exception 'LS Command sign-up is limited to the Lucid Studio team';
  end if;
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end $$;
revoke execute on function public.auto_confirm_allowed() from public, anon, authenticated;
create trigger auto_confirm_allowed before insert on auth.users for each row execute function public.auto_confirm_allowed();
