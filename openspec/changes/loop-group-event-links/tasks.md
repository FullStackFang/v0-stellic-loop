## 1. Database

- [x] 1.1 Write `supabase/migrations/20261118000000_emba_event_links.sql`: on `emba_team_event` add `source` (`'link'`/`'feed'`/null), `source_follow`, `source_read_at`, `source_gone_at`, and the partial unique index on `(org_id, loop_id, url)` for live linked events (design D1); create `emba_team_feed` and `emba_team_nearby` (D7) with row level security on and no grants to `anon` or `authenticated`
- [x] 1.2 Add the migration to the test database setup; schema test for the unique link index, the feed cap column checks, and the nearby `(feed, item)` uniqueness

## 2. Reading a page

- [x] 2.1 Save one real page each from Luma, Posh and Eventbrite as test fixtures (outside any code directory that is imported); confirm Eventbrite carries usable event data, and drop it from the list if not
- [x] 2.2 Tests first for `lib/guarded-fetch.ts` (D4): https only, no cookies, size and time limits, redirect count, link mode refuses a hop off the list, feed mode refuses loopback, private, link-local and unique-local addresses on every hop
- [x] 2.3 Implement `lib/guarded-fetch.ts`
- [x] 2.4 Tests first for `lib/emba/event-link.ts` against the fixtures: Luma and Posh yield name, start, end, place, host; a page without an event yields "cannot read"; an unlisted host is never fetched; query and fragment are dropped from the stored link; over-long and control-character text is cut to the column limits
- [x] 2.5 Implement `readEventPage` with one reader per site (D3)

## 3. Adding by link

- [x] 3.1 Tests first (`lib/__tests__/emba-event-links.test.ts`): a member adds by link and is interested; a follower is refused; an unreadable link saves nothing until name and start are given; the same link twice resolves to one event and marks interest; the per-member limit of 10 and the group limit of 50; `whats_new` reports the new event; an assistant's add is named in the change log
- [x] 3.2 `linkEvent` in `lib/emba/team-events.ts` with `need:'post'` (D2): tag from the name with a suffix when taken, caps, insert, interest mark, `event_added`
- [x] 3.3 Tests first, then `unlinkEvent`: the adder removes it while nobody else is interested; refused once another member is; a removed link can be added again (D5)
- [x] 3.4 `change` in `team-events.ts` turns `source_follow` off when an owner or organizer changes name, start, end or place of a sourced event; test
- [x] 3.5 Existing `emba-team-*` event and interest suites pass unchanged

## 4. Daily re-read

- [x] 4.1 Tests first: a moved start changes the event, logs `event_changed`, and moves sent invites; a missing or cancelled page sets the label and archives nothing; an unparseable page changes nothing; a hand-changed event is skipped; at most 200 per run, oldest read first
- [x] 4.2 `rereadLinkedEvents` in `lib/emba/event-link.ts` or beside it, called from `app/api/cron/daily/route.ts` after the existing work, with its own try/catch so the existing job cannot fail because of it (D6)
- [x] 4.3 Show "No longer listed at the source" wherever an event's facts are shown: `EventView`, `team-format.ts`, the team page, the share page

## 5. Nearby

- [x] 5.1 Tests first (`lib/__tests__/emba-nearby.test.ts`): feed add, on/off and "Read now" for owner and organizer only, never an assistant; the cap of 10; `webcal:` taken as https; a first read lists items in the next 14 days; a changed item updates; a removed or cancelled item leaves the list; one failing feed does not stop another and records its result; a non-calendar response adds nothing
- [x] 5.2 `lib/emba/team-nearby.ts`: `addFeed`, `setFeedOn`, `teamFeeds`, `readTeamFeeds` using `parseFeed` from `lib/campus/import.ts` and the guarded fetch in feed mode, `nearby` (soonest 30) (D7, D9)
- [x] 5.3 Tests first, then promotion: interest in a nearby item makes one group event with `source='feed'`, marks the member, removes the item from the list, applies the link limits; two members at once end with one event and two marks
- [x] 5.4 Tests first, then following: the hourly read applies a changed start, end or place to a promoted event as a logged change; an item gone from the feed labels the event and keeps it; a feed turned off drops its nearby items and keeps promoted events
- [x] 5.5 Tests first, then matching (D8): a link whose name and start match a nearby item promotes that item with the link; a feed item matching a linked event is not listed
- [x] 5.6 Tests: nearby items never appear in `whats_new` or `waiting` and do not count toward the 50 upcoming events; a person outside the group cannot read the list
- [x] 5.7 `app/api/cron/team-feeds/route.ts` on the pattern of `campus-feeds`, and its hourly entry in `vercel.json`

## 6. Connector

- [x] 6.1 Tests first in the team MCP suite: `link_event` with a link, with a nearby code, with supplied name and start; refused without a read-and-write grant; `whats_on` lists Nearby with codes; text read from pages is under the untrusted marking
- [x] 6.2 Register `link_event` in `lib/emba/team-mcp.ts`, add it to `TEAM_TOOLS`, and format its replies and the Nearby section in `lib/emba/team-format.ts`

