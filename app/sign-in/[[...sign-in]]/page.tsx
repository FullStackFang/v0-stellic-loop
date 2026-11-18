import type { Metadata } from 'next';
import { CampusShell } from '@/components/campus/shell';
import { DoorPage } from '../../door';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in · Loop' };

/**
 * Sign-in for the campus screen: the same door as the front page. Afterwards a person goes back to the page they came
 * from (the sign-in form reads ?redirect_url), else to `/`, which sends them on to their school.
 */
export default function CampusSignInPage() {
  return <CampusShell><DoorPage routing="path" /></CampusShell>;
}
