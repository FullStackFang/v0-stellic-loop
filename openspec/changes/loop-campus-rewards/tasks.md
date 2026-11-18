Everything through section 6 is built with `LOOP_FRONT` unset, at `/c/[campus]`, so nobody using the groups site today is affected until section 7.

## 1. Before building

- [x] 1.1 Clickable mockup of "This week" in `public/demo/mockups-campus-usecases.html`, screen 1, with the founder's go-ahead (November 18).
- [ ] 1.2 Founder: pick the colours from the mockup options (field, ink, action). Record the values in design.md, D18.
- [ ] 1.3 For each of Cornell, Columbia, NYU and CUNY: find the school's public events feed (CampusGroups `/ics_helper` where the school uses it, otherwise whatever calendar feed it publishes) and check it opens without a login. Founder: pick the Luma calendars that belong on each.
- [ ] 1.4 Founder: answer the open questions in design.md that change what is built: whether members' assistants keep their connection, what "your groups" in the top bar means for students, and the level names and numbers.
- [x] 1.5 Read the Next.js guides in `node_modules/next/dist/docs/` that cover routes, server actions, caching and the proxy file before writing any page.
- [x] 1.6 Write the single migration: `campus` (seeded with the four schools and their email domains), `campus_person`, `campus_feed`, `campus_place`, `campus_listing`, `campus_reward`, `campus_outing`, `campus_outing_member`, `campus_invite`, `campus_reward_use`. Run it on PGlite with the full suite (`--maxWorkers=3`, stderr to a file).
- [ ] 1.7 Founder: apply the migration by hand on the hosted database.

## 2. The list and the feeds (demo 1)

- [x] 2.1 Tests first, then `lib/campus/listings.ts`: a campus's events for the next seven days in its timezone, with counts; hidden, cancelled and ended left out; unknown campus is not found.
- [x] 2.2 Tests first, then `lib/campus/admin.ts`: who the admin is from `LOOP_ADMIN` (account id or email; empty means nobody).
- [x] 2.3 Tests first with saved sample feeds from CampusGroups and Luma, then the importer with `ical.js`: create, update by feed and feed item id, hide what left the feed, next 30 days only, outings kept, one failing feed recorded without stopping the others.
- [x] 2.4 Tests first, then `lib/campus/words.ts`: the table that gives an event its "good for" words from its title, about text and host name; words edited by hand survive a re-import.
- [x] 2.5 Tests first, then places: add and change a place with coordinates and other names; match an event's place text to a place.
- [x] 2.6 Campus admin page at `/c/admin`: add a campus, feeds on and off with last result, places, add an event by hand, edit words, hide and unhide. Refuse anyone who is not the admin, in the page and in every action.
- [x] 2.7 Cron route run every hour from `vercel.json`, behind the cron secret.
- [x] 2.8 The campus stylesheet with tokens by role (D18), ported from the mockup's screen 1 styles. `app/loop.css` untouched.
- [x] 2.9 Port the mockup's screen 1 to `/c/[campus]`: top bar, search line, count line, the sideways row of tickets with arrows, the height that fills the window. Signed out: counts, no names, "Sign in" in the bar. Extend `proxy.ts` so Clerk runs on `/c` and `/o`; check the existing routes still behave.
- [x] 2.10 The details panel: unfolds sideways in the row, one open at a time, about, when, the map from the matched place, no map when unmatched.
- [ ] 2.11 Run the importer once against each school's real feeds and check ten events by eye against their sources.
- [ ] 2.12 Founder demo 1: add the campus, its feeds and five places on the admin page; open `/c/[campus]` signed out and see this week's real events as tickets on one screen.

## 3. In, invite, check in (demo 2)

- [x] 3.1 Tests first, then who a person knows: shares a group in the existing groups data, or has checked in on an outing with them.
- [x] 3.2 Tests first, then "I'm in": join the outing of someone known (most known people wins), else start one; one outing per event; pressing twice changes nothing; signed-out visitors sent to sign in and back. Concurrency test: two people join at once, both are in.
- [x] 3.3 "Register" and "Register me" for feed events: recorded in Loop, marked as registered, wording that does not claim the organizer was told.
- [x] 3.4 Tests first, then invites: up to four known people not already in, with how they are known; invite and undo; the invited person's view; no email sent. "Copy link".
- [x] 3.5 Share link `/o/[token]`: the screen with that event's panel open and "Join"; joining a second outing moves the person; unknown token is not found. Leave before checking in.
- [x] 3.6 Tests first, then check-in inside the window in the campus timezone: 30 minutes before start to end, two hours after start with no end; refuse outside the window and for non-members; a second press keeps the first time.
- [x] 3.7 Who sees whom on tickets and in the panel: first names and photos of known people, counts for the rest, initials with no photo, nothing for signed-out visitors. Test that a stranger's name never appears in the page.
- [ ] 3.8 Founder demo 2: say "I'm in" on a real event on one account, join from a second through the copied link, check in on both.

## 4. Rewards and levels (demo 3)

