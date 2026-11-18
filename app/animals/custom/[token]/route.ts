import { db } from '@/lib/db';
import { customFaceImage } from '@/lib/campus/custom-face';

// The animal a person had made from their own photo, beside the set in public/animals. The address is unguessable and
// changes with every new picture, so a picture never changes under its address.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const image = await customFaceImage(db(), (await params).token);
  if (!image) return new Response(null, { status: 404 });
  return new Response(Buffer.from(image), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
}
