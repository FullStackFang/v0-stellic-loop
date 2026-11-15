import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { personalAsk } from '@/lib/emba/reach-link';
import { ActionForm } from '@/components/emba/portal-forms';
import { answerFromPersonalLink } from '../../../reach-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Answer · Loop', robots: { index: false, follow: false }, referrer: 'no-referrer' };

// A member's own link to one ask, from a message Loop sent them. Opening it
// changes nothing; the answer is saved only when the form is sent. The link
// signs nobody in: it shows this one ask and takes this one answer.
export default async function PersonalAnswerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ask = await personalAsk(db(), token);
  if (!ask) return <section className="lt-editor"><h1>This link no longer works</h1><p>Sign in to see what your groups are asking.</p></section>;
  const chosen = (number: number) => ask.chosen.includes(number);
  return <section className="lt-editor"><p className="lp-handle">{ask.group}</p><h1>{ask.question}</h1>
    <p className="emba-meta">{ask.asker && <>Asked by {ask.asker}. </>}{ask.open ? 'Closes' : 'Closed'} {ask.closes} ({ask.timezone}).</p>
    {ask.yourAnswer && <p role="status">Your answer: {ask.yourAnswer}</p>}
    {!ask.open ? <p>This ask has closed and takes no more answers.</p> : <ActionForm action={answerFromPersonalLink} label={ask.yourAnswer ? 'Change my answer' : 'Send my answer'}>
      <input type="hidden" name="token" value={token} />
      {ask.kind === 'text' ? <label>Your answer<input name="text" required maxLength={400} defaultValue={ask.written ?? ''} /></label>
        : <fieldset><legend>{ask.kind === 'one' ? 'Pick one' : ask.kind === 'many' ? 'Pick any number' : 'Pick every date that works'}</legend>
          {ask.options.map(option => <label key={option.number} className="lt-check"><input type={ask.kind === 'one' ? 'radio' : 'checkbox'} name="choice" value={option.number} defaultChecked={chosen(option.number)} required={ask.kind === 'one'} />{option.label}</label>)}</fieldset>}
    </ActionForm>}
  </section>;
}