- [x] 4.1 Tests first, then rewards on the admin page: group reward (giver, head count of two or more, text per level, on an event or a host name) and building reward (giver, text, one of three rules); add, change, hide.
- [x] 4.2 Tests first, then unlocking a group reward: count of one outing's check-ins reaches the head count; shown to checked-in members only; different outings never add up.
- [x] 4.3 Tests first, then outings that count (checked in with at least one other) and the three building rules: any outings, outings on events with a word, same group in each of a number of weeks. Tests for a missed week and for an outing alone.
- [x] 4.4 Tests first, then levels: Member, Regular, Insider from counted outings; the text a person sees for a reward by level; a reward with no text at or below a person's level is not shown.
- [x] 4.5 Ticket stubs: giver, reward, group size and how close, seats with faces and checked-in marks, the viewer's empty seat, steps for a building reward, the quiet half for no reward, one action. "How it unlocks" in the panel.
- [x] 4.6 Using a reward: "Show at the counter" in the top bar with the current time; mark used once. Concurrency test: two members mark at once, one time stored. Earned building reward: "Ready", show, mark used.
- [x] 4.7 "Rewards you are earning" shelf under the row; not shown with none.
- [x] 4.8 Level badge on the avatar and the level card; no level content anywhere else. Test that no higher-level text reaches a lower-level page.
- [x] 4.9 Independent review with a fresh context of sections 2 to 4 against `campus-listings`, `outings`, `group-rewards`, `member-levels` and `campus-screen`.
- [ ] 4.10 Founder demo 3: add a café reward for a group of three on a study plan; check in from three accounts, see it unlock, mark it used; open the avatar and read the level card.

## 5. Posting a plan (demo 4)

- [x] 5.1 Tests first, then post a plan: title, start within 14 days, optional end, place and line; poster counted in; "good for" words assigned; three upcoming plans per person.
- [x] 5.2 The plan's one open outing: anyone signed in joins from the screen; "Posted by" first name for signed-in visitors only.
- [x] 5.3 Change and cancel by the poster until it starts; nobody else but the admin; cancelled plans leave the list.
- [x] 5.4 Post form at `/c/[campus]/post`, reached from "Post a plan" in the top bar.
- [ ] 5.5 Founder demo 4: post "Running, 5pm" on one account, join it from a second, check in on both.

## 6. Search (demo 5)

- [x] 6.1 Tests first, then `lib/campus/search.ts`: score by title, host, place and "good for" words; filler words dropped; pull for the viewer; best five with nothing typed; at most four best matches within 60% of the top; looser matches after; the complete CampusGroups view.
- [x] 6.2 The search box, "Best for you" and "All of CampusGroups", the count line, the words to try, the marker in the row, and "Nothing matches". Results update as the person types without leaving the screen.
- [x] 6.3 Test that no reason or score for a ranking appears in the page.
- [ ] 6.4 Founder demo 5: type "exercise", "eat with people" and "tonight" against the real week and judge whether the best matches are the right ones; edit words on the admin page where they are not.

## 7. Front door and the admin gate (demo 6)

- [ ] 7.1 Mockup in `public/demo/` of signing in as the admin: the sign-in, the avatar card with "Admin", and where each of its three links lands. Get the founder's go-ahead.
- [x] 7.2 List every page and action of the current site that leads into groups (`/groups`, `/emba`, `/e/`, `/a/` and any others found), and every route that scheduled jobs and members' assistants use. Put both lists in design.md, D17.
- [x] 7.3 Tests first, then the gate in `proxy.ts`: with `LOOP_FRONT=campus`, the listed pages open for the admin and send everyone else to `/`; with the flag unset, everything behaves as today. The routes for jobs and assistants are untouched in both cases.
- [x] 7.4 The same check on the server in the groups layout and in the groups actions, with a test that walks every page of the current site as a signed-in non-admin and as a signed-out visitor.
- [x] 7.5 Check in the Clerk docs whether a school menu can sit inside its sign-in component; if not, build our own email form that hands off to Clerk. Tests first, then the door at `/` when the flag is on: pitch, sample events, the small sign-in card, the school menu that switches from the typed email (subdomains count) and says so, and the message for an address from no school.
- [x] 7.5a Tests first, then placing a person at the school of their verified email after sign-in (Google included), once; a signed-in person opening `/` goes to their school; an address from no school gets the list of schools; the admin can open any campus.
- [x] 7.5b `/sign-in` for the campus screen; `/groups/sign-in` keeps working and returns each person to the right place.
- [x] 7.6 "Admin" on the avatar card for the admin only, with links to `/c/admin`, the groups site and "How we got here". Group names in the top bar for a person who can open them.
- [x] 7.7 Independent review with a fresh context of sections 5 to 7 against `member-plans`, `campus-search` and `admin-gate`.
- [ ] 7.8 Founder demo 6, on a preview deployment with the flag on: open a group page as a second, non-admin account and land on the campus screen; sign in as the admin and reach the groups site and "How we got here".

## 8. Before the pilot

- [x] 8.1 Update the privacy page: what a check-in records, that people who share a group or have been out together see each other's first name and photo on events, and that "Register me" is kept in Loop only.
- [x] 8.2 Check the screen at 1440 by 900, 1400 by 760 and phone width, closed and opened. Check type on the field colour for contrast.
- [x] 8.3 Full suite green (`--maxWorkers=3`), `tsc --noEmit`, then one production build with no dev server running.
- [ ] 8.4 Founder: choose phone or email sign-in for students in the Clerk dashboard.
- [ ] 8.5 Founder: tell Team 1 that their group pages on the site are going away, then set `LOOP_ADMIN` in the hosting dashboard and deploy (the campus front door is on by default). To undo: set `LOOP_FRONT=groups` and redeploy.
- [ ] 8.6 Walk the whole flow on the deployed site: signed out to reward used, posting a plan, search, and the admin's way in.
- [ ] 8.7 Founder: enter the first three real rewards and send the link to the first three groups.
