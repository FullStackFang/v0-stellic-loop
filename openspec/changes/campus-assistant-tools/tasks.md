## 1. Database

- [x] 1.1 Add migration `supabase/migrations/<stamp>_campus_assistant.sql`:
  - `campus_interest(listing_id, person_id, created_at)`, primary key on both, cascade on either going;
  - `campus_tap(code text primary key, person_id, action check in ('join','close'), listing_id, outing_id null, expires_at, used_at null, created_at)`;
  - `campus_outing_member.closed_at timestamptz`.
- [x] 1.2 Confirm it applies in the PGlite test database.

## 2. Interest (`lib/campus/interest.ts`)

- [x] 2.1 Tests first: mark, unmark, mark twice; a match between two people who know each other; no match with a stranger; joining removes the mark.
- [x] 2.2 `setInterest`, `myInterests`, `matchedInterest(q, personId, listingIds, known)`; remove the mark inside `imIn`'s transaction.

## 3. The tap (`lib/campus/tap.ts`)

- [x] 3.1 Tests first: made for one person; used once; expired after ten minutes; refused for another person; opening the page uses nothing.
- [x] 3.2 `makeTap(q, personId, action, listingId, outingId)` and `pressTap(db, personId, code, from, now)` (named so the hooks lint rule leaves it alone), the latter running `imIn` or setting `closed_at` in one transaction with marking the code used.
- [x] 3.3 Page `app/c/tap/[code]/page.tsx`: signed in, shows the event and who the person would be with, one Join or Close the loop button, a Not now pill. Acts only on the press. Campus look.

## 4. The tools (`lib/campus/assistant.ts`)

- [x] 4.1 Read how the team server is built (`createTeamMcpServer`, `handleTeamMcpRequest`, `reply`, the card resource) and the MCP SDK's notes on tool results and UI resources in `node_modules/@modelcontextprotocol/sdk` before writing. Confirm which part of a tool result reaches the card and not the model; if none does, D6's card path falls back to the link only, and say so in design.md.
- [x] 4.2 `createCampusMcpServer(db, principal)` with the campus check (D2) and the not-set-up answer.
- [x] 4.3 `find` and `whos_in`, reusing the screen's ranking and people rule. Tests for each scenario, including that a stranger's name never appears in text or data.
- [x] 4.4 `interested`. Tests.
- [x] 4.5 `join` and `close_loop`: with no code, make a tap and return button plus link; with a code, `pressTap`. Tests for every scenario under the two "needs the person's tap" requirements, including that the code is in neither the text nor the structured data.
- [x] 4.6 A test that lists the tools and finds exactly five, and one that the team server's list is unchanged.
- [x] 4.7 Route `app/api/mcp/campus/route.ts` in the shape of `app/api/mcp/team/route.ts`.

## 5. The card (`lib/campus/assistant-card.ts`)

- [x] 5.1 `ui://loop/campus-card-v1.html` in the team card's look: find rows, who's in, the join ask, the close ask, the done state. To match `public/demo/mockups-six-adds.html` section 4.
- [x] 5.2 The team card's tests, copied for this card: nothing loaded or embedded, size cap, light and dark.

## 6. Connecting

- [x] 6.1 On `/groups/connections`, list the campus address as "Going out" under the existing one, only when the tables exist and the person has a campus.
- [ ] 6.2 Confirm on the dev Clerk instance that the existing client and scopes reach the new route. If a dashboard change is needed on production, write the steps for the founder.

## 7. Check and land

- [x] 7.1 Run only the affected tests with `--maxWorkers=3`, then eslint and `tsc --noEmit`.
- [ ] 7.2 Connect the dev address in Claude: find, who's in, interested, join with a tap, join by the link, close the loop. Note what each looked like.
- [x] 7.3 One production build at the end, with the dev server stopped.
- [ ] 7.4 Commit on local main (no push). Paste the migration SQL in the reply for the founder to run.
