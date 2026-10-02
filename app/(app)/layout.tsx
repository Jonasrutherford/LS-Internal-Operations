import { requirePerson } from '@/lib/auth';
import Shell from '@/components/Shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const person = await requirePerson();
  return <Shell person={person}>{children}</Shell>;
}
