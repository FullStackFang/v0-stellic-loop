import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSignedInPrincipal } from '@/lib/emba/portal-session';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { listCampuses } from '@/lib/campus/listings';
import { schoolOf } from '@/lib/campus/schools';
import { DoorSignIn } from '@/components/campus/door-sign-in';
import { facesOf } from '@/lib/when/faces';
import { pollView, type Person, type PollView } from '@/lib/when/polls';
import { dayText, meetingSpan, shareMessage } from '@/lib/when/send';
import { lengthText, slotLabel, slotsOf, type Threshold } from '@/lib/when/slots';
import { saveAnswerAction } from '../actions';
import { Face, Panel, Seats, Ticket, Tile, type Shown } from '../parts';
import { Grid } from './grid';
import { Copy, Opened, Pick } from './pick';

type Props = { params: Promise<{ id: string }>; searchParams?: Promise<{ edit?: string; pick?: string; in?: string }> };
const REACHED: Record<Threshold, string> = { majority: 'majority reached', two_thirds: 'two thirds reached', everyone: 'everyone can' };
const zoneName = (zone: string) => new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortGeneric' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value ?? zone;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = await pollView(db(), null, (await params).id).catch(() => null);
  // The address is the key to the poll, so it is kept out of search.
  // What a chat app writes beside the poll's picture (opengraph-image.tsx) when the link is pasted.
  const title = view ? `${view.title} · Loopd` : 'Loopd', zone = view?.frame.timezone ?? 'UTC';
  const description = !view ? undefined : view.chosen ? `It is on: ${dayText(view.chosen.at, zone)}, ${meetingSpan(view.chosen, zone)}. Add it to your calendar.` : `${view.organizer.name} asks when you can make it. Add your times by ${dayText(view.deadline, zone)}.`;
  return { title, description, robots: { index: false }, openGraph: { title: view?.title ?? 'Loopd', description, siteName: 'Loopd', type: 'website' }, twitter: { card: 'summary_large_image', title: view?.title ?? 'Loopd', description } };
}

/** The words to pass on by hand, with a way to send them and a way to copy them. */
function PassOn({ tab, view }: { tab: string; view: PollView }) {
  const message = shareMessage(view);
  return <Panel tab={tab}><p className="wn-msg">{message}</p><div className="wn-acts">
    <Copy text={message} /><a className="cs-btn" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
  </div></Panel>;
}

