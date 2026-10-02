import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Request-scoped Supabase client. Carries the signed-in user's session, so every
 *  query runs under that user's row-level security policies. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
