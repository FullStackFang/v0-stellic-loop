import { db } from '@/lib/db';
import { congaPlayer } from '@/lib/campus/conga';
import { congaBoards, saveBest } from '@/lib/campus/conga-board';
import { campusViewer } from '@/lib/campus/session';

// The end of a Conga round, from the game (public/conga/index.html): the line it ended with, kept as the player's best on
// that map this week if it beats it. Answers with the boards as they now stand, for the card to show. Only someone signed
// in is kept; anyone else is told 401, and the game shows them where they would have been.
export async function POST(request: Request) {
  const viewer = await campusViewer();
  if (!viewer) return Response.json({ error: 'Sign in to go on the board.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { map?: unknown; best?: unknown; seconds?: unknown; face?: unknown; picture?: unknown } | null;
  const round = { map: String(body?.map ?? ''), best: Number(body?.best), seconds: Number(body?.seconds), face: Number(body?.face) || 0, picture: typeof body?.picture === 'string' ? body.picture : null };
  const kept = await saveBest(db(), viewer.personId, await congaPlayer(db(), viewer), round);
  if (!kept) return Response.json({ error: 'That round could not be kept.' }, { status: 400 });
  return Response.json({ boards: await congaBoards(db(), viewer.personId) });
}
