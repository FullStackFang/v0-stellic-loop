import type { ReactNode } from 'react';
import { SiteFoot } from '@/components/campus/foot';

// A proposal (/p/…): the page as it always was, and the foot every page ends with.
export default function PLayout({ children }: { children: ReactNode }) {
  return <>{children}<SiteFoot /></>;
}
