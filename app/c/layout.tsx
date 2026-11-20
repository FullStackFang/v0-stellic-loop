import type { Metadata } from 'next';
import { CampusShell } from '@/components/campus/shell';

export const metadata: Metadata = { title: 'This week · Loopd', description: 'Events from your campus and plans posted by people near you. Show up as a group and the reward unlocks.' };

export default function CampusLayout({ children }: { children: React.ReactNode }) {
  return <CampusShell>{children}</CampusShell>;
}
