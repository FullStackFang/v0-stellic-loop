import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { personalAsk } from '@/lib/emba/reach-link';
import { ActionForm } from '@/components/emba/portal-forms';
import { answerFromPersonalLink } from '../../../reach-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Answer · Loopd', robots: { index: false, follow: false }, referrer: 'no-referrer' };

// A member's own link to one ask, from a message Loopd sent them. Opening it
// changes nothing; the answer is saved only when the form is sent. The link
// signs nobody in: it shows this one ask and takes this one answer. It works whichever site is in front (loop-on-you,
// design D12): the link is the member's own, and it reaches nothing but this ask.
export default async function PersonalAnswerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ask = await personalAsk(db(), token);
  if (!ask) return <section className="lt-editor"><h1>This link no longer works</h1><p>Sign in to see what your groups are asking.</p></section>;
  const chosen = (number: number) => ask.chosen.includes(number), todo = ask.kind === 'done';
  return <section className="lt-editor"><p className="lp-handle">{ask.group}</p><h1>{ask.question}</h1>
    <p className="emba-meta">{ask.asker && <>Asked by {ask.asker}. </>}{todo ? (ask.open ? 'Due' : 'Was due') : ask.open ? 'Closes' : 'Closed'} {ask.closes} ({ask.timezone}).</p>
    {ask.yourAnswer && <p role="status">{todo ? 'You have done this.' : `Your answer: ${ask.yourAnswer}`}</p>}
    {!ask.open ? <p>{todo ? 'This has passed its time and can no longer be marked done.' : 'This ask has closed and takes no more answers.'}</p> : todo ? (!ask.yourAnswer && <ActionForm action={answerFromPersonalLink} label="Done"><input type="hidden" name="token" value={token} /></ActionForm>) : <ActionForm action={answerFromPersonalLink} label={ask.yourAnswer ? 'Change my answer' : 'Send my answer'}>
      <input type="hidden" name="token" value={token} />
      {ask.kind === 'text' ? <label>Your answer<input name="text" required maxLength={400} defaultValue={ask.written ?? ''} /></label>
        : <fieldset><legend>{ask.kind === 'one' ? 'Pick one' : ask.kind === 'many' ? 'Pick any number' : 'Pick every date that works'}</legend>
          {ask.options.map(option => <label key={option.number} className="lt-check"><input type={ask.kind === 'one' ? 'radio' : 'checkbox'} name="choice" value={option.number} defaultChecked={chosen(option.number)} required={ask.kind === 'one'} />{option.label}</label>)}</fieldset>}
    </ActionForm>}
  </section>;
}
