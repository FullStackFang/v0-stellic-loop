import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { EmbaError } from '@/lib/emba/errors';
import { groupPath } from '@/lib/emba/group-path';
import { canAccessLoop } from '@/lib/emba/access';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { closedToCaller, getPortalPrincipal, getSignedInPrincipal } from '@/lib/emba/portal-session';
import { frontIsCampus } from '@/lib/campus/schools';
import { signInHref } from '@/lib/campus/session';
import { askReminder, askShare, askShareMessage, type AskOutside, type AskResult } from '@/lib/emba/team-asks';
import { ActionForm } from '@/components/emba/portal-forms';
import { ReachAtJoin } from '@/components/emba/reach-control';
import { CopyLink, CopyText } from '@/components/emba/copy-link';
import { isTodo, nameOf, tallyText, yoursLine } from '@/components/emba/ask-parts';
import { joinFromShareLink } from '@/app/groups/request-actions';
import { answerTeamAsk, closeTeamAsk, extendTeamAsk } from '../actions';

export const dynamic = 'force-dynamic';
const robots = { index: false, follow: false };
const closing = (outside: AskOutside) => `Closes ${outside.closes} (${outside.timezone})`;
const load = (principal: Awaited<ReturnType<typeof getSignedInPrincipal>>, token: string) => askShare(db(), principal, token).catch(error => { if (error instanceof ZodError || (error instanceof EmbaError && error.code === 'not_found')) return null; throw error; });
const whatsapp = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// The preview is built from the outside view alone: a null principal can never be shown the member view.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const share = await closedToCaller() ? null : await load(null, (await params).token);
  if (!share) return { robots };
  const { outside } = share, title = `${outside.question} · ${outside.group}`, description = closing(outside);
  return { title, description, robots, openGraph: { title, description }, twitter: { card: 'summary', title, description } };
}

/** The answer form for the ask's kind, filled with what the caller answered. */
function AnswerForm({ ask, scope }: { ask: AskResult; scope: { orgId: string; loopId: string } }) {
  if (isTodo(ask)) return ask.yourAnswer ? null : <ActionForm action={answerTeamAsk} label="Done"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="number" value={ask.number} /><input type="hidden" name="route" value="share_link" /><input type="hidden" name="done" value="true" /></ActionForm>;
  const mine = ask.yourAnswer, chosen = (number: number) => Boolean(mine?.choices.some(choice => choice.number === number));
  return <ActionForm action={answerTeamAsk} label={mine ? 'Change my answer' : 'Send my answer'}>
    <input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="number" value={ask.number} /><input type="hidden" name="route" value="share_link" />
    {ask.kind === 'text' ? <label>Your answer<input name="text" required maxLength={400} defaultValue={mine?.text ?? ''} /></label>
      : <fieldset><legend>{ask.kind === 'one' ? 'Pick one' : ask.kind === 'many' ? 'Pick any number' : 'Pick every date that works'}</legend>
        {ask.options.map(option => <label key={option.number} className="lt-check"><input type={ask.kind === 'one' ? 'radio' : 'checkbox'} name="choice" value={option.number} defaultChecked={chosen(option.number)} required={ask.kind === 'one'} />{option.label}</label>)}</fieldset>}
  </ActionForm>;
}

