import { db } from '@/lib/db';
import { customFaceImage } from '@/lib/campus/custom-face';
import { asWebp } from '@/lib/webp';

// The animal a person had made from their own photo, beside the set in public/animals. The address is unguessable and
// changes with every new picture, so a picture never changes under its address:
// the CDN keeps it (s-maxage), and a new browser is answered from there, not by this function reading the database.
// It is kept as a PNG and served as WebP, like the set's faces (lib/webp.ts): turned once, then the CDN has it.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const image = await customFaceImage(db(), (await params).token);
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(await asWebp(image)), { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable' } });
}
