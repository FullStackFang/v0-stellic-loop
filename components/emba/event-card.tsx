import type { EventView } from '@/lib/emba/team-events';
import type { ReactNode } from 'react';
import type { Member } from '@/lib/emba/team-core';
import { setTeamInterest } from '@/app/groups/team-actions';
import { ActionForm } from './portal-forms';
import { CopyLink } from './copy-link';

export type EventWithWho = EventView & { people?: Member[]; morePeople?: number };
const nameOf = (person: Member) => person.isYou ? 'You' : person.name ?? person.handle ?? 'a teammate';

/** What a team member sees of one event: its facts, who is interested, one interest control, and a share link when the event has a date. */
export function EventCard({ event, scope, route, canPost, as: Tag = 'li', children }: { event: EventWithWho; scope: { orgId: string; loopId: string }; route: 'site' | 'share_link'; canPost: boolean; as?: 'li' | 'div'; children?: ReactNode }) {
  const people = event.people ?? [], idea = event.idea;
  // An idea or a plan counts who is in; a fixed event counts who is interested.
  const counted = idea ? 'in' : 'interested';
  const lacks = !idea || idea.state !== 'idea' ? null : idea.needs ? `Needs ${idea.needs} more of ${idea.needed}.`
    : !event.starts && !idea.day ? (idea.dayAsk?.open ? `Has its ${idea.needed}. Those who are in are choosing the day (ask #${idea.dayAsk.number}).` : `Has its ${idea.needed}. Waiting for a day from whoever proposed it.`)
    : !event.starts ? `Has its ${idea.needed}, on ${idea.day}. Waiting for a start time${event.place ? '' : ' and a place'}.` : event.place ? null : `Has its ${idea.needed}. Waiting for a place.`;
  const whatsapp = event.shareUrl ? `https://wa.me/?text=${encodeURIComponent(`${event.name}\n${event.shareUrl}`)}` : null;
  return <Tag className="lp-event"><span className="lp-topic">{event.starts ?? idea?.day ?? 'No date yet'}</span>
    <div className="lp-what"><p className="lp-stmt">{event.name}</p>
      <p className="lp-sub">{event.ends && <span>Until {event.ends}</span>}{event.place && <span>{event.place}</span>}</p>
      {event.note && <p>{event.note}</p>}
      {event.url && <p><a href={event.url} rel="noopener noreferrer nofollow" target="_blank">{event.url}</a></p>}
      {idea && <p className="lp-sub"><span className={`lp-chip${idea.state === 'planned' ? ' lp-chip-open' : ''}`}>{idea.state === 'planned' ? 'Plan' : 'Idea'}</span>{lacks && <span>{lacks}</span>}{idea.state === 'idea' && !event.starts && !idea.day && idea.offeredDays.length > 0 && <span>Days on offer: {idea.offeredDays.join(', ')}</span>}</p>}
      <p>{event.interested === 0 ? `No one has said they are ${counted} yet.` : `${event.interested} ${counted}${people.length ? `: ${people.map(nameOf).join(', ')}${event.morePeople ? ` and ${event.morePeople} more` : ''}` : ''}`}</p>
      {canPost
        ? <ActionForm action={setTeamInterest} label={idea ? (event.youAreInterested ? "I'm out" : "I'm in") : event.youAreInterested ? 'Take back my interest' : "I'm interested"}>
          <input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="event" value={event.slug} />
          <input type="hidden" name="interested" value={event.youAreInterested ? 'false' : 'true'} /><input type="hidden" name="route" value={route} />
        </ActionForm>
        : <p className="emba-meta">You follow this team and can read it. Only members can mark interest.</p>}
      {event.shareUrl && whatsapp && <div className="lp-acts"><a className="lp-btn" href={whatsapp} target="_blank" rel="noopener noreferrer">Send to WhatsApp</a><CopyLink url={event.shareUrl} /></div>}
      {children}
    </div>
  </Tag>;
}
