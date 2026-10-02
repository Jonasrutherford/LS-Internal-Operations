-- Every auth user needs a matching people row or they can sign in but have no
-- profile, and currentPerson() returns null forever. This creates one on signup.
-- The first person to sign up becomes admin so the system is reachable at all;
-- everyone after is an employee and an admin promotes them.

create or replace function handle_new_auth_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  first_user boolean;
begin
  select count(*) = 0 into first_user from people;

  insert into people (auth_user_id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when first_user then 'admin'::role_t else 'employee'::role_t end
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();
