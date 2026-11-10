import {timingSafeEqual} from 'node:crypto';
import {db} from '@/lib/db';
import {runDocumentBatch} from '@/lib/emba/document-worker';

export const maxDuration=60;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;
  const provided=Buffer.from(request.headers.get('authorization')??'');
  const expected=Buffer.from(`Bearer ${secret??''}`);
  if(!secret||provided.length!==expected.length||!timingSafeEqual(provided,expected))
    return new Response('Unauthorized',{status:401,headers:{'Cache-Control':'no-store'}});
  try {
    return Response.json(await runDocumentBatch(db()),{headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json({error:'Document processing unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
