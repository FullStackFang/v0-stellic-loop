import { db } from '@/lib/db';
import { groupPictureImage } from '@/lib/emba/group-picture';
import { asWebp } from '@/lib/webp';

// A group's own picture as a 192px tile. The address is unguessable and names one drawing, so a picture never changes under its address:
// the CDN keeps it (s-maxage), and a new browser is answered from there, not by this function reading the database.
// It is kept as a PNG and served as WebP, like the animals (lib/webp.ts). The whole drawing (./full) stays a PNG, to be saved.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const image = await groupPictureImage(db(), (await params).token);
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(await asWebp(image)), { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable' } });
}
