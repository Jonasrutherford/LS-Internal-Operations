import type { Metadata } from 'next';
import Link from 'next/link';
import { signIn, createAccount } from '@/app/actions/auth';
import Logo from '@/components/Logo';
import s from './signin.module.css';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string; mode?: string }>;
}) {
  const { error, notice, next, mode } = await searchParams;
  const creating = mode === 'new';

  const field = (label: string, name: string, type: string, autoComplete: string) => (
    <label className="field">
      <span>{label}</span>
      <input type={type} name={name} autoComplete={autoComplete} required />
    </label>
  );

  return (
    <div className={s.wrap}>
      <div className={s.brandSide}>
        <Logo className={s.logo} />
        <div>
          <h1 className={s.title}>LS Command</h1>
          <p className={s.tag}>Lucid Studio&apos;s operating command center.</p>
        </div>
        <p className={s.foot}>Time, clients, revenue and the work behind them, in one place.</p>
      </div>
      <div className={s.formSide}>
        <div className={s.card}>
          {error && <div className="notice crit" role="alert">{error}</div>}
          {notice && <div className="notice good" role="status">{notice}</div>}

          {creating ? (
            <form action={createAccount} className="stack" style={{ gap: 14 }}>
              <div>
                <h2>Set your password</h2>
                <p className="muted small">First time only. Use your lucidstudiollc.com address.</p>
              </div>
              {field('Work email', 'email', 'email', 'email')}
              {field('Choose a password', 'password', 'password', 'new-password')}
              {field('Confirm password', 'confirm', 'password', 'new-password')}
              <button type="submit" className="btn primary lg">Create account</button>
              <Link href="/sign-in" className="link small" style={{ textAlign: 'center' }}>I already have a password</Link>
            </form>
          ) : (
            <form action={signIn} className="stack" style={{ gap: 14 }}>
              <div><h2>Sign in</h2><p className="muted small">Lucid Studio team only.</p></div>
              {field('Email', 'email', 'email', 'email')}
              {field('Password', 'password', 'password', 'current-password')}
              <input type="hidden" name="next" value={next ?? '/'} />
              <button type="submit" className="btn primary lg">Sign in</button>
              <Link href="/sign-in?mode=new" className="link small" style={{ textAlign: 'center' }}>First time here? Set your password</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
