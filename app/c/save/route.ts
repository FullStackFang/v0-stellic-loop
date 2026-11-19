import sharp from 'sharp';
import { db } from '@/lib/db';
import { listCampuses } from '@/lib/campus/listings';
import { savedPicture } from '@/lib/campus/save-picture';
import { css, grounds, isShape, SHAPES, type Swatch } from '@/lib/campus/save-shapes';
import { groupSource, mayDropMark, ownSource } from '@/lib/campus/save-source';
import { campusViewer } from '@/lib/campus/session';

// The picture a person saves out of the app (openspec loop-save-picture): their own animal, or with `org` and `group`
// the drawn picture of a group they are in. `small=1` is the pane's preview of the same picture. Who is asking is
// found here, and so is whether the Loop mark may be left off: nothing in the address is taken on trust.

const no = (status: number, words: string) => new Response(words, { status, headers: { 'cache-control': 'no-store' } });

export async function GET(request: Request) {
  const viewer = await campusViewer();
  if (!viewer) return no(401, 'Sign in to save your picture.');
  const asked = new URL(request.url).searchParams, shape = asked.get('shape') ?? 'profile';
  // The grounds this person is offered, for the pane: their school's own first.
  if (asked.get('grounds') === '1') return Response.json(grounds(viewer.kit).map((each): Swatch => ({ key: each.key, name: each.name, colour: css(each.bg) })), { headers: { 'cache-control': 'private, no-store' } });
  if (!isShape(shape)) return no(400, 'Pick one of the shapes.');
  const mark = asked.get('mark') !== '0';
  // Taking the mark off is Ink+. It is refused, not quietly given with the mark on.
  if (!mark && !await mayDropMark(db(), viewer.principal)) return no(403, 'Saving without the Loop mark comes with Loop Ink+.');
  const group = asked.get('group'), org = asked.get('org');
  const source = group || org ? await groupSource(db(), viewer.principal, { orgId: org ?? '', loopId: group ?? '' }) : await ownSource(db(), viewer.personId);
  if (!source) return no(404, 'Not found');
  if (!source.figure) return no(409, group ? 'This group has no picture yet.' : 'Pick an animal as your picture to save it.');
  const all = grounds(viewer.kit), ground = all.find(each => each.key === asked.get('ground')) ?? all[0];
  // Under a person's name, their school. A group has only its name.
  const sub = group || !viewer.campus ? '' : (await listCampuses(db())).find(each => each.slug === viewer.kit)?.name ?? '';
  let png = await savedPicture({ figure: source.figure, shape, ground, ink: all[1], mark, name: source.name, sub });
  // The pane shows its preview 232px tall: twice that, so it is sharp on a dense screen. The sticker is small already, and is shown whole.
  const small = asked.get('small') === '1';
  if (small && shape !== 'sticker') png = await sharp(png).resize({ height: 464 }).png().toBuffer();
  // A preview may be shown again from the browser's own copy for a minute, so going back to a pick is at once. The file itself is always made afresh.
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': small ? 'private, max-age=60' : 'private, no-store',
    'content-disposition': `${asked.get('dl') === '1' ? 'attachment' : 'inline'}; filename="${mark ? 'loop-' : ''}${SHAPES[shape].file}.png"` } });
}
