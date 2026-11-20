import { redirect } from 'next/navigation';
import { SEATS_PAGE } from '@/lib/campus/doodles';

// Seats was a plain page here. It is a page of the app now, with the bar and the foot; links to the old place still arrive.
export function GET() {
  redirect(SEATS_PAGE);
}
