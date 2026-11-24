import type { ReactNode } from 'react';
import { SiteFrame } from '@/components/campus/site-frame';

// A place's record wears the app's top bar and foot, like every other page.
export default function PlacesLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
