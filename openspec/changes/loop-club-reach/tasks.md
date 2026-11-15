## 1. Before building

- [ ] 1.1 Re-read this change against what demo 2 of `loop-club-events-and-asks` showed, and against the throwaway card prototype's findings if it ran (design D2b). Revise the specs first where they no longer fit. Done against the built code of the previous change only (design.md, "Found while building"): its demo 2 has not been run and no prototype findings were available. Left open until the founder has run demo 2.
- [x] 1.2 Read the current in-chat interface specification, SDK documentation and each supported assistant's documentation; write the summary to `notes.md` in this change and record any conflict with design.md. Conflicts are listed at the top of `notes.md` and settled in design.md, "Found while building".
- [ ] 1.3 Founder: approve the in-chat interface package as a dependency. The current package (2.x) does not work with the installed MCP SDK. Proposed instead: no package, a hand-written bridge in the card page (`notes.md`, "The bridge"). Needs the founder's yes to that, or to the 1.x package. On 2026-11-14 the founder answered "continue" to that recommendation; the card was built with the hand-written bridge and no package. Left unchecked until the founder says yes in words.
- [ ] 1.4 Founder: start the email sending domain and the Meta business account, number and message templates, since both have lead time.
- [x] 1.5 Write the single migration: per-member waiting state, reach preferences, linked WhatsApp numbers and opt-ins, personal link records, message log on the outbox, the connector request log, and the route column on answers and interest if not already present. Run it on PGlite with the full suite. `supabase/migrations/20261114000000_emba_club_reach.sql`; full suite 745 passed, 30 skipped.
- [ ] 1.6 Founder: apply the migration by hand on `supabase-loop`.

## 2. Waiting

- [x] 2.1 Tests first, then the cross-group waiting read: unanswered asks, unacted events, mentions, unshown announcements; at most 10; only granted groups.
- [x] 2.2 Per-member waiting state: answer, interest, decline and shown-once each clear the right item for that member only.
- [x] 2.3 Add the `waiting` tool and a decline action for events; put the check-once wording in the server instructions and tool description, in one place. The wording is `CHECK_ONCE` in `lib/emba/team-mcp.ts`; the decline is `notForMe` on `interested`.
- [x] 2.4 Give the team connector a session identifier and record host name and version at connect (design D8). The identifier goes out in the `Mcp-Session-Id` header; the connector stays stateless.
- [x] 2.5 Connector request log: time, member, host, session, tool, model or card, first call in session; no arguments or results. Test that written answers never reach the log. `lib/emba/connector-log.ts`, tested in `lib/__tests__/emba-waiting-mcp.test.ts`.

## 3. The card (demo 1)

- [x] 3.1 Build the one self-contained card page using the standard keys and bridge only; text and structured forms stay complete on every result. `lib/emba/team-card.ts`, declared in `lib/emba/team-mcp.ts`.
- [x] 3.2 Make `answer` and `interested` callable by the model and by the card through the same checks; card updates in place after a write.
- [x] 3.3 Theme following, loading, error and empty states; member text escaped. Tests for escaping and for a closed ask tapped from a stale card. `lib/__tests__/emba-card.test.ts`.
- [ ] 3.4 Test against the extension's example host and the MCP Inspector, then Claude web and desktop, ChatGPT, and a host with no card support. Record differences in `compat.md`. `compat.md` is started from the documents. No real assistant, example host or Inspector has been run yet: each needs a deployment and an account.
- [x] 3.5 Independent review with a fresh context of sections 2 and 3 against the `waiting` spec. No blocker; its three major findings were fixed (design.md, "After the independent review of sections 2 and 3").
- [ ] 3.6 Founder demo 1: ask an unrelated question in Claude and see the card with what is waiting; answer by tap and by text.

## 4. Reach preferences

- [x] 4.1 Tests first, then the per-group choice with its default, the join-page line and control, and the preferences page. The page is `/groups/reach` ("Reach" in the side menu). WhatsApp is not offered on a join form; it starts from the Reach page (section 7).
- [x] 4.2 One-tap stop link that needs no sign-in and affects one group. `/groups/reach/stop/<token>`: opening it writes nothing, its one button stops the group.
- [x] 4.3 Leaving and deletion remove choices and cancel scheduled messages; export lists choices.

