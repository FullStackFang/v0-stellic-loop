## Why

A new group opens to an empty events list, and only owners and organizers can fill it. Nobody wants to suggest something first, so the list stays empty. The Yik Yak lesson is density: a small group needs to see local things worth going to on day one, and adding one more has to be as cheap as pasting a link.

## What Changes

- **Add by link.** Any member who can post pastes an event link. For a known event site (Luma, Posh, Eventbrite) Loop reads that one page and adds it to the group as an event, with the member marked interested. No approval, no review.
- **Sites Loop cannot read.** The link is kept as a pointer and the member gives the name and time themselves.
- **One event per link.** A link that is already in the group resolves to the existing event; pasting it again marks interest and adds nothing.
- **Take it back.** The member who added a linked event can remove it while nobody else is interested in it.
- **Stays current.** Linked events are read again once a day until they pass. A change of time or place at the source carries over; an event that disappears at the source is labelled and kept.
- **Nearby (seeding).** An owner or organizer gives the group calendar feeds (a club's CampusGroups feed, a Luma calendar, a school calendar). Loop reads them hourly and shows the next 14 days as a quiet "Nearby" list. Nearby items are not group events: they are not announced, do not wait on anyone, and do not count toward the 50 upcoming events.
- **First interest makes it the group's.** When a member says they are interested in a nearby item, it becomes a group event with that member interested.
- **Assistant.** A new connector tool adds an event by link or from the nearby list; `whats_on` also lists nearby items.
- **Changed rule.** "Only owners and organizers add events" gains one exception: adding by link or from nearby. Changing and archiving any event stays with owners and organizers.

Not in this change: a distance radius (public CampusGroups feeds hide the place, so locality comes from which feeds the group picks), crawling a site's listing pages, and any approval or moderation step.

## Capabilities

### New Capabilities
- `event-links`: a member adds an event to a group by pasting a link; which sites Loop reads and how; one event per link; taking it back; the daily re-read.
- `nearby-events`: calendar feeds per group, the Nearby list they produce, and how a nearby item becomes a group event on first interest.
- `campus-event-links` (added 2026-11-18): on the campus "Post a plan" page, anyone signed in pastes an event link, Loop fills the form from the page, and the posted plan keeps the link; one link is one plan per campus.

### Modified Capabilities
- `group-events`: the requirement "Owners and organizers manage events from the site or an assistant" changes so that a member who can post can add an event by link or from nearby.

## Impact

- **Database:** one new migration on the hosted Supabase project (applied by hand by the founder): new tables for a group's feeds and nearby items, and source columns on `emba_team_event`.
- **Code:** new `lib/emba/event-link.ts` (page readers), `lib/emba/team-nearby.ts` (feeds, nearby list), a guarded fetch helper; `lib/emba/team-events.ts`, `team-interest.ts`, `team-mcp.ts`, `team-format.ts`; the team page under `app/groups/[namespace]/team/` and its actions. `parseFeed` from `lib/campus/import.ts` is reused unchanged.
- **Outbound requests:** this is the first place the team side fetches a web page. Requests go only to a fixed list of event sites (links) or to a feed address an owner or organizer entered on the site (feeds), carry no cookies and nothing about the member.
- **Scheduled work:** one new hourly cron route for group feeds; the daily cron re-reads linked events.
- **Dependencies:** none new (`ical.js` is already installed).
- **Connector:** one new tool under the existing read-and-write grant; no new scope.
