import { redirect } from 'next/navigation';
import { frontIsCampus } from '@/lib/campus/schools';
import { FrontDoor } from './door';

export const dynamic = 'force-dynamic';

// The front door is the campus app (openspec loop-campus-rewards, design D17). With LOOP_FRONT=groups it is the groups
// page again: signed in, it lists your groups; signed out, it sends you to the one sign-in screen.
export default function Home() {
  if (!frontIsCampus()) redirect('/groups');
  return <FrontDoor />;
}
