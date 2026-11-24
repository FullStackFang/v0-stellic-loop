## 1. Database

- [ ] 1.1 Migration `supabase/migrations/<ts>_campus_intents.sql` (additive, safe to run twice): `campus_intent`, `campus_intent_tag`, `campus_intent_member`, `campus_intent_proposal` (unique intent_id+listing_id, outing_id, matched), `campus_proposal_answer`, `campus_ask` (unique proposal_id+person_id), indexes; rollback note at the top
- [ ] 1.2 `intentsReady(db)` guard (as `reviewReady`), so code falls back to today's posting before the founder runs the SQL
- [ ] 1.3 Paste the SQL in the reply for the founder to run

## 2. Matching keys (design D6)

- [ ] 2.1 Test first: `activityKeys(text, tags)` in `lib/campus/words.ts` — "Run the island @running" → run; "Saturday 5K at Southpoint" → run; "Startup social" → none; jogging = running
- [ ] 2.2 Implement `activityKeys` from `SAME` + the first word of matching `TABLE` rows, with the broad-word list excluded

## 3. Intents (lib/campus/intents.ts)

- [ ] 3.1 Tests: post intent (poster in, no poster shown, empty refused, ten-open limit), join, leave, last leave closes, close-intent offer picks the one with most people sharing a key
- [ ] 3.2 `postIntent`, `joinIntent`, `leaveIntent`, `closeIntentFor(line)`, `intentsOn(campus, viewer)`, `intentPage(id, viewer)`
- [ ] 3.3 Search: intents found through title and tags in the existing campus search

## 4. Proposals

- [ ] 4.1 Tests: propose needs day+time+place, only members, 14 days, three-plan limit counts proposals, several per intent, proposer going, no poster in the page model, proposer and admin can cancel
- [ ] 4.2 `propose(intentId, {day,time,place})` in one transaction: `postPlan` with time required → proposal row with the plan's outing → `campus_ask` rows for every other member
- [ ] 4.3 `answer(proposalId, 'going'|'cant')`: Going joins the proposal's outing (not `imInWith`'s pick), Can't leaves it and records; `ON_AT = 2`
- [ ] 4.4 Line posting (D7): line with time+place → intent + first proposal; with one → intent and Propose prefilled; with neither → intent
- [ ] 4.5 Stop new `time_open` plans in `postPlan` (D8); leave old plans and `campus_time_pick` code untouched

## 5. Matched events

- [ ] 5.1 Tests: shown + place + 1h..14d + shared key → proposal marked with source, asks made; waiting event skipped until shown; broad words skipped; one matched per intent per 24h; same event once; new intent matched against upcoming events
- [ ] 5.2 `matchEvents(campusId, {listingIds?|intentId?})`: makes the intent's own outing on the event and the proposal row
- [ ] 5.3 Call it after `readFeeds`, after admin shows a waiting event, after a link plan posts, after `postIntent`

## 6. The ask email

- [ ] 6.1 Tests (copy `lib/when/outbox` tests' shape): claim, send once, retry up to four, stale skip, switch off sends nothing, late joiner gets no email
- [ ] 6.2 `drainAsks` + email (intent, day, time, place, signed Going/Can't/Leave links, no proposer name) through `lib/email/resend.ts`; `CAMPUS_ASKS_SENDING` switch
- [ ] 6.3 Route `/api/cron/campus-asks` every 15 minutes in `vercel.json`; link handlers for Going / Can't / Leave from email

## 7. Screens (look as `public/demo/mockups-intent-propose.html`)

- [ ] 7.1 "+" panel → "What do you want to do?" with the close-intent offer
- [ ] 7.2 Intent rows on the campus page; intent details with proposals, Going/Can't, "on at 2" / "It's on", Propose box (Send off until day+time+place)
- [ ] 7.3 Ask cards above the list
- [ ] 7.4 Intent page `/c/[campus]/i/[id]` (share link; signed out sees title + count + sign in)
- [ ] 7.5 Proposal stamps without a face; remove "Posted by" and "<poster> set it" for proposals; source mark on matched proposals
- [ ] 7.6 Check every clickable is a pill, no floating labels, phone and laptop widths

## 8. Verify and land

- [ ] 8.1 Run only the affected tests (`--maxWorkers=3`), `tsc --noEmit`
- [ ] 8.2 Drive it in the local browser: post, join from a second account, propose, answer, a matched feed event
- [ ] 8.3 One production build at the end (no dev server running), commit on local main with `git commit -- <paths>`
