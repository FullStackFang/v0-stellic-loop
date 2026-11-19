## Context

What exists today (checked against the code on 2026-11-18, including an independent review):

- `waiting()` in `lib/emba/team-waiting.ts` reads, for one member across all their groups, the open asks they have not answered, events they have not acted on, ideas, mentions and announcements. Its only caller is the assistant endpoint (`team-mcp.ts`). It returns at most 10 items, ordered by kind first, and reads groups one after another.
- Asks (`lib/emba/team-asks.ts`) have four kinds: `one`, `many`, `dates`, `text`. An ask has a closing time, one answer per member, a count ("9 of 14 answered"), and for the asker and organizers a list of who has not answered plus a reminder to paste. Loop also sends its own `ask_new` and `ask_reminder` messages (`reach-send.ts`).
- The campus screen (`app/c/[campus]/page.tsx`) is the product's main view. `Week` (`app/c/week.tsx`) builds one `Screen` object on the server and hands it to a client component (`components/campus/screen.tsx`). The screen is one fixed-height view: a top bar, a search line, a count line and a sideways row of tickets.
- **The groups site is closed to everyone but the admin.** Unless `LOOP_FRONT=groups` is set, `proxy.ts` sends any non-admin who opens `/groups/*`, `/a/*` or `/e/*` to the front door, and `getPortalPrincipal` is null for them. So today a non-admin member cannot open an ask's page, an emailed answer link, or the ask form. Assistants are not gated.
- A signed-in campus viewer has a real `Principal` (`CampusViewer.principal` in `lib/campus/session.ts`), which is what `waiting()` and `answerAsk()` need. `Viewer.groups` is not the viewer's groups: it is empty for non-admins.
- Campus tickets and group events are two separate systems. A campus ticket has its own "I'm in"; a group event has interest and decline.

The founder picked layout A ("By when") in conversation on 2026-11-18: one list across groups, soonest first, each row showing kind, what, group and when, with acting in the row. They have not seen it drawn. They also said the product has two sides, the groups you are part of and the open groups you find through search, and that the campus view is the focus. Everything else below is my call unless marked as theirs.

## Goals / Non-Goals

**Goals:**
- A member sees everything their groups need from them in one place on the campus screen, and clears most of it without leaving.
- An organizer posts a to-do once and sees who has not done it, with no new machinery.

**Non-Goals:**
- Chat, a files area, or hosting documents.
- Pulling tasks from email, WhatsApp or CampusGroups.
- A view of one member's record across asks (who is habitually late). The asks spec forbids it and this change keeps that.
- A new notification channel or new notification settings.
- Opening the groups site to people who belong to no group. (It is opened to the members of a group: see D12, as changed 2026-11-19.)

## Decisions

**D1. A to-do is a fifth kind of ask, `done`.** It has a question, a closing time (its due time) and no options. A member's answer is a row in `emba_ask_answer` with no choices and no text; taking it back deletes the row. Everything else is inherited: one answer per member, the count, who has not answered, the reminder, the share link, outbound messages, caps, the assistant tools.
- The database refuses this today in three places, all in `20261112000000_emba_club_events_asks.sql`, and the migration changes all three: the `kind` check on `emba_ask`; the deferred trigger `emba_ask_check`, which rejects any non-`text` ask without 2 to 10 options; and the check `emba_ask_answer_one_shape`, which requires an answer to have a choice or text but not both. The answer guard `emba_ask_answer_guard` must also refuse a choice or text on a `done` answer.
- In code, `createAsk` and `answerAsk` need their own branch for `done` (today zero options returns `too_few` and an answer with no choice returns `needs_choice`), with a new refusal for "this kind takes no options" and for "a to-do is only marked done". The wording for those lives in `app/a/actions.ts`.
- The person who posts a to-do is counted among those who have not done it, like any member, and sees it on their own list. Loop's messages do not go to the asker; that stays.
- Alternative: a new to-do table. Rejected: it would repeat the answer, missing-list, reminder, share and message code for a thing that differs only in having no options.
- Alternative: a `one` ask with a single "Done" option. Rejected: option kinds require at least two options, and every surface would read "Pick one".

**D2. A `done` ask is always named.** Who has done it is the point. `reveal` is saved as `named` whatever is sent, the form does not offer the choice, and `setAskReveal` refuses to switch it.

