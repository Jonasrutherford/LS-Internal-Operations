import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Person } from './types';

/** The signed-in person, or null. Reads through RLS, so it can only ever return
 *  the caller's own row. */
export async function currentPerson(): Promise<Person | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('people')
    .select('id, auth_user_id, name, role, active')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle();

  return (data as Person) ?? null;
}

/** Guard for any page, server action or route handler that needs a signed-in person. */
export async function requirePerson(): Promise<Person> {
  const person = await currentPerson();
  if (!person) redirect('/sign-in');
  return person;
}

/** Guard for Finances and System Admin. Server side, so hiding the nav is not the
 *  only thing standing between an employee and this data. Row-level security
 *  refuses the rows as well; this gives a clean redirect instead of an empty page. */
export async function requireAdmin(): Promise<Person> {
  const person = await requirePerson();
  if (person.role !== 'admin') redirect('/');
  return person;
}

/** Same guard for route handlers and server actions, where a redirect is wrong. */
export async function assertAdmin(): Promise<Person> {
  const person = await currentPerson();
  if (!person) throw new Error('Not signed in');
  if (person.role !== 'admin') throw new Error('Not authorized');
  return person;
}

/** Writes an audit row. Every change that touches money or someone else's time
 *  goes through this. */
export async function audit(entry: {
  table_name: string;
  record_id: string;
  field?: string | null;
  before_value?: string | null;
  after_value?: string | null;
  reason?: string | null;
}) {
  const supabase = await createClient();
  const person = await currentPerson();
  await supabase.from('audit_log').insert({
    person_id: person?.id ?? null,
    table_name: entry.table_name,
    record_id: entry.record_id,
    field: entry.field ?? null,
    before_value: entry.before_value ?? null,
    after_value: entry.after_value ?? null,
    reason: entry.reason ?? null,
  });
}
