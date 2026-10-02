import Link from 'next/link';
import { signIn, createAccount } from '@/app/actions/auth';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string; mode?: string }>;
}) {
  const { error, notice, next, mode } = await searchParams;
  const creating = mode === 'new';

  const field = (label: string, name: string, type: string, autoComplete: string) => (
    <label style={{ display: 'grid', gap: 5 }}>
      <span className="eyebrow">{label}</span>
      <input type={type} name={name} autoComplete={autoComplete} required />
    </label>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360, display: 'grid', gap: 14 }}>
        <div>
          <div className="eyebrow">Lucid Studio</div>
          <h1 style={{ marginTop: 4 }}>Lucid OS</h1>
        </div>

        {error && (
          <p role="alert" className="panel" style={{ margin: 0, padding: '10px 12px', color: 'var(--crit)', fontSize: 13 }}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="panel" style={{ margin: 0, padding: '10px 12px', fontSize: 13 }}>
            {notice}
          </p>
        )}

        {creating ? (
          <form action={createAccount} className="panel" style={{ padding: 20, display: 'grid', gap: 14 }}>
            <div>
              <h2>Set your password</h2>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                First time only. Use your lucidstudiollc.com address.
              </p>
            </div>
            {field('Work email', 'email', 'email', 'email')}
            {field('Choose a password', 'password', 'password', 'new-password')}
            {field('Confirm password', 'confirm', 'password', 'new-password')}
            <button type="submit" data-variant="primary">Create account</button>
            <Link href="/sign-in" style={{ color: 'var(--accent)', fontSize: 13, textAlign: 'center' }}>
              I already have a password
            </Link>
          </form>
        ) : (
          <>
            <form action={signIn} className="panel" style={{ padding: 20, display: 'grid', gap: 14 }}>
              {field('Email', 'email', 'email', 'email')}
              {field('Password', 'password', 'password', 'current-password')}
              <input type="hidden" name="next" value={next ?? '/'} />
              <button type="submit" data-variant="primary">Sign in</button>
            </form>

            <Link href="/sign-in?mode=new" className="panel"
                  style={{ padding: '12px 14px', fontSize: 13, textAlign: 'center', color: 'var(--accent)' }}>
              First time here? Set your password
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