## 5. Outbound messages and email (demo 2)

- [ ] 5.1 Founder: choose and approve the email provider from the Vercel Marketplace.
- [x] 5.2 Tests first, then the four message kinds queued through the outbox, respecting each member's choice. `lib/emba/reach-send.ts`, `lib/__tests__/emba-reach-send.test.ts`.
- [x] 5.3 Reminder timing, skip-if-answered, no reminder after close; limits and quiet hours; held items stay waiting.
- [x] 5.4 Personal answer links: signed per member and ask, no write on a plain request, expiry rules, no session. `lib/emba/reach-link.ts`, page `/groups/reach/answer/<token>`.
- [x] 5.5 Scheduled route every 15 minutes; retries; never doubled; the sending switch, off by default. `/api/cron/reach`; the switch is `LOOP_REACH_SENDING=on`.
- [x] 5.6 Email templates with a plain-text part, answer link and stop link. Test that no message names another member. The templates are built and tested; nothing can send until 5.1 gives `lib/emba/reach-email.ts` a provider.
- [ ] 5.7 Founder demo 2: create an ask, receive the email on a second account, answer from the personal link, see no reminder arrive.

## 6. Organizer view and pilot numbers

- [x] 6.1 Organizer page: interest by day per event, answers against expected per ask, announce with "send to members". Test that it has no per-member row. `/groups/<group>/organize`. An announcement cannot be tied to one event (design.md, "Found while building sections 4 and 5").
- [x] 6.2 Operator metrics page and CSV: check-first rate per host, connecting funnel, answers within 48 hours by route, median time to close; aggregate only; operator sign-in. `/groups/metrics`, for the sign-in subjects listed in `LOOP_OPERATOR_SUBJECTS`.
- [ ] 6.3 Rewrite `/groups/connections` as a plain guide for Claude and ChatGPT with plan requirements and a picture per step. Only the funnel's "opened the connect page" count is added so far. The rewrite waits for the pictures, which need a real account in each assistant.

## 7. WhatsApp from Loop's number (demo 3, separable)

- [x] 7.1 Re-read Meta's current rules on templates, opt-in, pricing and reply buttons; record them in `notes.md`. Stop and ask the founder if they differ from design D7. They differ on three points (`notes.md`, "Where design D7 differs"): reply buttons with an ask's own options, what counts as opt-in, and announcements to US numbers. Stopped here for the founder; 7.2 to 7.5 are not started.
- [ ] 7.2 Opt-in by the member's own message; link one number to one member; "stop" by message.
- [ ] 7.3 Template sends for new ask, reminder and announcement; reply buttons for pick-one asks of up to three options; personal link otherwise.
- [ ] 7.4 Inbound webhook with signature check; a button tap records the answer and confirms in the chat.
- [ ] 7.5 Founder demo 3: opt in, receive an ask on WhatsApp, answer with a button.

## 8. Verification

- [ ] 8.1 Types, lint on changed files, the full suite, and one production build at the end. On 2026-11-14, for sections 2, 4, 5 and 6: types and lint clean, full suite 771 passed and 30 skipped. The production build was not run: a dev server for another project was running. After section 3 was built, the same day: types and lint clean, full suite 806 passed and 30 skipped (the count includes another change's tests in the same working tree); the build is still not run, for the same reason. Section 7 is not built.
- [ ] 8.2 Independent review of the whole diff against the five specs; no open blocker or major. Done once for sections 2, 4, 5 and 6 (design.md, "After the independent review"): its findings in the sending loop were fixed, and five points are left for the founder. To be repeated when sections 3 and 7 exist.
- [ ] 8.3 Scripted check on each supported assistant: a fixed set of questions with Loop connected, recording whether it called `waiting` first. Put the result beside the logged rate.
- [ ] 8.4 With one real organizer: turn sending on, run two asks, and record answers within 48 hours by route and whether the organizer sent any reminder by hand.