export default async function SharedAskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // With the campus in front, an ask opens for the members and followers of its group and for nobody else (loop-on-you, design D12):
  // a signed-out visitor signs in and comes back, and a person outside the group is sent to the front door, as before.
  const principal = await getSignedInPrincipal(), portal = await getPortalPrincipal();
  if (frontIsCampus() && !principal) redirect(signInHref(`/a/${token}`));
  const share = await load(principal, token);
  if (frontIsCampus() && !portal && share?.view !== 'member') redirect('/');
  if (!share) notFound();
  const { outside } = share;
  if (share.view === 'member') {
    const { scope, detail, namespace, groupSlug } = share, ask = detail.ask;
    const canPost = await db().tx(q => canAccessLoop(q, principal, scope.orgId, scope.loopId, 'post'));
    const left = ask.expected - ask.answered, reminder = askReminder(ask), message = askShareMessage(ask), todo = isTodo(ask);
    const ids = <><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="number" value={ask.number} /></>;
    return <div className="lp"><main className="lp-main lt-share"><div className="lp-wrap">
      <section className="lt-editor"><p className="lp-handle">{outside.group}</p><h1>{ask.question}</h1>
        <p>{todo ? (ask.open ? 'Due' : 'Was due') : ask.open ? 'Closes' : 'Closed'} {ask.closes} ({ask.timezone}). {todo ? 'Posted' : 'Asked'} by {nameOf(ask.by)}.</p>
        <p className="emba-meta">{todo ? 'Members see who has done it.' : ask.reveal === 'named' ? 'Members see who answered what.' : 'Totals only: nobody sees who chose what.'}</p>
        <p>{tallyText(ask)}.</p>
        {(ask.yourAnswer || todo) && <p role="status">{yoursLine(ask)}</p>}
        {ask.open && (canPost
          ? <>
            <AnswerForm ask={ask} scope={scope} />
            {ask.yourAnswer && <ActionForm action={answerTeamAsk} label={todo ? 'Not done after all' : 'Take back my answer'}><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="number" value={ask.number} /><input type="hidden" name="route" value="share_link" /><input type="hidden" name="remove" value="true" /></ActionForm>}
          </>
          : <p className="emba-meta">You follow this group and can read it. Only members can answer.</p>)}
        {!ask.open && <p className="emba-meta">{todo ? 'This has passed its time and can no longer be marked done.' : 'This ask is closed and takes no more answers.'}</p>}
      </section>
      <section className="lt-editor"><h2>{todo ? 'Done' : 'Results'}</h2>
        {todo && (ask.done?.length ? <ul className="lp-plain lp-names" tabIndex={0} aria-label="People who have done it">{ask.done.map((person, index) => <li key={index}>{nameOf(person)}</li>)}</ul> : <p className="emba-meta">Nobody yet.</p>)}
        {ask.results.length > 0 && <ul className="lp-plain">{ask.results.map(option => <li key={option.number}>{option.label}: {option.count}{option.people && option.people.length > 0 && ` (${option.people.map(nameOf).join(', ')})`}</li>)}</ul>}
        {ask.written.length > 0 && <ul className="lp-plain">{ask.written.map((answer, index) => <li key={index}>{answer.by && <strong>{nameOf(answer.by)}: </strong>}{answer.text}</li>)}</ul>}
        {!todo && ask.results.length === 0 && ask.written.length === 0 && <p className="emba-meta">No answers yet.</p>}
      </section>
      {ask.missing && <section className="lt-editor"><h2>{todo ? 'Who has not done it' : 'Who has not answered'}</h2><p>{tallyText(ask)}.</p>
        {ask.missing.length ? <ul className="lp-plain lp-names" tabIndex={0} aria-label={todo ? 'People who have not done it' : 'People who have not answered'}>{ask.missing.map((person, index) => <li key={index}>{nameOf(person)}</li>)}</ul> : <p className="emba-meta">{todo ? 'Everyone has done it.' : 'Everyone who can answer has answered.'}</p>}
        {ask.open && left > 0 && <><h3>Reminder</h3><p style={{ whiteSpace: 'pre-line' }}>{reminder}</p><div className="lp-acts"><a className="lp-btn" href={whatsapp(reminder)} target="_blank" rel="noopener noreferrer">Send to WhatsApp</a><CopyText text={reminder} /></div></>}
      </section>}
      <section className="lt-editor"><h2>Share this ask</h2><p style={{ whiteSpace: 'pre-line' }}>{message}</p><div className="lp-acts"><a className="lp-btn" href={whatsapp(message)} target="_blank" rel="noopener noreferrer">Send to WhatsApp</a><CopyLink url={ask.shareUrl} /></div></section>
      {ask.canExtend && <section className="lt-editor"><h2>{ask.open ? 'Move the date' : 'Open it again'}</h2><ActionForm action={extendTeamAsk} label={ask.open ? 'Move the date' : 'Open it again'}>{ids}
        <label>{todo ? 'New due time' : 'New closing time'} ({ask.timezone})<input name="closesAt" type="datetime-local" required /></label>
        <p>{ask.open ? 'Everything already recorded stays.' : `It takes ${todo ? 'being marked done' : 'answers'} again until the new time. Everything already recorded stays.`}</p></ActionForm></section>}
      {ask.canClose && <section className="lt-editor"><ActionForm action={closeTeamAsk} label="Close this ask now">{ids}<p>No more answers will be taken. It can be opened again with a new date.</p></ActionForm></section>}
      {portal ? <p><Link href={`${groupPath(namespace, groupSlug)}/team?tab=asks`}>Open the team page</Link></p> : <p><Link href="/">Back to Loopd</Link></p>}
    </div></main></div>;
  }
  const { join, signedIn } = share;
  return <div className="lp"><main className="lp-main lt-share"><div className="lp-wrap">
    <section className="lt-editor"><p className="lp-handle">{outside.group}</p><h1>{outside.question}</h1><p>{closing(outside)}</p></section>
    <section className="lt-editor">{!signedIn
      ? <>{clerkPortalConfigured() ? <p>Sign in to join this group. <Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`/a/${token}`)}`}>Sign in</Link></p> : <p role="status">Sign-in is not configured for this deployment.</p>}</>
      : join === null ? <p>This group is not taking join requests from this link. Ask an organizer to add you.</p>
        : join.requested ? <p role="status">Request sent</p>
          : <ActionForm action={joinFromShareLink} label={join.mode === 'admit' ? 'Join group' : 'Request to join'}><input type="hidden" name="kind" value="ask" /><input type="hidden" name="token" value={token} /><ReachAtJoin email={principal?.verifiedEmail ?? null} /></ActionForm>}
    </section>
  </div></main></div>;
}
