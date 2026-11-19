## 1. Mockup and founder decisions

- [x] 1.1 Build `public/demo/mockups-on-you.html` in the campus look: the campus screen with the "On you" list (8 items across 3 groups, one row mid-action, one missed to-do) in two or three placements; the "this is yours" alert with its animation; the screen with nothing waiting; a to-do's own page as the organizer sees it with 20 and with 300 members, including "Extend"; and starting an ask from the campus screen as someone who runs a group; check by screenshot, hand over the page
- [ ] 1.2 Founder picks the placement, the alert and how an ask is started; update design.md, specs and these tasks to match. Picked so far: the placement (C, behind a counter in the top bar). Not yet answered: the alert, the organizer page, the one-line ask

## 2. The to-do kind

- [ ] 2.1 Write failing tests in `lib/__tests__/emba-club-asks.test.ts` for the `done` kind: created with no options, options refused, saved as named whatever is sent, reveal switch refused, marked done, a choice or text refused, taken back, repeat saves nothing, refused after closing, counted and listed as missing (the asker included)
- [ ] 2.2 Add a migration dated after `20261118300000` that: widens the `emba_ask.kind` check to include `done`; replaces `emba_ask_check` so `done` requires zero options; replaces `emba_ask_answer_one_shape` so a `done` answer has no choices and no body; makes `emba_ask_answer_guard` refuse choices or a body on a `done` answer
- [ ] 2.3 `lib/emba/team-asks.ts`: add `done` to `kinds`; a `done` branch in `createAsk` (no options, new refusal `not_for_done`) and in `answerAsk` (no choices, no text, new refusal); reveal forced to named; `setAskReveal` refuses for `done`; make 2.1 pass
- [ ] 2.4 Refusal wording for the new cases in `app/a/actions.ts` and `app/groups/reach-actions.ts`
- [ ] 2.5 Answer links: accept the done answer in `lib/emba/reach-link.ts` and show a Done button on `app/groups/reach/answer/[token]/page.tsx`, with a test

- [ ] 2.6 Extending and reopening any ask: failing tests first (asker, owner and organizer may; a member may not; every kind; open, passed and closed-early asks; an idea's day ask refused; past and too-far times refused; answers kept; change logged; open again in counts, the missing list, reminders and the result message), then an `extendAsk` write in `lib/emba/team-asks.ts`, an "Extend" / "Reopen" control on `app/a/[token]/page.tsx` in place of "It cannot be reopened", and the same through the assistant's `ask` tool; update the wording anywhere that says an ask cannot be reopened

## 3. Wording for the to-do kind

- [ ] 3.1 `app/a/[token]/page.tsx`: Done and take-back buttons, "N of M done", "Who has not done it", no Results options; `askReminder` wording for `done`; update `app/a/share-page.test.tsx`
- [ ] 3.2 `components/emba/ask-parts.tsx`: `yourAnswerText` and `AskRow` wording for `done` (no empty "Your answer:"), and "Something to do" in `AskForm` with no options or reveal fields; check the team and organize pages' tests
- [ ] 3.3 Outbound messages in `lib/emba/reach-send.ts`: new and reminder text for `done`, with tests in `emba-reach-send.test.ts`
- [ ] 3.4 Assistant replies in `lib/emba/team-format.ts`: the kind's words, "done" in place of "answered:", and how to mark it done; `ask` and `answer` tool descriptions and schemas in `lib/emba/team-mcp.ts`; update `emba-team-mcp.test.ts`
- [ ] 3.5 In-chat card in `lib/emba/team-card.ts`: a Done button and done state for `done`, no option picks; update `emba-card.test.ts`
- [ ] 3.6 Add a to-do to `scripts/emba-seed.ts` and update `emba-seed.test.ts`

## 4. The "On you" read

- [ ] 4.1 Write failing tests in `lib/__tests__/emba-waiting.test.ts` for `onYou`: asks, events and ideas only; ordered by time across kinds with undated ideas last; the 30 soonest even when one group has more than 10 of a kind; per-group "more" that does not count mentions or announcements; nothing written to `emba_waiting_shown`; nothing for a follower; a to-do missed in the last 7 days listed as missed after the open items, not when done, not after 7 days, and as an ordinary row once extended; claims proposed for the viewer returned beside the rows, oldest first; `waiting()` unchanged
- [ ] 4.2 Give `teamWaiting` parameters for which kinds to read and how many; implement `onYou` on it, reading groups a few at a time, with events read through one function (design D11); make 4.1 pass

## 5. Opening the pages the list links to

- [ ] 5.1 Access follows membership (design D12): tests that a signed-in member of the ask's group can open `/a/<token>` and the emailed answer page and act there with `LOOP_FRONT` unset, and that a non-member still gets only the outside view; then change `proxy.ts`, `closedUnlessAdmin` use on those two pages, and the principal used by `app/a/actions.ts`

## 6. The list on the campus screen

- [ ] 6.1 Write failing tests for the list as its own component (a new test file beside `app/c/campus-screen.test.tsx`): rows show label, what, group and when; nothing drawn when nothing waits or signed out; nothing from an open group the viewer has not joined; Done, option and I'm in / Not for me buttons write and the row leaves; a closed ask reports closed; a capped write reports the cap and the row stays; long asks link out; a missed row has no button; the alert shows a proposed claim, "It's mine" and "Not mine" write and the alert goes, and it has no animation with motion reduced
- [ ] 6.2 Server actions for the row buttons in the campus actions file, using the campus viewer's principal, calling the existing ask and interest writes with route `site` and revalidating the campus screen
- [ ] 6.3 The list as a server component with its styles, rendered inside a Suspense boundary and passed to `CampusScreen` as a slot (as `signOut` is), behind the "On you" counter in the top bar (design D4); make 6.1 pass. Do this after the other session's uncommitted work on `components/campus/screen.tsx` is committed

- [ ] 6.6 The week's row of events shows whole tickets only and snaps when scrolled, with the filter pills on the "+" line (design D4); test that no ticket is cut at the common widths
- [ ] 6.4 Starting an ask from the campus screen: failing tests first (a non-admin organizer posts a to-do; a viewer with two groups chooses one; a follower is not offered it; refusals are worded), then the control and form (reusing `AskForm`'s fields) with a campus action calling `createAsk` with the campus viewer's principal, placed as picked in 1.2
- [ ] 6.5 Test that a non-admin owner or organizer sees the missing list, reminder, extend and close on their group's ask page with `LOOP_FRONT` unset

## 7. Verify

- [ ] 7.1 `tsc --noEmit` and the full vitest suite with `--maxWorkers=3`, stderr captured to a file
- [ ] 7.2 Run the app against the test world as a non-admin member and walk the flow by hand: a to-do posted, seen on the list, ticked, the organizer's count changes, a long ask's link opens
- [ ] 7.3 One production build at the end, with no dev server running
- [ ] 7.4 Founder applies the migration from 2.2 to production, then deploys
