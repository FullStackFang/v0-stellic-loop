## Why

The pitch storyboard of November 17 (NBAE 6830, Team 1) names a milestone no part of Loop can meet today: three groups using Loop weekly, three organizers claiming an event with one paying, and one business-funded perk redeemed. Students in the team's campus interviews said finding events is not their barrier, so a listing alone will not bring them back. The bet is that a reward for going together will.

Between November 17 and 18 the founder shaped that bet into one screen, "This week", as a clickable mockup (`public/demo/mockups-campus-usecases.html`, screen 1) and approved it for building. The founder also decided that this campus screen becomes what everyone sees, and that the current groups site is tabled: kept, but open only to the founder as admin.

This change replaces the earlier draft of `loop-campus-rewards`, which described a three-page model with interest tabs, venue offers and a host view. The founder has since overruled those parts.

## What Changes

- Start at four schools: Cornell, Columbia, NYU and CUNY. Each has its own list, feeds and rewards. One sign-in door serves all four: a school menu that also switches by itself from the email typed (an `nyu.edu` address switches it to NYU), beside "Continue with Google". A person belongs to the school of their email.
- Add the campus screen "This week": one list of events on one campus, shown as a sideways row of ticket cards, fitted to one screen.
- Pull events in every hour from calendar feeds: the campus's CampusGroups feed and any Luma calendar feed. A feed event carries a source label and no link out of Loop.
- Let any signed-in person post a plan of their own ("running at 5", a study group). It joins the same list.
- Add a search box, "What do you feel like doing?", that returns a few best matches by meaning, then the looser matches after a marker in the same row. "All of CampusGroups" is the one complete view.
- A person says "I'm in" on a plan, or "Register me" on a feed event, which puts them in a group for that event. They invite people they know or copy a link. During the event each person taps "Check in".
- Rewards ride on events. A group reward, from a venue or an organizer, unlocks when a set number of one group has checked in. A building reward is earned by activity over time (20% off running shoes after 5 group runs). Rewards a person is earning sit under the row as coupons.
- Add levels: Member, Regular, Insider, earned by outings. The level shows only as a badge on the avatar, which opens a level card. A higher level gets a better version of a reward. Nobody is ever shown a locked or greyed reward.
- An opened event unfolds a panel sideways inside the row: what it is, how the reward unlocks, who is going that you know, a map, and the actions.
- **BREAKING** Make the campus screen the front door at `/` for everyone. The existing groups site and its "How we got here" archive open only for the founder, the single admin. Everyone else who opens them is sent to the campus screen. This is behind one environment flag so it can be turned back.
- Give the campus screen its own colours, built on the lime green and navy ink of the current groups look, in place of the coral of the mockup. The exact values are being picked from mockup options.
- Founder's admin page for the campus: feeds, places, listings and rewards, managed by hand.

Not in this change, each a later change of its own:

- The club event with a quota (mockup screen 2), the team dinner that decides itself (screen 3) and paying (screen 4). No money moves through Loop here.
- An organizer or a business claiming an event, setting its own rewards, and seeing counts. In this change the founder enters every reward by hand. The earlier draft's `host-view` and `venue-offers` capabilities are removed from this change for that reason.
- A venue finder, offers by time slot, and placing a plan at a venue.
- Real registration with CampusGroups or Luma. "Register me" is recorded in Loop only.
- Proof of presence beyond the tap, a phone app, notifications by email or text, connector tools, and events from sites with no feed (Posh, Partiful).

## Capabilities

### New Capabilities

- `campus-listings`: the one list of events on a campus, events imported from calendar feeds, the source label, places and the map, listings managed by hand, and what a signed-out visitor sees.
- `campus-search`: the "What do you feel like doing?" box, best matches and looser matches, the complete CampusGroups view, and silent ranking.
- `campus-screen`: the one-screen layout, the top bar, ticket cards, the sideways detail panel, the rewards shelf, and colours by role.
- `member-plans`: posting a plan, changing and cancelling it, and limits on posting.
- `outings`: "I'm in", "Register me", inviting, the share link, joining, checking in, and who sees whom.
- `group-rewards`: group rewards by head count, building rewards by activity, the rewards a person is earning, marking a reward used, and the rule that nothing locked is shown.
- `member-levels`: the three levels, what counts toward them, the avatar badge and the level card, and how a level changes a reward.
- `campus-sign-in`: the four schools, the one sign-in door, the school menu that follows the email, and placing a person at the school of their email.
- `admin-gate`: the campus screen as the front door, and the current groups site and archive open to the admin only.

### Modified Capabilities

None as spec deltas. The behaviour of the groups pages themselves (`group-tree`, `group-events`, `group-start` and the rest) is unchanged for the admin; `admin-gate` adds who may open them. Team events, the cohort board and share pages are not rebuilt on.

## Impact

Root Next.js application.

- New pages under `/c` and `/o`, and a new module folder `lib/campus/`.
- One additive migration with new tables only. The founder applies it by hand on the hosted database.
- One new hourly cron route in `vercel.json`.
- `proxy.ts` extended: Clerk runs on `/c` and `/o`, and the admin gate runs on the groups site.
- `app/page.tsx` changes from a redirect to `/groups` to the campus screen when the flag is on.
- New environment variables: `LOOP_FRONT` (the flag), `LOOP_ADMIN` (who the admin is).
- A new stylesheet for the campus look. `app/loop.css` is not changed.
- Reuses Clerk sign-in, the person record behind `getPortalPrincipal`, `ical.js` (already a dependency) and the database helpers in `lib/db.ts`. The map is an OpenStreetMap embed in a frame. No new dependency, no payment provider, no model call.
- People affected: every current member of a group loses the group pages on the site when the flag is turned on. See design.md, D17.
