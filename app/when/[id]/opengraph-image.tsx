import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '@/lib/db';
import { pollView } from '@/lib/when/polls';
import { dayText, meetingSpan } from '@/lib/when/send';
import { lengthText } from '@/lib/when/slots';

export const alt = 'A Loopd poll: when can you make it?';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

// Hex copies of the campus tokens (app/c/campus.css): the picture is drawn outside the page, where they do not reach.
const INK = '#0f2540', FIELD = '#ecff5a', SHADOW = '#b4cc3a', PAPER = '#fdfefb', STUB = '#f5ffc4', MUTE = '#5d6570', ACTION = '#0a5c9e';
const black = readFile(join(process.cwd(), 'public/fonts/Archivo-Black.ttf'));

/**
 * The picture a chat app shows under a poll's link: the poll as a ticket. Its name and who asked on the paper; on the
 * stub what to do (answer by a day) or, once the time is set, the time. It shows nothing the page itself does not
 * show to anyone who has the link.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const view = await pollView(db(), null, (await params).id).catch(() => null), zone = view?.frame.timezone ?? 'UTC';
  const title = view?.title ?? 'Find a time that works for everyone', long = title.length;
  const asked = view ? `${view.organizer.name.split(' ')[0]} asked for ${lengthText(view.minutes)}` : 'One link. Everyone adds the times they can make.';
  const [say, pill] = !view ? ['When can you make it?', 'Loopd When']
    : view.chosen ? ['It’s on.', `${dayText(view.chosen.at, zone)}, ${meetingSpan(view.chosen, zone)}`]
    : ['When can you make it?', `Answer by ${dayText(view.deadline, zone)}`];
  const image = new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', padding: '52px 66px 66px 52px', background: FIELD, fontFamily: 'Archivo', color: INK }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '44px 44px 44px 12px', border: `5px solid ${INK}`, background: PAPER, boxShadow: `14px 14px 0 ${SHADOW}` }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 54px' }}>
          <div style={{ display: 'flex', alignSelf: 'flex-start', padding: '7px 22px 9px', borderRadius: '22px 22px 22px 6px', background: INK, color: FIELD, fontSize: 30 }}>Loopd</div>
          <div style={{ display: 'block', lineClamp: 2, marginTop: 22, fontSize: long <= 18 ? 104 : long <= 34 ? 82 : 64, lineHeight: 1.04, letterSpacing: '-0.035em' }}>{title}</div>
          <div style={{ display: 'flex', marginTop: 18, fontSize: 32, color: MUTE }}>{asked}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '26px 54px 30px', background: view?.chosen ? ACTION : STUB, color: view?.chosen ? PAPER : INK, borderTop: `5px dashed ${INK}` }}>
          <div style={{ display: 'flex', flexShrink: 0, whiteSpace: 'nowrap', fontSize: 42, letterSpacing: '-0.03em' }}>{say}</div>
          <div style={{ display: 'flex', padding: '12px 28px 15px', borderRadius: 99, background: INK, color: FIELD, fontSize: 28, whiteSpace: 'nowrap' }}>{pill}</div>
        </div>
      </div>
    </div>, { ...size, fonts: [{ name: 'Archivo', data: await black, weight: 900, style: 'normal' }] });
  // A poll changes (its day to answer by, then its time), so a chat app's copy of the picture must not be kept for a year.
  image.headers.set('Cache-Control', 'public, max-age=300');
  return image;
}
