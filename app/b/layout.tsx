import type { ReactNode } from 'react';
import { SiteFoot } from '@/components/campus/foot';

// A board and its pages (/b/…): the page as it always was, and the foot every page ends with.
export default function BLayout({ children }: { children: ReactNode }) {
  return <>{children}<SiteFoot /></>;
}
