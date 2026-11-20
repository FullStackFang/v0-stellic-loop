import type { ReactNode } from 'react';
import { SiteFoot } from '@/components/campus/foot';

// Making or changing a trip (/trips/…): the page as it always was, and the foot every page ends with.
export default function TripsLayout({ children }: { children: ReactNode }) {
  return <>{children}<SiteFoot /></>;
}
