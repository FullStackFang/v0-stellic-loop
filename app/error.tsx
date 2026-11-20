'use client';

import { Spill } from '@/components/errors/spill';

// What a page shows when it breaks, unless a nearer error file knows more. The bar and foot of the root layout stay.
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  return <Spill kind="broke" error={error} retry={retry} />;
}
