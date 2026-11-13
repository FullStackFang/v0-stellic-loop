import Link from 'next/link';
import type { Member } from '@/lib/emba/team-core';
import type { Answer, AskView } from '@/lib/emba/team-asks';
import { ActionForm } from './portal-forms';
import { addTeamAsk } from '@/app/a/actions';

export const nameOf = (person: Member) => person.isYou ? 'You' : person.former ? 'a former teammate' : person.name ?? person.handle ?? 'a teammate';
export const yourAnswerText = (answer: Answer) => answer.text ?? answer.choices.map(choice => choice.label).join(', ');
/** The ask's own page, as a path on this site. */
export const askPath = (ask: AskView) => new URL(ask.shareUrl).pathname;

/** One ask in a list: the question, who asked, when it closes, how many have answered, and the caller's own answer. No results and nobody who has not answered. */
export function AskRow({ ask }: { ask: AskView }) {
  return <li className="lp-event"><span className="lp-topic">{ask.open ? 'Closes' : 'Closed'} {ask.closes}</span>
    <div className="lp-what"><p className="lp-stmt"><Link href={askPath(ask)}>{ask.question}</Link></p>
      <p className="lp-sub"><span>Asked by {nameOf(ask.by)}</span><span>{ask.answered} of {ask.expected} answered</span></p>
      <p className="emba-meta">{ask.yourAnswer ? `Your answer: ${yourAnswerText(ask.yourAnswer)}` : ask.open ? 'You have not answered.' : 'You did not answer.'}</p>
    </div></li>;
}

/** The form for a new ask. Options one per line; for dates, one YYYY-MM-DD per line. */
export function AskForm({ scope, timezone }: { scope: { orgId: string; loopId: string }; timezone: string }) {
  return <ActionForm action={addTeamAsk} label="Ask the group">
    <input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} />
    <label>Question<input name="question" required maxLength={200} /></label>
    <label>Kind of answer<select name="kind" defaultValue="one"><option value="one">Pick one</option><option value="many">Pick several</option><option value="dates">Pick dates</option><option value="text">Short written answer</option></select></label>
    <label>Options, one per line (for dates, one YYYY-MM-DD per line; none for a written answer)<textarea name="options" rows={4} /></label>
    <label>Closes ({timezone})<input name="closesAt" type="datetime-local" required /></label>
    <label>Who sees answers<select name="reveal" defaultValue="named"><option value="named">Members see who answered what</option><option value="counts">Totals only</option></select></label>
  </ActionForm>;
}
