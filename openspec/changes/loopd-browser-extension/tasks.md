## 1. Find out first

- [x] 1.1 For each live feed (CampusGroups, Luma), look at what an item gives as its own address and whether it equals the address a student sees in the browser. Write the answer in design.md under D3.
- [x] 1.2 Read Chrome's current Manifest V3 docs for: content scripts and host patterns, service worker fetch with host permissions, `externally_connectable` messaging from a web page, and closed shadow roots in content scripts. Note anything that changes D4 or D5.
- [x] 1.3 List the single-event path patterns for the four sites from real pages (D2).

## 2. Database

- [x] 2.1 Add migration `supabase/migrations/<stamp>_campus_ext.sql`: `campus_listing.source_url text` (https only, 9 to 2000 characters) with an index on `(campus_id, source_url)`; table `campus_ext_token(token_hash text primary key, person_id, created_at, last_used_at, revoked_at)`.
- [x] 2.2 Confirm it applies in the PGlite test database.
- [x] 2.3 Fill `source_url` at feed read (`lib/campus/` feed import) when the item gives an https address. Tests for the three scenarios of "A feed event keeps the address of its page".

## 3. Server (`lib/campus/ext.ts`, `app/api/ext/`)

- [x] 3.1 `normalPage(url)` with tests: host case, `www.`, query, fragment, trailing slash, a non-https address refused, a host not on the list refused.
- [x] 3.2 Tokens: `connectExt(q, personId)` returning the token once and storing its hash; `personOfToken`; `revokeExt`. Tests.
- [x] 3.3 `lookUp(db, person | null, url, now)` returning one of the four states with only what the card draws. Reuse `knownTo`, `timesOut`, `outingsOn` and the screen's face reading. Tests per state, including: no stranger's name or face in any state; no count for a posted plan when not connected.
- [x] 3.4 `inFromPage(db, person, url, now)`: recognised event → `imIn`; else `readPlanLink` + `postPlan` + join its open outing; place required and unmatched → `{ finishAt }`. Tests: joins friends; two people at once make one plan; plan limit refused in the app's words; finish-in-Loopd.
- [x] 3.5 Routes `GET /api/ext/event`, `POST /api/ext/in`, `POST /api/ext/leave`: bearer token, other origins refused, not-set-up answer before the migration. Route tests.
- [x] 3.6 Page `app/ext/connect/page.tsx` (campus look): one line on what the extension sends, a Connect button that hands the token to the extension, and the connected state. In the account card's More: "Browser extension" with a Disconnect pill. Tests. *(Built: More holds a "Browser extension" link to `/ext/connect`, and the Disconnect pill is on that page, so the card does not read token state. "Finish in Loopd" opens `/c/<campus>?post=<link>`, which opens the posting panel and reads the link.)*

## 4. The extension (`extension/`)

- [x] 4.1 `manifest.json` (MV3): the four sites as host patterns, the Loopd origin as host permission and as allowed to message the extension, a service worker, one content script, the toolbar button.
- [x] 4.2 Content script: decide whether the page is a single event (the table from 1.3); if so, ask the service worker to look up `location.href`; draw the card in a closed shadow root; handle address changes on sites that swap pages without a reload.
- [x] 4.3 Service worker: holds the token in extension storage, receives it from `/ext/connect`, makes the three calls.
- [x] 4.4 The card: the four states of D7 to match `public/demo/mockups-six-adds.html` section 3. Fixed width, fixed position, close pill, campus colours from the lookup, system font stack. Every control a pill.
- [x] 4.5 Unit tests for the page-pattern table and the card's rendering of each state from a sample answer (run with the repo's vitest).
- [x] 4.6 `extension/README.md`: how to load it from the folder for the demo. `extension/STORE.md`: draft listing text and privacy answers for the founder.

## 5. Check and land

- [x] 5.1 Run only the affected tests with `--maxWorkers=3`, then eslint and `tsc --noEmit`.
- [ ] 5.2 *(Waits on the migration and a real Chrome: the API answers state 4 with no count until the SQL is run.)* Load the extension from the folder against the dev server. On one real page of each of the four sites, walk the four states and note what happened for each.
- [ ] 5.3 With the browser's network panel open, confirm the only thing sent is the page address and the token, and only on event pages.
- [ ] 5.4 *(Not run: the dev server on :3000 was up, and it is not mine to stop.)* One production build at the end, with the dev server stopped, since app routes ship.
- [x] 5.5 Commit on local main (no push). Paste the migration SQL in the reply for the founder to run.
- [ ] 5.6 (Founder) Publish to the Chrome Web Store from `extension/STORE.md`, if and when wanted.