// Loopd When, one poll: to answer while it is open, for its organizer to pick the time, and the result once it is sent.
export default async function WhenPage({ params, searchParams }: Props) {
  const { id } = await params, query = await searchParams ?? {}, who = await getSignedInPrincipal();
  const view = await pollView(db(), who, id);
  if (!view) notFound();
  const zone = view.frame.timezone, here = `/when/${view.id}`, faces = await facesOf(db(), [...view.answered.map(each => each.personId), view.organizer.personId, ...(who ? [who.personId] : [])]);
  const shown = (each: Person): Shown => ({ ...each, face: faces.get(each.personId) ?? '/animals/01.webp' }), answered = view.answered.map(shown);
  const count = <span><b>{view.answered.length} of {view.size}</b> have answered</span>;
  const top = view.best[0]?.people.length ?? 0, met = top >= view.needed;

  // The result: the time is set.
  if (view.chosen && !query.edit) {
    const label = slotLabel(view.chosen.at, zone), isIn = view.chosen.in.map(shown), out = view.chosen.out.map(shown), me = who?.personId ?? null;
    const size = Math.max(view.size, isIn.length + out.length), mine = [...isIn, ...out].find(each => each.personId === me);
    const row = (each: Shown, inIt: boolean) => each.personId === me
      ? <li key={each.personId} className="now"><Face of={each} /><b>You</b><span className={`cs-pill${inIt ? ' hot' : ''}`}>{inIt ? 'You\'re in' : 'Can\'t make it'}</span></li>
      : <li key={each.personId} className={inIt ? '' : 'out'}><Face of={each} /><b>{each.name}</b><span className={`cs-pill${inIt ? ' yes' : ''}`}>{inIt ? each.personId === view.organizer.personId ? 'In · asked' : 'In' : 'Can\'t make it'}</span></li>;
    return <main className="wn">
      <Opened pollId={view.id} />
      <Ticket met={isIn.length >= view.needed} tile={<Tile met top={label.dow} big={`${label.date} ${label.month}`} />}
        stub={<><Seats people={isIn} size={size} me={me} /><span><b>{isIn.length} of {size}</b> can make it{isIn.length >= view.needed ? ` · ${REACHED[view.threshold]}` : ''}</span></>}>
        <h1 className="xl">{label.dowLong}, {meetingSpan(view.chosen, zone)}. <em>It&apos;s on.</em></h1>
      </Ticket>
      {view.chosen.note && <Panel tab={`${view.organizer.name} says`}><p className="wn-msg">{view.chosen.note}</p></Panel>}
      <Panel tab={view.title}><ul className="wn-rows">
        {mine && row(mine, isIn.includes(mine))}{isIn.filter(each => each !== mine).map(each => row(each, true))}{out.filter(each => each !== mine).map(each => row(each, false))}
      </ul></Panel>
      <a className="cs-btn go wn-big" href={`${here}/calendar.ics`}>Add to my calendar</a>
      {(mine || view.isOrganizer) && <p className="wn-note">Also in your email, with the invite attached.</p>}
      <div className="wn-acts wn-mid">
        {who ? <a className="cs-btn sm" href={`${here}?edit=1`}>Update your answer</a> : <a className="cs-btn sm" href={`${here}?in=1`}>Sign in to add your times</a>}
        {(mine || view.isOrganizer) && <a className="cs-btn sm" href={`${here}/again`}>Ask the group again</a>}
        {who && <Link className="cs-btn sm" href="/when">Your polls</Link>}
      </div>
      {view.isOrganizer && <PassOn tab="Tell the rest" view={view} />}
    </main>;
  }

  // The organizer picks: once the poll is ready for them, or sooner if they ask to.
  if (view.status === 'open' && view.isOrganizer && view.best.length > 0 && (view.ready || query.pick) && !query.edit) {
    return <main className="wn">
      <Ticket tile={<Tile met={met} top={view.ready ? 'Ready' : 'So far'} big={`${top} of ${view.size}`} />} stub={<><Seats people={answered} size={view.size} />{count}</>}>
        <h1 className="xl">{met ? 'Enough can make it.' : view.ready ? 'Answers are in.' : 'Not everyone has answered.'} <em>Pick the time.</em></h1>
      </Ticket>
      <Pick pollId={view.id} minutes={view.minutes} goesTo={new Set([view.organizer.personId, ...view.answered.map(each => each.personId)]).size} as={view.organizer.name}
        choices={view.best.map(slot => { const label = slotLabel(slot.at, zone), n = slot.people.length; return { at: slot.at, dow: label.dow, date: `${label.date} ${label.month}`, time: label.time, hour: label.hour, line: `${n} of ${view.size}${n >= view.needed ? ` · ${REACHED[view.threshold]}` : ''}`, people: slot.people.map(shown) }; })} />
      <div className="wn-acts wn-mid"><a className="cs-btn sm" href={`${here}?edit=1`}>Change my times</a><a className="cs-btn sm" href={`${here}/change`}>Edit the poll</a><Link className="cs-btn sm" href="/when">Your polls</Link></div>
    </main>;
  }

  // Answering, or looking before signing in. The ticket says who asked; its stub, drawn by the grid, says who can make a time.
  const slots = slotsOf(view.frame), by = slotLabel(view.deadline, zone), set = view.chosen && slotLabel(view.chosen.at, zone);
  const free = Object.fromEntries(Object.entries(view.free).map(([at, people]) => [at, people.filter(each => each.personId !== who?.personId).map(shown)]));
  const tile = <Face of={shown(view.organizer)} />;
  const title = <><h1>{view.title}</h1>
    <p>{view.organizer.name} asked for {lengthText(view.minutes)} · {view.answered.length} of {view.size} answered · {set ? `set for ${set.dow} ${set.time}` : `by ${by.dow} ${by.date} ${by.month}`}</p></>;
  const best = view.best.map(slot => { const label = slotLabel(slot.at, zone); return { at: slot.at, dow: label.dow, date: `${label.date} ${label.month}`, time: label.time, line: `${slot.people.length} of ${view.size} can make it`, people: slot.people.map(shown) }; });
  const mine = view.isOrganizer && !view.chosen;
  const tail = <>
    {mine && <PassOn tab="Pass it on" view={view} />}
    {(who || view.chosen) && <div className="wn-acts wn-mid">
      {view.chosen && <a className="cs-btn sm" href={here}>Back to the result</a>}
      {mine && view.best.length > 0 && <a className="cs-btn sm" href={`${here}?pick=1`}>Pick the time now</a>}
      {mine && <a className="cs-btn sm" href={`${here}/change`}>Edit the poll</a>}
      {who && <Link className="cs-btn sm" href="/when">Your polls</Link>}
    </div>}
  </>;
  // Signing in, without leaving the poll: its ticket, the sign-in card, and straight back here afterwards.
  if (!who && query.in) {
    const schools = (await listCampuses(db())).filter(campus => schoolOf(campus.slug) === campus.slug).map(({ slug, name, domains }) => ({ slug, name, domains }));
    return <main className="wn wn-in">
      <div className="wn-col"><Ticket tile={tile} stub="Sign in and you are back on this poll, ready to add your times.">{title}</Ticket>
        <div className="wn-acts wn-mid"><a className="cs-btn sm" href={here}>Back to the poll</a></div></div>
      <DoorSignIn schools={schools} routing="hash" configured={clerkPortalConfigured()} back={here} />
    </main>;
  }
  const zonePill = <span className="cs-pill">Times are in {zoneName(zone)}</span>;
  return <main className="wn wn-two wn-fit">
    <Opened pollId={view.id} />
    {who
      ? <Grid slots={slots} free={free} me={shown({ personId: who.personId, name: 'You' })} mine={view.mine?.slots ?? []} draft={view.mine?.draft ?? false} onSave={saveAnswerAction.bind(null, view.id)} tile={tile} title={title} best={best} tail={tail} size={view.size}
          tab={view.mine?.draft ? 'Your times from last time. Change them, then save' : undefined}
          after={view.chosen ? 'Saved. The time stays as it is.' : who.verifiedEmail ? `The result comes to ${who.verifiedEmail}` : 'Saved. You get an email when the time is set.'}>{zonePill}</Grid>
      : <Grid slots={slots} free={free} won={view.chosen?.at} tile={tile} title={title} best={best} tail={tail} size={view.size}
          action={<><a className="cs-btn go wn-big" href={`${here}?in=1`}>Sign in to add your times</a><p className="wn-note">An email and a code. No password.</p></>}>{zonePill}</Grid>}
  </main>;
}
