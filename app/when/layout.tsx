import type { ReactNode } from 'react';
import { SiteFrame } from '@/components/campus/site-frame';
import './when.css';

// Loopd When wears the app's top bar and foot, like every other page. Signing in from the bar stays on the poll.
export default function WhenLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
