import type { EventView } from '@/lib/emba/team-events';
import type { Member } from '@/lib/emba/team-core';
import { setTeamInterest } from '@/app/groups/team-actions';
import { ActionForm } from './portal-forms';
import { CopyLink } from './copy-link';

export type EventWithWho = EventView & { people?: Member[]; morePeople?: number };
const nameOf = (person: Member) => person.isYou ? 'You' : person.name ?? person.handle ?? 'a teammate';

/** What a team member sees of one event: its facts, who is interested, one interest control, and a share link when the event has a date. */
export function EventCard({ event, scope, route, canPost, as: Tag = 'li' }: { event: EventWithWho; scope: { orgId: string; loopId: string }; route: 'site' | 'share_link'; canPost: boolean; as?: 'li' | 'div' }) {
  const people = event.people ?? [];
  const whatsapp = event.shareUrl ? `https://wa.me/?text=${encodeURIComponent(`${event.name}\n${event.shareUrl}`)}` : null;
  return <Tag className="lp-event"><span className="lp-topic">{event.starts ?? 'No date yet'}</span>
    <div className="lp-what"><p className="lp-stmt">{event.name}</p>
      <p className="lp-sub">{event.ends && <span>Until {event.ends}</span>}{event.place && <span>{event.place}</span>}</p>
      {event.note && <p>{event.note}</p>}
      {event.url && <p><a href={event.url} rel="noopener noreferrer nofollow" target="_blank">{event.url}</a></p>}
      <p>{event.interested === 0 ? 'No one has said they are interested yet.' : `${event.interested} interested${people.length ? `: ${people.map(nameOf).join(', ')}${event.morePeople ? ` and ${event.morePeople} more` : ''}` : ''}`}</p>
      {canPost
        ? <ActionForm action={setTeamInterest} label={event.youAreInterested ? 'Take back my interest' : "I'm interested"}>
          <input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="event" value={event.slug} />
          <input type="hidden" name="interested" value={event.youAreInterested ? 'false' : 'true'} /><input type="hidden" name="route" value={route} />
        </ActionForm>
        : <p className="emba-meta">You follow this team and can read it. Only members can mark interest.</p>}
      {event.shareUrl && whatsapp && <div className="lp-acts"><a className="lp-btn" href={whatsapp} target="_blank" rel="noopener noreferrer">Send to WhatsApp</a><CopyLink url={event.shareUrl} /></div>}
    </div>
  </Tag>;
}