## 7. Site

- [x] 7.1 Server actions in `app/groups/team-actions.ts`: link an event, take one back, mark interest in a nearby item, and the feed actions; each answers in plain words when refused
- [x] 7.2 Team page events tab (`app/groups/[namespace]/team/`): the paste box for members who can post, with name and start fields when the page cannot be read; the Nearby section; the Feeds block for owners and organizers with last result and "Read now" (D10)
- [x] 7.3 Styles in `app/groups/groups.css` in the existing look
- [x] 7.4 Page tests: a posting member sees the paste box and a follower does not; Nearby shows with a feed and is absent without one; only owners and organizers see Feeds; a taken-back event leaves the list

## 8. Verify and ship

- [x] 8.1 `tsc --noEmit` and the full suite green (`--maxWorkers=3`)
- [x] 8.2 Drive it in a browser against a hosted test database as two members and an organizer: add a real Luma link and a real Posh link, paste one twice, add a feed and promote a nearby item, take a link back; screenshots (Done 2026-11-18 in the local browser run-through, `npm run groups:browser` on a disposable database, not a hosted one: a member added a real Luma and a real Posh link, an organizer pasted one again, added the Cornell events feed, a member made a nearby item an event and removed it, and added a Partiful link by hand. Screenshots in `.playwright-mcp/event-links-*.png`.)
- [ ] 8.3 One production build at the end (after section 9)
- [ ] 8.4 Founder: apply the migration by hand on the hosted Supabase project before any deploy
- [ ] 8.5 Founder: choose the first feeds for the EMBA cohort and add them on the group's page

## 9. Campus: a plan from a link (added 2026-11-18, design D11)

- [x] 9.1 Migration `20261118100000_campus_listing_link.sql`: `campus_listing.link`, only on a posted plan
- [x] 9.2 `lib/campus/plans.ts`: `readPlanLink` (reads a page into form values, saves nothing) and `postPlan` with a link (same link on a campus counts the person in); tests first in `lib/__tests__/campus-plan-links.test.ts`
- [x] 9.3 `readPlanLinkAction` in `app/c/actions.ts`, signed-in and own campus only; the post form sends the kept link
- [x] 9.4 The post form (`components/campus/plan-form.tsx`): link box with "Fill in", the kept link with "Remove link", what was typed stays when a page cannot be read; styles in `app/c/campus.css`
- [x] 9.5 The plan details on This week link to the event page
- [x] 9.6 Page tests in `app/c/plan-link.test.tsx`; `tsc --noEmit` and the full suite green
- [ ] 9.7 Drive the real form in a browser against a database that has the migration (only its look was checked, on a static copy with the real stylesheet)
- [ ] 9.8 Founder: apply `20261118100000_campus_listing_link.sql` by hand before running or deploying this code: This week reads the new column

## 10. Campus: posting in one line with @places (added 2026-11-18, design D12; founder picked direction A)

- [x] 10.1 Mockup `public/demo/mockups-campus-post.html` with three directions; founder picked A
- [x] 10.2 `lib/campus/line.ts`: read what, when and the @place out of a typed line; tests first in `lib/__tests__/campus-line.test.ts`
- [x] 10.3 Migration `20261118300000_campus_tag.sql`: `campus_tag` and `campus_listing.tag_id`
- [x] 10.4 `lib/campus/tags.ts` (places in use, busiest first, known first names only) and `postPlan` with a tag; tests in `lib/__tests__/campus-tags.test.ts`
- [x] 10.5 `postLineAction` in `app/c/actions.ts`: the server reads the line itself
- [x] 10.6 `components/campus/composer.tsx` on the post page; the form stays for changing a plan; styles in `app/c/campus.css`
- [x] 10.7 This week shows a plan's @place and finds it by the place's name
- [x] 10.8 Page tests in `app/c/plan-link.test.tsx`; `tsc --noEmit` clean
- [x] 10.9 Full suite green after this section
- [ ] 10.10 Drive the real page in a browser against a database that has the migrations; its look has only been checked as the mockup
- [ ] 10.11 Founder: apply `20261118300000_campus_tag.sql` by hand before running or deploying this code: This week reads the new column

## 11. Campus: posting lives on This week behind a "+" in the line above the row (added 2026-11-18, design D13; founder asked for a small "+" opening the panel of B)

- [x] 11.1 Mockup `public/demo/mockups-campus-plus.html` with three directions, then the picked combination drawn with the built styles
- [x] 11.2 `Screen.places` in the screen model, read for a signed-in viewer
- [x] 11.3 The "+" and the posting panel in `components/campus/screen.tsx`; the composer in two columns; "Post a plan" leaves the top bar
- [x] 11.4 `/c/<campus>/post` without a plan leads to This week; with `?plan=` it is still the form to change one
- [x] 11.5 Tests in `app/c/plan-link.test.tsx` and `app/c/campus-screen.test.tsx`; `tsc --noEmit` clean
- [x] 11.6 Full suite green after this section (1237 passed, 31 skipped)
- [ ] 11.7 Drive the real screen in a browser against a database that has the migrations (same blocker as 10.10)
