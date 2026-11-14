import { redirect } from 'next/navigation';

// The front door is the groups page: signed in, it lists your groups; signed out, it sends you to the one sign-in screen.
export default function Home() { redirect('/groups'); }
