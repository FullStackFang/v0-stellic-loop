import type { ReactNode } from 'react';
import { SiteFrame } from '@/components/campus/site-frame';

// A place's record wears the app's top bar and foot, read with the sign-in. The public place page above it does not (it
// is the same for everyone and cached: components/campus/public-frame.tsx).
export default function PlacesLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
