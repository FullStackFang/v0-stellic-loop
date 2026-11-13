import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { EmbaError } from '@/lib/emba/errors';
import { groupPath } from '@/lib/emba/group-path';
import { canAccessLoop } from '@/lib/emba/access';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { askReminder, askShare, askShareMessage, type AskOutside, type AskResult } from '@/lib/emba/team-asks';
import { ActionForm } from '@/components/emba/portal-forms';
import { CopyLink, CopyText } from '@/components/emba/copy-link';
import { nameOf, yourAnswerText } from '@/components/emba/ask-parts';
import { joinFromShareLink } from '@/app/groups/request-actions';
import { answerTeamAsk, closeTeamAsk } from '../actions';

export const dynamic = 'force-dynamic';
const robots = { index: false, follow: false };
const closing = (outside: AskOutside) => `Closes ${outside.closes} (${outside.timezone})`;
const load = (principal: Awaited<ReturnType<typeof getPortalPrincipal>>, token: string) => askShare(db(), principal, token).catch(error => { if (error instanceof ZodError || (error instanceof EmbaError && error.code === 'not_found')) return null; throw error; });
const whatsapp = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// The preview is built from the outside view alone: a null principal can never be shown the member view.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const share = await load(null, (await params).token);
  if (!share) return { robots };
  const { outside } = share, title = `${outside.question} · ${outside.group}`, description = closing(outside);
  return { title, description, robots, openGraph: { title, description }, twitter: { card: 'summary', title, description } };
}

/** The answer form for the ask's kind, filled with what the caller answered. */
function AnswerForm({ ask, scope }: { ask: AskResult; scope: { orgId: string; loopId: string } }) {
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
  const principal = await getPortalPrincipal();
  const share = await load(principal, token);
  if (!share) notFound();
  const { outside } = share;
  if (share.view === 'member') {
    const { scope, detail, namespace, groupSlug } = share, ask = detail.ask;
    const canPost = await db().tx(q => canAccessLoop(q, principal, scope.orgId, scope.loopId, 'post'));
    const left = ask.expected - ask.answered, reminder = askReminder(ask), message = askShareMessage(ask);
    return <div className="lp"><main className="lp-main lt-share"><div className="lp-wrap">
      <section className="lt-editor"><p className="lp-handle">{outside.group}</p><h1>{ask.question}</h1>
        <p>{ask.open ? 'Closes' : 'Closed'} {ask.closes} ({ask.timezone}). Asked by {nameOf(ask.by)}.</p>
        <p className="emba-meta">{ask.reveal === 'named' ? 'Members see who answered what.' : 'Totals only: nobody sees who chose what.'}</p>
        <p>{ask.answered} of {ask.expected} answered.</p>
        {ask.yourAnswer && <p role="status">Your answer: {yourAnswerText(ask.yourAnswer)}</p>}
        {ask.open && (canPost
          ? <>
            <AnswerForm ask={ask} scope={scope} />
            {ask.yourAnswer && <ActionForm action={answerTeamAsk} label="Take back my answer"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="number" value={ask.number} /><input type="hidden" name="route" value="share_link" /><input type="hidden" name="remove" value="true" /></ActionForm>}
          </>
          : <p className="emba-meta">You follow this group and can read it. Only members can answer.</p>)}
        {!ask.open && <p className="emba-meta">This ask is closed and takes no more answers.</p>}
      </section>
      <section className="lt-editor"><h2>Results</h2>
        {ask.results.length > 0 && <ul className="lp-plain">{ask.results.map(option => <li key={option.number}>{option.label}: {option.count}{option.people && option.people.length > 0 && ` (${option.people.map(nameOf).join(', ')})`}</li>)}</ul>}
        {ask.written.length > 0 && <ul className="lp-plain">{ask.written.map((answer, index) => <li key={index}>{answer.by && <strong>{nameOf(answer.by)}: </strong>}{answer.text}</li>)}</ul>}
        {ask.results.length === 0 && ask.written.length === 0 && <p className="emba-meta">No answers yet.</p>}
      </section>
      {ask.missing && <section className="lt-editor"><h2>Who has not answered</h2><p>{ask.answered} of {ask.expected} answered.</p>
        {ask.missing.length ? <ul className="lp-plain">{ask.missing.map((person, index) => <li key={index}>{nameOf(person)}</li>)}</ul> : <p className="emba-meta">Everyone who can answer has answered.</p>}
        {ask.open && left > 0 && <><h3>Reminder</h3><p style={{ whiteSpace: 'pre-line' }}>{reminder}</p><div className="lp-acts"><a className="lp-btn" href={whatsapp(reminder)} target="_blank" rel="noopener noreferrer">Send to WhatsApp</a><CopyText text={reminder} /></div></>}
      </section>}
      <section className="lt-editor"><h2>Share this ask</h2><p style={{ whiteSpace: 'pre-line' }}>{message}</p><div className="lp-acts"><a className="lp-btn" href={whatsapp(message)} target="_blank" rel="noopener noreferrer">Send to WhatsApp</a><CopyLink url={ask.shareUrl} /></div></section>
      {ask.canClose && <section className="lt-editor"><ActionForm action={closeTeamAsk} label="Close this ask now"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="number" value={ask.number} /><p>No more answers will be taken. It cannot be reopened.</p></ActionForm></section>}
      <p><Link href={`${groupPath(namespace, groupSlug)}/team?tab=asks`}>Open the team page</Link></p>
    </div></main></div>;
  }
  const { join, signedIn } = share;
  return <div className="lp"><main className="lp-main lt-share"><div className="lp-wrap">
    <section className="lt-editor"><p className="lp-handle">{outside.group}</p><h1>{outside.question}</h1><p>{closing(outside)}</p></section>
    <section className="lt-editor">{!signedIn
      ? <>{clerkPortalConfigured() ? <p>Sign in to join this group. <Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`/a/${token}`)}`}>Sign in</Link></p> : <p role="status">Sign-in is not configured for this deployment.</p>}</>
      : join === null ? <p>This group is not taking join requests from this link. Ask an organizer to add you.</p>
        : join.requested ? <p role="status">Request sent</p>
          : <ActionForm action={joinFromShareLink} label={join.mode === 'admit' ? 'Join group' : 'Request to join'}><input type="hidden" name="kind" value="ask" /><input type="hidden" name="token" value={token} /></ActionForm>}
    </section>
  </div></main></div>;
}