**D3. A to-do closes at its due time; a missed one stays visible, and the organizer can extend or reopen it** (founder, 2026-11-18). After the due time it cannot be ticked. For a member who did not do it, it stays on their list marked "Missed" for 7 days (the same window in which the organizer sees who did not do it), then leaves. The person who posted it, and the group's owners and organizers, can give it a new due time, before or after it has passed; a passed one opens again, keeps the answers it has, and returns to the lists of those who have not done it as an ordinary row.
- **Extending and reopening applies to every kind of ask, not only to-dos** (founder, 2026-11-18: a poll due today with too little input, the organizer reopens it and moves the date; "common sense, quality of life"). This removes the rule "a closed ask is not reopened". Extending sets a new closing time, clears the early-close mark, keeps the answers, and is written to the change sequence. The 60-days-out limit applies to the new time. An ask of any age can be reopened.
- One exception: the ask Loop opens itself to settle an idea's day. Closing it sets the idea's day, so reopening it would have to unset a day people have planned around. It is not reopened.
- A reopened ask goes back on the lists of those who have not answered. Extending sends no message by itself; the reminder Loop already sends before an ask closes applies to the new time, and a member who was reminded before the move is reminded again before the new time. (If the new time is under a day away, that reminder is due at once.) Loop may already have sent the result of an ask when it closed; after a reopen the result is sent again when it closes again.
- Only a missed to-do is shown as "Missed". A vote the viewer did not cast simply leaves their list when it closes, and returns if it is reopened.
- "Reviewable" (founder's word) is read as this: the organizer looks at where an ask ended up and can reopen it.

**D3b. A missed row has no button.** It says what it was, which group, and when it passed. It is listed after everything still open.

**D4. The list lives on the campus screen, as the "yours" side.** It is drawn only from groups the viewer belongs to, for a signed-in viewer, whichever campus screen they are on: membership, not campus, decides what is theirs. It is read with `CampusViewer.principal`. When nothing is on the viewer it is not drawn.
- The list is its own server component, read separately and handed to the screen as a slot, the way `signOut` is today. It is not a field of `Screen`: `Screen` is built in one await, so a field would hold up the week (D8).
- Where it sits (founder picked 2026-11-18, mockup direction C): behind an "On you N" counter in the top bar, which opens the list in a panel over the screen and closes on a second press. The week keeps its full room. With nothing on the viewer there is no counter. The founder first asked for it to be minimal, so nothing else is added to the screen.
- Finishing a row must feel smooth (founder, 2026-11-18): the row says what was recorded, fades, the space it held closes and the rows below slide up, and the count changes. The list never jumps or loses its scroll position, and with motion reduced the row is simply removed. The mockup shows the timing.
- The row of events on the campus screen never shows a cut ticket and its scrolling snaps to whole tickets (founder, same day). In the mockup the tickets share the row width evenly and two round arrow pills on the filter line move one set at a time. The filter pills (Best for you, CampusGroups, Near you) sit on the line with the "+", each on a pill.
- Alternative: the top of `/groups`. Rejected: the founder named the campus view as the focus, and the groups site is closed to members.

**D5. The list has its own per-group read.** `onYou(db, principal)` in `team-waiting.ts` reads asks, events and ideas only, each ordered by time, and merges them across groups: an ask by when it closes, an event or idea by when it starts, undated ideas last. It returns up to 30 rows and, per group, how many more. It does not reuse `teamWaiting` as it stands: that caps each kind at 10 per group (so "the 30 soonest" would be wrong), counts mentions and announcements into its totals, and reads them twice per group for nothing. `teamWaiting` gains parameters for which kinds to read and how many, used by both callers. `onYou` never writes to `emba_waiting_shown`.
- Mentions and announcements are left off the list: they have no date and nothing to do in the row.

**D5b. "This is yours" arrives as an alert, not a row** (founder, 2026-11-18). When a teammate proposes a piece of work for the viewer (a claim with status `proposed` and the viewer as owner), the campus screen shows it as an alert with a short animation: who proposed it, what it is, which group, a due date if it has one, and two buttons, "It's mine" and "Not mine". These call the existing confirm and decline of a proposed claim (`lib/emba/team-records.ts`). One alert at a time, oldest first; it stays until answered and comes back on the next visit if ignored. How it looks and moves is settled by the mockup. `onYou` returns these beside the rows. Reading them does not mark the mention as shown, so the assistant still tells the member too.

**D6. Row labels.** `done` ask: "Do". Other asks: "Vote". Group event: "Show up". Idea: "Show up" when it is one person short; "Do" when its proposer has something to settle (place, time, day).

**D7. What can be done in the row.**
- `done` ask: a "Done" button.
- `one` ask with at most 4 options: one button per option.
- Group event, and an idea one short: "I'm in" and "Not for me".
- `many`, `dates`, `text`, a `one` ask with more than 4 options, and a proposer's idea: the row links to the item's page (see D12).
Each button is a server action in the campus actions file, calling the existing write (`answerAsk`, the interest and decline writes) with route `site` and the campus viewer's principal, then revalidating the campus screen. It follows the screen's existing `run(...)` pattern. The same checks apply as anywhere else, including the cap of 30 writes an hour per top-level group; a row that hits the cap says so and stays.

**D8. The list must not slow the campus screen.** It renders inside its own Suspense boundary (possible because of the slot in D4), and `onYou` reads groups a few at a time rather than strictly in sequence.

**D9. Wording for the new kind, everywhere an ask is shown.** "14 of 20 done", "Who has not done it", "6 still to do by Fri Nov 22", "Done" / "Not done after all", "You have done this" / "You have not done this". Places that switch on the kind, all of which need the new case: `app/a/[token]/page.tsx`, `app/a/actions.ts`, `app/groups/reach/answer/[token]/page.tsx`, `app/groups/reach-actions.ts`, `lib/emba/reach-link.ts`, `lib/emba/reach-send.ts`, `components/emba/ask-parts.tsx` (`yourAnswerText`, `AskRow`, `AskForm`), `lib/emba/team-format.ts` (kind words, "answered:" lines, how-to-answer lines), `lib/emba/team-card.ts` (the non-text path draws option picks), `lib/emba/team-mcp.ts`, and `scripts/emba-seed.ts`. The team and organize pages get it through `AskRow`.

**D10. Look.** The campus screen's look, reusing its row, pill and button styles. No new visual language.

**D12, changed by the founder 2026-11-19** ("I need to be able to see the groups that I am a part of ... all of that needs to be accessible"). With the campus screen in front, the groups site opens for the admin and for anyone who belongs to a group; a person in no group is still sent to the front door, and a signed-out visitor too. This replaces "admin only" (loop-campus-rewards D17) for `/groups` and `/e/*`; the older `/emba` pages stay the admin's. The check is one question (`inAGroup`, a live role in a group the person is a live member of) asked by `getPortalPrincipal`, which every groups page and action already goes through; what a member may see and do in a group is still decided by their role in that group. The proxy only turns away signed-out visitors, because membership needs the database. Where a person finds their groups: the campus top bar names their top-level groups (as it did for the admin), and the "On you" panel ends with "Your groups" (every group they are in, each a pill to its page) and "You are going" (the outings on this week they are in, each opening its ticket). The counter is therefore drawn for anyone in a group or going to something.

**D4, as built (2026-11-19).** The counter is drawn for anyone who is in a group; it carries a number only when something waits, and a person in no group sees nothing. Work proposed for the person opens the panel by itself and sits first in it. "Ask a group" is a pill in the panel's head, shown to people who may post in a group; it is one line read like a posted plan (`readDue` in `lib/campus/line.ts`: the time it says, or the end of the day it names), with the group taken from an @tag or picked from pills. It offers three kinds: something to do, pick one, written answer. Dates and pick-several asks are still made from the assistant or the group's page. A finished row needs no measuring to leave: its space closes with a grid row going from 1fr to 0fr.

**D11. One real event is one record; that is a separate change** (founder, 2026-11-18: "we should not have redundant events. The real live event could have a group association"). Today a campus listing and a group event are separate records in separate systems, each with its own "I'm in". The founder's direction is one event that groups are associated with. That reshapes both event systems and is not part of this change; it is recorded here so the list is built to survive it. The founder added the rule that goes with it: a verified organizer controls their group's events, so the president of the AI club manages the AI club's events. That depends on confirming who runs a club (D13) and belongs to the same later change.
- How the association is made (founder, 2026-11-18: it should be pulled in with the CampusGroups event, not separately). The feed already says which club each event belongs to: every event carries the club's name (`ORGANIZER;CN`), a short club code (`CATEGORIES;X-CG-CATEGORY=club_acronym`, for example `CCUSA`) and an event type ("Open Event", "Private Meeting"). Loop keeps the name today (`host_name` on a listing) and drops the code and the type. The later change keeps the code on each listing as it is read, ties a Loop group to a club code when the club is claimed, and from then on that group's events are the listings with its code. No second record is made.
- What that means for this list. Group events stay for groups that are not on CampusGroups (a cohort, a trip). For a claimed club, "Show up" rows will come from its associated listings once that change lands. Until then the list's "Show up" rows are group events, as today, and this change adds no new copy of any event. `onYou` returns events through one function so a second source can be added there.

**D12. Access follows membership** (founder, 2026-11-18: groups are invite-only for now; later some may be public or open to particular kinds of people). A signed-in member of a group can open that group's ask pages and the emailed answer link and act there, whatever `LOOP_FRONT` is; nobody else sees more than the outside view they see today. The rest of the groups site stays as it is.
- **Rights come from a person's role in the group, never from being the site admin** (founder, 2026-11-18: "doesn't matter if they're an admin, they should have ownership rights to an official club"). So a club's owner or organizer must be able to do everything this change gives an organizer without being the admin: post a to-do or a poll, see who has not answered, send the reminder, extend and reopen, close.
- As built: the proxy no longer decides for `/a/*` and `/groups/reach/answer/*`; the pages do. With the campus in front, a signed-out visitor to an ask is sent to sign in and back, and a signed-in person outside the group is sent to the front door, as before. The emailed answer link signs nobody in and works for whoever holds it, as it did before the campus gate: it reaches that one ask and nothing else. The ask actions use the signed-in person, not the admin-only one; every write behind them checks the person's role in the ask's group. Links from a row to `/e/*` and `/groups/*` stay closed to non-admins, so a row never links there.
- Seeing, reminding, extending and closing all live on the ask's page, which D12 opens to the group's members; the page already shows those controls only to the asker, owners and organizers.
- Posting needs a new place, because the ask form is on the closed groups site. This change adds posting on the campus side: on the campus screen, a person who may post in at least one group can start an ask (the existing form, including the new kind), choosing the group if they have more than one. It follows the existing rule for who may ask. How it is reached is settled by the mockup.
- "Official" and "verified" clubs, and how a president comes to own one, are the claim-a-club change (D13). This change relies only on the roles a group already has.
- Alternative: build campus-side ask pages. More work, and the groups pages are already due to move to the campus look.

**D13. Not in this change, and why.** The founder's wider picture has three more parts. Each is its own change:
- *Finding and joining open groups from the campus screen.* Joining already has both modes per group (`admit`: you are in at once; `ask_first`: an organizer approves), but only through a group's link. There is no directory of open groups to search.
- *Claiming a club that exists on CampusGroups.* Waits on the founder's way of confirming who runs a club.
- *Rosters.* An organizer adds members by email today. CampusGroups offers no public way to read a club's members that I know of; an officer can export the list as a file, so a file upload is the realistic route. (Not checked against CampusGroups' current documentation.)

