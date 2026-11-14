import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ViewTransition } from 'react';
import { db } from '@/lib/db';
import { getPortalPrincipal, portalGroupTree } from '@/lib/emba/portal-session';
import { groupHandle, groupHref, treeOrder } from '@/lib/emba/group-path';
import { listReceivedInvitations, type ReceivedInvitation } from '@/lib/emba/invitations';
import { ActionForm } from '@/components/emba/portal-forms';
import { acceptInvite, declineInvite } from './actions';
import { InvitationLink } from './invitation-link';
import { InvitationPaste } from './invitation-paste';
import { Arrow, Rings } from '@/components/LoopGlyphs';

export const dynamic = 'force-dynamic';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
// An invitation and the group it becomes share a name, so accepting morphs the plate into its row.
const morph = (loopId: string) => `lp-group-${loopId}`;

function InviteActions({ invite }: { invite: ReceivedInvitation }) {
  return <div className="lp-arrival-acts">
    <ActionForm action={acceptInvite} label="Accept"><input type="hidden" name="id" value={invite.id} /></ActionForm>
    <ActionForm action={declineInvite} label="Decline"><input type="hidden" name="id" value={invite.id} /></ActionForm>
  </div>;
}

export default async function GroupsPage() {
  const principal = await getPortalPrincipal();
  if (!principal) redirect('/groups/sign-in');
  let groups, invitations;
  try {
    [groups, invitations] = await Promise.all([portalGroupTree(principal).then(treeOrder), listReceivedInvitations(db(), principal)]);
  } catch {
    return <section className="lt-editor"><h1>Groups unavailable</h1><p role="alert">Your access may have changed. Reload to try again.</p></section>;
  }
  const ownerAllowed = !!principal.verifiedEmail && (process.env.LOOP_PILOT_OWNER_SUBJECTS ?? '').split(',').some(subject => subject.trim() === principal.subject);
  const [invite, ...moreInvites] = invitations;
  // One way to start a group, for a pilot owner or an owner or organizer of any group: the start page.
  const create = (ownerAllowed || groups.some(group => group.canStart)) && <Link className="lp-btn lp-create" href="/groups/new">Start a group<Arrow /></Link>;
  // Someone who may start a group and has none yet: starting one is the page, not a link at the bottom of it.
  const first = ownerAllowed && !invite && groups.length === 0;

  return <>
    <p className="lp-crumbs"><b>Groups</b></p>

    {invite ? <ViewTransition name={morph(invite.loopId)} share="lp-morph" default="none">
      <section className="lp-arrival" aria-labelledby="invite-title">
        <div>
          <p className="lp-signin-kick">An invitation for you</p>
          <h1 id="invite-title">Join <em>{invite.groupName}.</em></h1>
          <p className="lp-arrival-meta">As {invite.role === 'organizer' || invite.role === 'owner' ? 'an' : 'a'} {invite.role} · Expires {day(invite.expiresAt)} · Only your verified email can accept</p>
          <InviteActions invite={invite} />
        </div>
        <div className="lp-arrival-art"><Rings inline /></div>
      </section>
    </ViewTransition>
    : groups.length === 0 ? <section className="lp-arrival" aria-labelledby="wait-title">
      <div>
        <p className="lp-signin-kick">Signed in</p>
        <h1 id="wait-title">{first ? <>Start <em>your group.</em></> : <>Waiting for <em>your invitation.</em></>}</h1>
        <p className="lp-arrival-meta">{first ? 'Name it, drop in what the group needs, and invite people. Invited to someone else’s group? Paste the link here.' : 'Groups are invite-only. When someone invites your email, it shows up right here. Got the link already? Paste it.'}</p>
        {first && <p><Link className="lp-ng-create" href="/groups/new">Start your group</Link></p>}
        <InvitationPaste />
      </div>
      <div className="lp-arrival-art"><Rings inline /></div>
    </section>
    : <section className="lp-plate" aria-labelledby="groups-title">
      <Rings inline />
      <div><h1 id="groups-title">Your groups</h1><p>Ask your assistant about any of them. It answers from what each group has saved.</p></div>
    </section>}

    {moreInvites.length > 0 && <section className="lp-section" aria-labelledby="more-title">
      <div className="lp-sechead"><h2 id="more-title">More invitations <span>{moreInvites.length}</span></h2></div>
      <ul className="lp-list">{moreInvites.map(more => <li key={more.id} className="lp-grouprow">
        <ViewTransition name={morph(more.loopId)} share="lp-morph" default="none"><span className="lp-grouptile"><Rings /></span></ViewTransition>
        <div><b>{more.groupName}</b><span className="emba-meta">As {more.role} · Expires {day(more.expiresAt)}</span></div>
        <InviteActions invite={more} />
      </li>)}</ul>
    </section>}

    {groups.length > 0 ? <section className="lp-section" aria-labelledby="list-title">
      <div className="lp-sechead"><h2 id="list-title">{invite ? 'Your groups' : 'Groups'} <span>{groups.length}</span></h2>{create}</div>
      <ul className="lp-list">{groups.map(group => <li key={group.loopId}>
        <ViewTransition name={morph(group.loopId)} share="lp-morph" default="none">
          <Link className="lp-grouprow" href={groupHref(group)} style={group.depth ? { marginLeft: Math.min(group.depth, 4) * 28 } : undefined}>
            <span className="lp-grouptile"><Rings /></span>
            <div><b>{group.orgName}</b><span className="lp-handle">{groupHandle(group)}</span></div>
            <span className="lp-go"><Arrow /></span>
          </Link>
        </ViewTransition>
      </li>)}</ul>
      <InvitationLink />
    </section>
    : <section className="lp-help" aria-label="If your invitation hasn't arrived">
      <div><b>Invited at another email?</b><p>Sign out from your account menu and sign in with that one. An invitation only opens for the address it went to.</p></div>
      <div><b>Connect your assistant now</b><p>It can reach each group once you join and grant it access.</p><Link href="/groups/connections">Assistants</Link></div>
      {ownerAllowed && !first ? <div><b>Running a group?</b><p>Start one, drop in what it needs and invite people.</p>{create}</div>
        : <div><b>Who sends invitations?</b><p>The person who runs your group, from the group’s Members page.</p></div>}
      {invite && <InvitationLink />}
    </section>}
  </>;
}
