import type { Metadata } from 'next';
import { CampusShell } from '@/components/campus/shell';

export const metadata: Metadata = { title: 'Browser extension · Loopd', robots: { index: false } };

export default function ExtLayout({ children }: { children: React.ReactNode }) {
  return <CampusShell>{children}</CampusShell>;
}
