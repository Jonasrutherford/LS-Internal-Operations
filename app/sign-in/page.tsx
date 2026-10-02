import { signIn } from '@/app/actions/auth';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form
        action={signIn}
        className="panel"
        style={{ width: '100%', maxWidth: 340, padding: 24, display: 'grid', gap: 14 }}
      >
        <div>
          <div className="eyebrow">Lucid Studio</div>
          <h1 style={{ marginTop: 4 }}>Lucid OS</h1>
        </div>

        <label style={{ display: 'grid', gap: 5 }}>
          <span className="eyebrow">Email</span>
          <input type="email" name="email" autoComplete="email" required />
        </label>

        <label style={{ display: 'grid', gap: 5 }}>
          <span className="eyebrow">Password</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>

        <input type="hidden" name="next" value={next ?? '/'} />

        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--crit)', fontSize: 13 }}>{error}</p>
        )}

        <button type="submit" data-variant="primary">Sign in</button>
      </form>
    </div>
  );
}
