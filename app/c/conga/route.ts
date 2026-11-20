import { db } from '@/lib/db';
import { congaPlayer } from '@/lib/campus/conga';
import { campusViewer } from '@/lib/campus/session';

// What the Conga game (public/conga, a plain page) asks as it opens: who is playing. Someone signed out is told so,
// and plays as before. It lives under /c so that the sign-in is read for it (proxy.ts).
export async function GET() {
  const viewer = await campusViewer();
  return Response.json(viewer ? await congaPlayer(db(), viewer) : null, { headers: { 'cache-control': 'private, no-store' } });
}
