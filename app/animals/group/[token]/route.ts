import { db } from '@/lib/db';
import { groupPictureImage } from '@/lib/emba/group-picture';

// A group's own picture as a 192px tile. The address is unguessable and names one drawing, so a picture never changes under its address:
// the CDN keeps it (s-maxage), and a new browser is answered from there, not by this function reading the database.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const image = await groupPictureImage(db(), (await params).token);
  if (!image) return new Response(null, { status: 404 });
  return new Response(Buffer.from(image), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable' } });
}
