import { requirePerson } from '@/lib/auth';
import { loadCatalog, loadRunning } from '@/lib/data';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const person = await requirePerson();
  const [catalog, running] = await Promise.all([loadCatalog(), loadRunning(person.id)]);
  return <Shell person={person} catalog={catalog} running={running}>{children}</Shell>;
}
