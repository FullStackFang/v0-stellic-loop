import type { ReactNode } from 'react';
import { SiteFoot } from '@/components/campus/foot';

// A cohort trip (/trip/…): the page as it always was, and the foot every page ends with.
export default function TripLayout({ children }: { children: ReactNode }) {
  return <>{children}<SiteFoot /></>;
}
