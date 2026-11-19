import { db } from '@/lib/db';
import { groupPictureImage } from '@/lib/emba/group-picture';

// A group's own picture, whole: the drawing as it was made, up to 1024px.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const image = await groupPictureImage(db(), (await params).token, true);
  if (!image) return new Response(null, { status: 404 });
  return new Response(Buffer.from(image), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
}
