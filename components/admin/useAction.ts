'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/** Runs a server action, shows its error, refreshes server data on success. */
export function useAction() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) { setError(r.error ?? 'Something went wrong.'); return; }
      after?.();
      router.refresh();
    });
  };
  return { run, busy, error, setError };
}
