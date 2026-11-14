'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { CopyLink } from '@/components/emba/copy-link';
import type { PortalAction, PortalResult } from '@/components/emba/portal-types';

export type RoleName = 'owner' | 'organizer' | 'member' | 'follower';
export type RosterPerson = {
  personId: string; name: string; role: RoleName; handle: string | null; isYou: boolean;
  /** Whether the viewer may change this person's role here. */
  canSetRole: boolean;
  /** `group`: out of the whole top-level group. `role`: out of this group only. null: nothing the viewer may do. */
  remove: 'group' | 'role' | null;
};
export type Waiting = { key: string; kind: 'request'; personId: string; name: string; at: string } | { key: string; kind: 'invite'; id: string; email: string; role: string; until: string };
export type JoinMode = 'off' | 'ask_first' | 'admit';
type Scope = { orgId: string; loopId: string };
type Actions = { grant: PortalAction; revokeRole: PortalAction; removeFromGroup: PortalAction; saveTag: PortalAction; invite: PortalAction; cancelInvite: PortalAction; review: PortalAction; setLink: PortalAction; replaceLink: PortalAction };

const ROLES: RoleName[] = ['owner', 'organizer', 'member', 'follower'];
const NAME: Record<RoleName, string> = { owner: 'Owner', organizer: 'Organizer', member: 'Member', follower: 'Follower' };
const idle: PortalResult = { status: 'idle', message: '' };
const fields = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
const initials = (name: string) => name.split(/\s+/).map(word => word[0] ?? '').join('').slice(0, 2).toUpperCase();
/** A steady colour per person, from their id, so a face keeps its colour between visits. */
const hue = (id: string) => [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
// Dates are written in UTC so the server and the browser print the same text.
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Runs one server action at a time and keeps what it answered, for the one status line of a panel. */
function useRun() {
  const [result, setResult] = useState<PortalResult>(idle);
  const [pending, start] = useTransition();
  const run = (action: PortalAction, values: Record<string, string>, said?: string) => start(async () => {
    const answer = await action(idle, fields(values));
    setResult(answer.status === 'success' && said ? { ...answer, message: said } : answer);
  });
  return { result, pending, run };
}
const Said = ({ result }: { result: PortalResult }) => result.message ? <p className="lp-mb-note" role={result.status === 'error' ? 'alert' : 'status'} data-warn={result.status === 'error' || undefined}>{result.message}</p> : null;
const Face = ({ id, name }: { id: string; name: string }) => <span className="lp-mb-av" style={{ ['--h' as string]: hue(id) }} aria-hidden="true">{initials(name)}</span>;
const Mail = () => <span className="lp-mb-av lp-mb-mail" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12v8.5H2z" /><path d="M2 4.5l6 4.5 6-4.5" /></svg></span>;

/** A destructive button that asks once more in place before it acts. */
function Twice({ label, confirm, disabled, onGo }: { label: string; confirm: string; disabled: boolean; onGo: () => void }) {
  const [armed, setArmed] = useState(false);
  return <button type="button" className="lp-mb-quiet" data-armed={armed || undefined} disabled={disabled} onBlur={() => setArmed(false)} onClick={() => { if (armed) { setArmed(false); onGo(); } else setArmed(true); }}>{armed ? confirm : label}</button>;
}

/**
 * The people in a group. The list scrolls inside its own frame, and the line under it says which part is on screen.
 * Past a dozen people a find box and a filter by role appear.
 */
export function Roster({ scope, namespace, people, isOwner, canLeave, actions }: { scope: Scope; namespace: string; people: RosterPerson[]; isOwner: boolean; canLeave: boolean; actions: Pick<Actions, 'grant' | 'revokeRole' | 'removeFromGroup' | 'saveTag'> }) {
  const { result, pending, run } = useRun();
  const [find, setFind] = useState(''), [show, setShow] = useState<RoleName | 'all'>('all');
  const [span, setSpan] = useState<[number, number] | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const seen = people.filter(person => (show === 'all' || person.role === show) && (!find.trim() || `${person.name} ${person.handle ?? ''}`.toLowerCase().includes(find.trim().toLowerCase())));
  const count = seen.length;
  useEffect(() => {
    const box = frame.current;
    if (!box) return;
    const measure = () => {
      const rows = [...box.querySelectorAll<HTMLElement>('[data-row]')], top = box.scrollTop;
      if (!rows.length) return setSpan(null);
      const first = rows.findIndex(row => row.offsetTop - box.offsetTop + row.offsetHeight > top + 4);
      let last = rows.length - 1;
      while (last > first && rows[last].offsetTop - box.offsetTop >= top + box.clientHeight - 4) last--;
      setSpan(last - first + 1 >= rows.length ? null : [first + 1, last + 1]);
    };
    measure();
    box.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { box.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [count]);
  // A new search or filter starts at the top of what it found.
  useEffect(() => { if (frame.current) frame.current.scrollTop = 0; }, [find, show]);
  const roleChoices = (person: RosterPerson) => ROLES.filter(role => isOwner || role === 'member' || role === 'follower' || role === person.role);
  return <div>
    {people.length > 12 && <div className="lp-mb-tools">
      <input className="lp-mb-field" type="search" value={find} onChange={event => setFind(event.target.value)} placeholder="Find a person or a tag" aria-label="Find a person" />
      <span className="lp-mb-seg" role="group" aria-label="Show">{(['all', ...ROLES] as const).map(role => <button key={role} type="button" aria-pressed={show === role} onClick={() => setShow(role)}>{role === 'all' ? 'Everyone' : `${NAME[role]}s`}<span>{role === 'all' ? people.length : people.filter(person => person.role === role).length}</span></button>)}</span>
    </div>}
    <section className="lp-mb-list" id="roles" aria-labelledby="roster-title">
      <h2 className="lp-mb-label" id="roster-title"><b>In the group</b>{count === people.length ? count : `${count} of ${people.length}`}</h2>
      <div className="lp-mb-rows" ref={frame} tabIndex={0} aria-label="People in the group">
        {seen.map(person => <div className="lp-mb-row" data-row key={person.personId} id={person.isYou ? 'tag' : undefined}>
          <Face id={person.personId} name={person.name} />
          <span className="lp-mb-who">{person.name}{person.isYou && person.name !== 'You' && <span className="lp-mb-you">You</span>}</span>
          <span className="lp-mb-meta">{person.isYou
            ? <label className="lp-mb-tag">@{namespace}/<input key={person.handle ?? ''} defaultValue={person.handle ?? ''} placeholder="your-tag" maxLength={48} pattern="@?[A-Za-z0-9][A-Za-z0-9\-]{1,47}" aria-label="Your tag" disabled={pending}
                onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                onBlur={event => { const next = event.target.value.trim().replace(/^@/, '').toLowerCase(); if (next !== (person.handle ?? '') && event.target.validity.valid) run(actions.saveTag, { orgId: scope.orgId, handle: next }, next ? `Teammates can tag you as @${namespace}/${next}.` : 'Your tag was removed.'); }} /></label>
            : person.handle ? <span className="lp-mb-mono">@{namespace}/{person.handle}</span> : 'No tag yet'}</span>
          {person.canSetRole
            ? <select className="lp-mb-role" value={person.role} disabled={pending} aria-label={`Role of ${person.name}`} onChange={event => run(actions.grant, { ...scope, personId: person.personId, role: event.target.value }, `${person.name} is now ${event.target.value === 'member' || event.target.value === 'follower' ? 'a' : 'an'} ${event.target.value}.`)}>{roleChoices(person).map(role => <option key={role} value={role}>{NAME[role]}</option>)}</select>
            : <span className="lp-mb-role lp-mb-fixed">{NAME[person.role]}</span>}
          <span className="lp-mb-acts">
            {person.isYou && canLeave && <Twice label="Leave group" confirm="Confirm: leave" disabled={pending} onGo={() => run(actions.removeFromGroup, { orgId: scope.orgId, personId: person.personId })} />}
            {!person.isYou && person.remove === 'group' && <Twice label="Remove" confirm="Confirm: remove" disabled={pending} onGo={() => run(actions.removeFromGroup, { orgId: scope.orgId, personId: person.personId }, `${person.name} was removed from the group.`)} />}
            {!person.isYou && person.remove === 'role' && <Twice label="Remove" confirm="Confirm: remove" disabled={pending} onGo={() => run(actions.revokeRole, { ...scope, personId: person.personId }, `${person.name} was removed from this group.`)} />}
          </span>
        </div>)}
        {!count && <p className="lp-mb-empty">Nobody matches. Clear the search to see everyone.</p>}
      </div>
      <p className="lp-mb-foot"><span>{span ? <><b>{span[0]} to {span[1]}</b> of {count}</> : count ? <>All <b>{count}</b> shown</> : null}</span></p>
    </section>
    <Said result={result} />
  </div>;
}

const LINK_SAYS: Record<JoinMode, string> = {
  off: 'No link. People join by invitation only.',
  ask_first: 'Anyone with the link can ask to join. You approve each one.',
  admit: 'Anyone with the link who signs in becomes a member at once. Share it only where you would welcome everyone who sees it.',
};
/** The join link: off, ask first, or admit on sign-in. A link is shown once, when it is made, because Loop keeps no copy of it. */
export function JoinLink({ scope, mode, actions }: { scope: Scope; mode: JoinMode; actions: Pick<Actions, 'setLink' | 'replaceLink'> }) {
  const { result, pending, run } = useRun();
  const link = result.accessRequestToken ? `${typeof window === 'undefined' ? '' : window.location.origin}/groups/request#token=${result.accessRequestToken}` : null;
  return <section className="lp-mb-card" aria-labelledby="join-title"><h2 id="join-title">Join link</h2>
    <div className="lp-mb-line">
      <span className="lp-mb-seg" role="group" aria-label="Join link">{([['off', 'Off'], ['ask_first', 'Ask first'], ['admit', 'Admit on sign-in']] as const).map(([value, label]) => <button key={value} type="button" data-mode={value} aria-pressed={mode === value} disabled={pending} onClick={() => { if (value !== mode) run(actions.setLink, { ...scope, mode: value }); }}>{label}</button>)}</span>
      {mode !== 'off' && <button type="button" className="lp-mb-quiet" disabled={pending} onClick={() => run(actions.replaceLink, scope)}>New link</button>}
    </div>
    {link && <div className="lp-mb-line"><input className="lp-mb-field" readOnly value={link} aria-label="Join link to copy" onFocus={event => event.target.select()} /><CopyLink url={link} /></div>}
    <p className="lp-mb-note">{link ? 'Copy it now. It is shown once; a new link stops the old one.' : LINK_SAYS[mode]}</p>
    {result.status === 'error' && <Said result={result} />}
  </section>;
}

/** Invites one person by email. Loop sends no email: they see the invitation when they sign in with that address. */
export function Invite({ scope, actions }: { scope: Scope; actions: Pick<Actions, 'invite'> }) {
  const { result, pending, run } = useRun();
  const form = useRef<HTMLFormElement>(null);
  const link = result.invitationToken ? `${typeof window === 'undefined' ? '' : window.location.origin}/groups#invite=${result.invitationToken}` : null;
  return <section className="lp-mb-card" id="invitations" aria-labelledby="invite-title"><h2 id="invite-title">Invite by email</h2>
    <form ref={form} className="lp-mb-invite" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(actions.invite, { ...scope, recipientEmail: String(data.get('recipientEmail')), role: String(data.get('role')) }); form.current?.reset(); }}>
      <input className="lp-mb-field" name="recipientEmail" type="email" required placeholder="name@school.edu" aria-label="Email to invite" disabled={pending} />
      <select className="lp-mb-role lp-mb-boxed" name="role" aria-label="Invite as" disabled={pending}><option value="member">Member</option><option value="follower">Follower</option><option value="organizer">Organizer</option></select>
      <button className="lp-mb-go" disabled={pending}>{pending ? 'Inviting' : 'Invite'}</button>
    </form>
    {link && <div className="lp-mb-line"><input className="lp-mb-field" readOnly value={link} aria-label="Invitation link to copy" onFocus={event => event.target.select()} /><CopyLink url={link} /></div>}
    <p className="lp-mb-note" role={result.status === 'error' ? 'alert' : undefined} data-warn={result.status === 'error' || undefined}>{result.status === 'error' ? result.message : link ? 'Invitation made. You can also send them this link; it is shown once.' : 'They see it when they sign in with that address. Loop sends no email. It lasts 14 days.'}</p>
  </section>;
}

/** People who asked to join and invitations not yet taken up, each with its one decision. */
export function WaitingList({ scope, waiting, actions }: { scope: Scope; waiting: Waiting[]; actions: Pick<Actions, 'review' | 'cancelInvite'> }) {
  const { result, pending, run } = useRun();
  const row = (item: Waiting): ReactNode => item.kind === 'request'
    ? <div className="lp-mb-mini" key={item.key}><Face id={item.personId} name={item.name} /><div><b>{item.name}</b><span>Asked {day(item.at)}</span></div>
        <button type="button" className="lp-mb-go" disabled={pending} onClick={() => run(actions.review, { ...scope, personId: item.personId, decision: 'approve' }, `${item.name} is in, as a member.`)}>Approve</button>
        <button type="button" className="lp-mb-quiet" disabled={pending} onClick={() => run(actions.review, { ...scope, personId: item.personId, decision: 'decline' }, `Declined ${item.name}.`)}>Decline</button></div>
    : <div className="lp-mb-mini" key={item.key}><Mail /><div><b>{item.email}</b><span>Invited as {item.role} · until {day(item.until)}</span></div>
        <button type="button" className="lp-mb-quiet" disabled={pending} onClick={() => run(actions.cancelInvite, { id: item.id }, `Invitation to ${item.email} revoked.`)}>Revoke</button></div>;
  return <section className="lp-mb-card" aria-labelledby="waiting-title"><h2 id="waiting-title">Waiting <span>{waiting.length}</span></h2>
    {waiting.length ? <div className="lp-mb-waitbox" tabIndex={0} aria-label="People waiting">{waiting.map(row)}</div> : <p className="lp-mb-note">Nobody is waiting.</p>}
    <Said result={result} />
  </section>;
}
