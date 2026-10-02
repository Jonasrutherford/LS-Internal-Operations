'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent('Email or password is wrong. If you have not set a password yet, use "First time here" below.')}`);
  }

  revalidatePath('/', 'layout');
  redirect(next.startsWith('/') ? next : '/');
}

/** First login: the person chooses their own password rather than being issued one.
 *  Access is limited to lucidstudiollc.com in the database, and who gets admin is
 *  decided there too, not here. */
export async function createAccount(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password !== confirm) {
    redirect(`/sign-in?error=${encodeURIComponent('Those two passwords do not match.')}&mode=new`);
  }
  if (password.length < 10) {
    redirect(`/sign-in?error=${encodeURIComponent('Use at least 10 characters.')}&mode=new`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    const already = /already|registered|exists/i.test(error.message);
    redirect(`/sign-in?error=${encodeURIComponent(
      already
        ? 'That address already has a password. Sign in above instead.'
        : error.message,
    )}&mode=new`);
  }

  // With email confirmation switched off, signUp returns a session and the person
  // is already in. With it on, there is no session and they must confirm by email.
  if (!data.session) {
    redirect(`/sign-in?notice=${encodeURIComponent('Account created. Check your email to confirm it, then sign in.')}`);
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/sign-in');
}
