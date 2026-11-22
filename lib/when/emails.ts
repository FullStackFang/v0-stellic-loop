import type { MessageKind } from './notify';
import type { Person, PollView } from './polls';
import { dayText, meetingSpan, pollUrl, whenText } from './send';
import { slotLabel } from './slots';

// The words of every email Loopd When sends (public/demo/mockups-when.html, screens 4 and 6). Plain text and HTML say the same.

export type WhenEmail = { subject: string; text: string; html: string; fromName: string };
type Parts = { subject: string; fromName: string; tile: [string, string]; headline: string; lines: string[]; button: [string, string]; foot: string };

const esc = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const INK = '#2b1a17', ACTION = '#b31b1b', FIELD = '#ffb199', PAPER = '#fdfdf8', PAGE = '#f1f3f5', MUTE = '#5c5f66';
const FONT = `Archivo,system-ui,-apple-system,'Segoe UI',sans-serif`;

function html(p: Parts, stopUrl: string): string {
  return `<div style="margin:0;padding:24px 12px;background:${PAGE};font-family:${FONT};color:${INK};font-size:15px;line-height:1.45">
<div style="max-width:440px;margin:0 auto">
<div style="background:${PAPER};border:1.5px solid ${INK};border-radius:22px 22px 22px 6px;padding:18px">
<div style="display:inline-block;background:${FIELD};border-radius:12px 12px 12px 3px;padding:7px 12px;text-align:center;line-height:1.1"><span style="font-size:11px;font-weight:600">${esc(p.tile[0])}</span><br><b style="font-size:18px">${esc(p.tile[1])}</b></div>
<h1 style="margin:12px 0 6px;font-size:24px;line-height:1.1;letter-spacing:-0.03em">${esc(p.headline)}</h1>
${p.lines.map(line => `<p style="margin:6px 0 0">${esc(line)}</p>`).join('\n')}
</div>
<p style="margin:18px 0"><a href="${esc(p.button[1])}" style="display:block;background:${ACTION};color:${PAPER};text-decoration:none;text-align:center;font-weight:700;font-size:17px;padding:15px 18px;border-radius:99px;border:1.5px solid ${INK}">${esc(p.button[0])}</a></p>
<p style="margin:0;font-size:13px;color:${MUTE};text-align:center">${esc(p.foot)} <a href="${esc(stopUrl)}" style="color:${MUTE}">Stop emails about this poll</a>.</p>
</div></div>`;
}
const text = (p: Parts, stopUrl: string) => [p.headline, '', ...p.lines, '', `${p.button[0]}: ${p.button[1]}`, '', `${p.foot} Stop emails about this poll: ${stopUrl}`].join('\n');

const names = (people: Person[]) => people.map(each => each.name).join(', ');
/** One email, for one person, about one poll. */
export function renderWhenEmail(kind: MessageKind, d: { view: PollView; to: Person; stopUrl: string }): WhenEmail {
  const { view } = d, zone = view.frame.timezone, url = pollUrl(view.id), by = dayText(view.deadline, zone), asked = view.organizer.name;
  const top = view.best[0], topLine = top ? `${whenText(top.at, zone)} works for ${top.people.length} of ${view.size}.` : 'Nobody has picked a time yet.';
  const parts = ((): Parts => {
    if (kind === 'invite' && view.chosen) {
      const label = slotLabel(view.chosen.at, zone), span = meetingSpan(view.chosen, zone), isIn = view.chosen.in.some(each => each.personId === d.to.personId), answered = view.chosen.in.length + view.chosen.out.length;
      return { subject: `${view.title} is on: ${label.dow} ${label.date} ${label.month}, ${span}`, fromName: `${asked} via Loopd`, tile: [label.dow, `${label.date} ${label.month}`],
        headline: `${label.dowLong}, ${span}. It's on.`,
        lines: [view.title, ...(view.chosen.note ? [`${asked}: ${view.chosen.note}`] : []), `${view.chosen.in.length} of ${Math.max(view.size, answered)} can make it${view.chosen.in.length ? `: ${names(view.chosen.in)}` : ''}.`,
          ...(isIn || d.to.personId === view.organizer.personId ? [] : ['You said you can\'t make this one. If that changes, update your answer on the page.'])],
        button: ['Add to my calendar', `${url}/calendar.ics`], foot: `You get this because you answered ${asked}'s poll.` };
    }
    if (kind === 'ready' || kind === 'deadline') {
      const late = kind === 'deadline';
      return { subject: late ? `${view.title}: the deadline has passed` : `${view.title} is ready to set`, fromName: 'Loopd', tile: ['Ready', top ? `${top.people.length} of ${view.size}` : `0 of ${view.size}`],
        headline: late ? 'The deadline has passed. Pick the time.' : topLine,
        lines: [...(late ? [topLine] : []), `${view.answered.length} of ${view.size} have answered.`, 'Nothing has been sent. You pick the time.'],
        button: ['Pick the time and send', url], foot: 'You get this because you made this poll.' };
    }
    return { subject: `${asked} is waiting on your times for ${view.title}`, fromName: 'Loopd', tile: ['Answer by', by.replace(/^\S+ /, '').replace(/ at .*/, '')],
      headline: `Can you make ${view.title}?`,
      lines: [`${asked} asks. ${view.answered.length} of ${view.size} have answered.`, `Answers close ${by}.`, ...(kind === 'reminder_24' ? ['This is the last reminder.'] : [])],
      button: ['Add my times', url], foot: `You get this because you answered ${asked}'s last poll.` };
  })();
  return { subject: parts.subject, fromName: parts.fromName, text: text(parts, d.stopUrl), html: html(parts, d.stopUrl) };
}
