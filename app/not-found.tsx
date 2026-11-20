import type { Metadata } from 'next';
import { Spill } from '@/components/errors/spill';

export const metadata: Metadata = { title: 'No page here · Loopd' };

// What any address that leads nowhere shows, and any page that says its subject is not there.
export default function NotFound() {
  return <Spill kind="lost" />;
}
