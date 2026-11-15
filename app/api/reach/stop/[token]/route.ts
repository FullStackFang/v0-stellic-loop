import {db} from '@/lib/db';
import {stopFromLink} from '@/lib/emba/reach';

// The mail program's own "unsubscribe" button (RFC 8058): it posts here with
// no sign-in and no page. It does what the stop page's button does, for the
// one group that sent the message. A plain GET does nothing; the link in the
// message body opens the stop page instead.
export async function POST(_request:Request,{params}:{params:Promise<{token:string}>}) {
  const headers={'Cache-Control':'no-store'};
  try {
    return await stopFromLink(db(),(await params).token)?new Response(null,{status:204,headers}):new Response('Not found',{status:404,headers});
  } catch {
    return new Response('Unavailable',{status:503,headers});
  }
}
