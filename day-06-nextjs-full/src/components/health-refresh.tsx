'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function HealthRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="button-primary"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
    >
      {isPending ? 'Refreshing probes' : 'Refresh probes'}
    </button>
  );
}
