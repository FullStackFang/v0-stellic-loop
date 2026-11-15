import {db} from '@/lib/db';
import {calendarFeed} from '@/lib/emba/team-calendar';

// A member's calendar feed for one group (loop-trip, design D6). A calendar
// application fetches it with no sign-in: the token in the address is the
// only key. An unknown or replaced address, and one whose member has left,
// all answer the same way.
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}) {
  const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex','Referrer-Policy':'no-referrer'};
  try {
    const calendar=await calendarFeed(db(),(await params).token);
    return calendar===null?new Response('Not found',{status:404,headers}):new Response(calendar,{headers:{...headers,'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'inline; filename="loop.ics"'}});
  } catch {
    return new Response('Unavailable',{status:503,headers});
  }
}
