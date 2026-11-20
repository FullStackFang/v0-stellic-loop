import type { Metadata } from 'next';
import { CampusShell } from '@/components/campus/shell';

export const metadata: Metadata = { title: 'Join in · Loopd', description: 'Someone asked you along. Show up as a group and the reward unlocks.' };

export default function OutingLayout({ children }: { children: React.ReactNode }) {
  return <CampusShell>{children}</CampusShell>;
}
