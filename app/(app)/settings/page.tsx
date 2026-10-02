import { requirePerson } from '@/lib/auth';

export default async function SettingsPage() {
  const me = await requirePerson();
  return (
    <>
      <header><div className="eyebrow">System</div><h1>Settings</h1></header>
      <div className="panel" style={{ padding: 16, marginTop: 14, display: 'grid', gap: 10, maxWidth: 420 }}>
        <div>
          <div className="eyebrow">Name</div>
          <div>{me.name}</div>
        </div>
        <div>
          <div className="eyebrow">Access</div>
          <div style={{ textTransform: 'capitalize' }}>{me.role}</div>
        </div>
      </div>
    </>
  );
}
