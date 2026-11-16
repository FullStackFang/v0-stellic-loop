import {timingSafeEqual} from 'node:crypto';
import {db} from '@/lib/db';
import {clerkEmailOf} from '@/lib/emba/clerk-identity';
import {emailSender} from '@/lib/emba/reach-email';
import {drainReach,sendingOn} from '@/lib/emba/reach-send';

// Every 15 minutes: queue the reminders and results that have become due, and send what is queued.
export const maxDuration=60;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;
  const provided=Buffer.from(request.headers.get('authorization')??'');
  const expected=Buffer.from(`Bearer ${secret??''}`);
  if(!secret||provided.length!==expected.length||!timingSafeEqual(provided,expected))
    return new Response('Unauthorized',{status:401,headers:{'Cache-Control':'no-store'}});
  const headers={'Cache-Control':'no-store'};
  if(!sendingOn())return Response.json({on:false},{headers});
  // Without the site's address every link in a message would lead nowhere, the stop link included.
  if(!(process.env.NEXT_PUBLIC_APP_URL??'').startsWith('https://'))return Response.json({on:true,error:'NEXT_PUBLIC_APP_URL is not set'},{status:503,headers});
  const email=emailSender();
  // The switch is on with no email provider set up: nothing is touched, so nothing is marked failed.
  if(!email)return Response.json({on:true,error:'No email provider is configured'},{status:503,headers});
  try {
    return Response.json(await drainReach(db(),{address:personId=>clerkEmailOf(db(),personId),email}),{headers});
  } catch {
    return Response.json({error:'Sending unavailable'},{status:503,headers});
  }
}