## Risks / Trade-offs

- [The founder picked the layout from a description, and the screen has no obvious room for it] → Task 1 was a mockup with placements; the founder picked the counter (C).
- [Another session is editing `components/campus/screen.tsx` (a "Near you" map tab, uncommitted)] → the list is a separate component handed in as a slot, so the change to that file is a few lines; build after that work is committed.
- [Reopening breaks a rule every ask read relies on: closed stays closed] → one write does it; tests cover a reopened ask of each kind in the list, the count, the missing list, the result and the messages, and that an idea's day ask is refused.
- [Opening ask pages to members undoes part of a deliberate gate] → only for members of that ask's group, tested with a non-member and a signed-out visitor.
- [The "Show up" rows are built on an event model the founder wants replaced] → D11: read through one function, no new event copies.
- [The database must change before the code is deployed] → migration first, then deploy. Until it is applied, creating a `done` ask fails at the database and the write reports an error; nothing else is affected.
- [A member in many groups makes the read slow] → D8; rows capped at 30 with "more in" per group.

## Migration Plan

1. Founder applies `supabase/migrations/20261119000000_emba_ask_done_and_reopen.sql` (auto mode cannot run production migrations). It also drops the 60-day table constraint, which a reopened ask would break (the 60 days are now counted from the moment of the write), lets an ask's closing time move forward, and adds the change-log action `ask_extended`.
2. Deploy.
3. Rollback: close any open `done` asks, then redeploy the previous build. The widened constraints can stay.

## Open Questions

None left in this change. For the later events change: the public feed includes events typed "Private Meeting"; whether those should be shown only to the club's members.
