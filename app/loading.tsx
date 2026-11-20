import { PageWait } from '@/components/loading/page-wait';

// What any page shows while it loads, unless a nearer loading file knows more (openspec loop-loading-seats, design D15).
export default function Loading() {
  return <PageWait />;
}
