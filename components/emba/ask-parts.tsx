import Link from 'next/link';
import type { Member } from '@/lib/emba/team-core';
import type { Answer, AskView } from '@/lib/emba/team-asks';
import { ActionForm } from './portal-forms';
import { addTeamAsk } from '@/app/a/actions';

export const nameOf = (person: Member) => person.isYou ? 'You' : person.former ? 'a former teammate' : person.name ?? person.handle ?? 'a teammate';
export const yourAnswerText = (answer: Answer) => answer.text ?? answer.choices.map(choice => choice.label).join(', ');
/** Something to do (loop-on-you) is done, not answered. */
export const isTodo = (ask: AskView) => ask.kind === 'done';
/** "14 of 20 done", or "9 of 14 answered". */
export const tallyText = (ask: AskView) => `${ask.answered} of ${ask.expected} ${isTodo(ask) ? 'done' : 'answered'}`;
/** What the caller did about an ask, in a line. */
export const yoursLine = (ask: AskView) => isTodo(ask) ? (ask.yourAnswer ? 'You have done this.' : ask.open ? 'You have not done this.' : 'You did not do this.')
  : ask.yourAnswer ? `Your answer: ${yourAnswerText(ask.yourAnswer)}` : ask.open ? 'You have not answered.' : 'You did not answer.';
/** The ask's own page, as a path on this site. */
export const askPath = (ask: AskView) => new URL(ask.shareUrl).pathname;

/** One ask in a list: the question, who asked, when it closes, how many have answered, and the caller's own answer. No results and nobody who has not answered. */
export function AskRow({ ask }: { ask: AskView }) {
  return <li className="lp-event"><span className="lp-topic">{isTodo(ask) ? (ask.open ? 'Due' : 'Was due') : ask.open ? 'Closes' : 'Closed'} {ask.closes}</span>
    <div className="lp-what"><p className="lp-stmt"><Link href={askPath(ask)}>{ask.question}</Link></p>
      <p className="lp-sub"><span>Asked by {nameOf(ask.by)}</span><span>{tallyText(ask)}</span></p>
      <p className="emba-meta">{yoursLine(ask)}</p>
    </div></li>;
}

/** The form for a new ask. Options one per line; for dates, one YYYY-MM-DD per line. */
export function AskForm({ scope, timezone }: { scope: { orgId: string; loopId: string }; timezone: string }) {
  return <ActionForm action={addTeamAsk} label="Ask the group">
    <input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} />
    <label>Question<input name="question" required maxLength={200} /></label>
    <label>Kind of answer<select name="kind" defaultValue="one"><option value="one">Pick one</option><option value="many">Pick several</option><option value="dates">Pick dates</option><option value="text">Short written answer</option><option value="done">Something to do</option></select></label>
    <label>Options, one per line (for dates, one YYYY-MM-DD per line; none for a written answer or something to do)<textarea name="options" rows={4} /></label>
    <label>Closes, or is due ({timezone})<input name="closesAt" type="datetime-local" required /></label>
    <label>Who sees answers (something to do always shows who has done it)<select name="reveal" defaultValue="named"><option value="named">Members see who answered what</option><option value="counts">Totals only</option></select></label>
  </ActionForm>;
}
