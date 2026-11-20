import type { ReactNode } from 'react';
import { SiteFrame } from '@/components/campus/site-frame';

// A shared link wears the app's top bar and foot, like every other page.
export default function SharedLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
