## 1. Ground and schema

- [x] 1.1 Find out how a first group is created on an empty database (the live one has none). If only an operator can, add a create-group step on `/groups` for a signed-in person, with a test, before anything else.
- [x] 1.2 Write the single migration: `starts_at`, `ends_at`, `place`, `url`, `note` on `emba_team_event`; `emba_event_interest`; `emba_ask`, `emba_ask_option`, `emba_ask_answer`; share-link tokens for events and asks; `emba_team_change` able to point at an event or an ask; join mode on `emba_group_request_link`. Constraints carry the field limits and the end-after-start rule. Answers and interest marks carry a route column (site, share link, assistant and its name), open to more values later.
- [x] 1.3 Run the migration on PGlite in the test harness and confirm the full existing suite still passes.
- [x] 1.4 Founder: apply the migration by hand on `supabase-loop`.

## 2. Events and interest: services

- [x] 2.1 Tests first, then extend `team-events.ts`: save and change an event's date, end, place, link and note; refuse end before start; keep undated events working as labels.
- [x] 2.2 Let an owner or organizer add, change and archive events through an assistant with a read-and-write grant (design D6). Tests: member's assistant refused; brief and announcements still site-only through an assistant.
- [x] 2.3 New `team-interest.ts`: mark and remove interest; one state per member per event; nobody sets it for another; followers refused.
- [x] 2.4 Upcoming-events read: not ended, soonest first, undated last, at most 30, with count and whether the caller is interested; drop events 12 hours past.
- [x] 2.5 Who-is-interested read: handles or "a teammate" to assistants, names on the site, no person identifiers returned.
- [x] 2.6 Non-member view of an event: facts only below five interested, count only at five or more, never names.
- [x] 2.7 Event changes enter the change sequence; interest does not. Extend `whatsNew` and its tests.
- [x] 2.8 Leaving and account deletion remove interest; export lists it. Hook into the existing revoke and deletion paths with tests.

## 3. Events and interest: tools

- [x] 3.1 Add connector tools `events`, `interested` and `add_event` (with change and archive) to the team endpoint, each with a description that says when to use it and a plain-text form. Update the tool-count tests.
- [x] 3.2 Independent review with a fresh context of sections 1 to 3 against the `group-events` spec; fix blockers and majors with tests.

## 4. Events and interest: pages (demo 1)

- [x] 4.1 Group page: an upcoming-events section with date, place, who is interested and an "I'm interested" control, in the existing look.
- [x] 4.2 Organizer controls on the site for the new event fields.
- [x] 4.3 `/e/[token]` share page with member, non-member and signed-out views, a link preview limited to the non-member view, and "Send to WhatsApp" and copy-link controls.
- [x] 4.4 Browser pass at phone and desktop widths, on the local run-through (`npm run groups:browser`, made-up people, disposable database): the Events tab and `/e/[token]` as a member, a non-member and signed out; interest marked from the share page. Fixed: the group handle was unreadable on the dark header; the tabs row showed the default grey scrollbar on a phone.
- [ ] 4.5 Founder demo 1 on the live site: add an event, mark interest from the site and from Claude.

## 5. Open join

- [x] 5.1 Tests first: join mode ask-first (unchanged) and admit-on-sign-in; member role only; removed people not re-admitted; mode not settable through an assistant.
- [x] 5.2 Organizer controls to switch mode and replace the link; share pages offer the join step and return the person to the item.

## 6. Asks: services and tools

- [x] 6.1 Tests first, then new `team-asks.ts`: create an ask of each kind with validation, closing-time bounds and optional event.
- [x] 6.2 Answer, replace and remove an answer; validity per kind; closed asks refuse; closing decided by the database clock at write time; early close by asker or organizer; no reopening.
- [x] 6.3 Results by reveal setting: named and counts; counts hides who chose what from everyone including the asker; reveal fixed after the first answer; non-members get nothing.
- [x] 6.4 Who has not answered: visible to the asker, owners and organizers; others get the count; gone 7 days after close. A test asserts no read or tool returns a view across asks.
- [x] 6.5 Caps: 20 open per group, 5 open per member, option and length limits, counted in the hourly write limit.
- [x] 6.6 Ask created and closed enter the change sequence; answers do not. `whats_new` lists the caller's unanswered open asks and marks those closing within 48 hours; `team_brief` counts open and unanswered asks.
- [x] 6.7 Leaving and deletion: answers to open asks removed, own open asks closed, closed answers kept as "a former member"; export lists own asks and answers.
- [x] 6.8 Add connector tools `ask`, `answer` and `ask_results`, with descriptions, plain-text forms and a ready-to-paste share message in the `ask` reply.

## 7. Asks: pages (demo 2)

- [x] 7.1 Ask form on the group page; list of open and recently closed asks.
- [x] 7.2 `/a/[token]` page: answer in one tap for a signed-in member; question, group and closing time only for anyone else; link preview limited to that.
- [x] 7.3 Asker and organizer view: answered count, who has not answered, and the reminder control whose text names nobody; "Send to WhatsApp" and copy controls.
- [x] 7.4 Browser pass at phone and desktop widths, on the local run-through: the Asks tab and `/a/[token]` as the asker, a member, a non-member and signed out; an answer sent from the share page. Fixed: radio buttons were styled as full-width text boxes, which pushed the option labels aside; the not-answered names are now a compact list that scrolls inside itself.

## 8. Verification

- [x] 8.1 Types, lint on changed files, the full suite, and one production build at the end.
- [x] 8.2 Independent review of the whole diff against the three specs; no open blocker or major.
- [ ] 8.3 Founder demo 2 on the live site: ask from the site and from Claude, send the link to a WhatsApp chat, answer from a second account, see who is missing, send the reminder.
- [ ] 8.4 Pilot comparison with one real group: the same kind of question as a Loop ask and as a WhatsApp poll; record answers within 48 hours for each.
