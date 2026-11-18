import { redirect } from 'next/navigation';
import { frontIsCampus } from '@/lib/campus/schools';
import { FrontDoor } from './door';

export const dynamic = 'force-dynamic';

// The front door is the groups page: signed in, it lists your groups; signed out, it sends you to the one sign-in screen.
// With LOOP_FRONT=campus it is the campus app instead (openspec loop-campus-rewards, design D17).
export default function Home() {
  if (!frontIsCampus()) redirect('/groups');
  return <FrontDoor />;
}
