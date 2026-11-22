import type { ReactNode } from 'react';
import { SiteFrame } from '@/components/campus/site-frame';
import './when.css';

// Loopd When wears the app's top bar and foot, like every other page.
export default function WhenLayout({ children }: { children: ReactNode }) {
  return <SiteFrame back="/when/new">{children}</SiteFrame>;
}
