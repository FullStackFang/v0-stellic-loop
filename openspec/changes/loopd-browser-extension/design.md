## Context

A student can already paste an event page's link into a plan: `readPlanLink` (`lib/campus/plans.ts`) reads the page's title, time and place, and `postPlan` saves the plan with `campus_listing.link`, returning the existing plan when that link is already posted on the campus. The link column is only for plans a person posted; feed events keep a `feed_item_id` and no page address.

A person may have three live plans (`MOST_PLANS`), up to 14 days ahead (`DAYS_AHEAD`), and on some campuses a plan must name a place from the campus list (`PLACES_REQUIRED`).

Who a person may see is decided by `knownTo`. A signed-out visitor sees counts only.

The repo is a Next.js app. There is no browser extension in it and nothing is published by anyone but the founder.

## Goals / Non-Goals

**Goals:**
- One card, four states, on four sites.
- No dependence on those sites' APIs or page structure beyond the page address.
- The same people rule and the same actions as the app.
- Works as a demo loaded from the folder.

**Non-Goals:**
- Registering the student on the other site. That stays theirs to do.
- Reading the page's guest list, or anything else on the page.
- Firefox, Safari or a phone.
- Inviting from the card. Invite opens Loopd.
- Showing the card on pages that are not single event pages.

## Decisions

**D1. The page address is the key.** The content script takes `location.href`, and the server normalises it: lower-case host, drop `www.`, drop the query and the fragment, drop a trailing slash. Lookup is by exact match on the normalised address against `campus_listing.link` and the new `campus_listing.source_url`, within the person's campus. Alternative: read the title and date off the page and match loosely. Rejected: wrong matches would put a person in the wrong event.

**D2. Which pages.** Host patterns in the manifest: `lu.ma`, `luma.com`, `posh.vip`, `eventbrite.com`, and `*.campusgroups.com`. A small table in the extension says which paths are a single event (for example `/e/...` on Posh and Eventbrite). Other pages get no card and send nothing.

**D3. Feed events remember their page.** Add `campus_listing.source_url` (nullable, https only), filled at feed read from the item's own address when the feed gives one. It is used only for D1. The app still shows no link out. Before building, check what each live feed gives as an item address; where it gives none, those events are simply not recognised on their page and "I'm in" falls to D6.

*What the live feeds give (task 1.1, read 2026-11-24).* Two feeds are on, both on Cornell Tech; no Luma feed is live.
- CampusGroups (`cornelltech.campusgroups.com/ical/...`): every item has `URL:https://cornelltech.campusgroups.com/rsvp?id=2132977`. That is not the address a student sees: it redirects through `/ctdei/rsvp?id=…` and `/ctdei/rsvp_boot?id=…` to `/w/_/_/events/Y29ybmVsbHRlY2g6RXZlbnQ6MjEzMjk3Nw==`, which is base64 of `cornelltech:Event:2132977`. The event's identity is in the query (or in the base64), so D1's "drop the query" would merge every CampusGroups event into one. **Change to D1:** a CampusGroups page is keyed by its subdomain and event number, read from any of those four forms, as `https://<sub>.campusgroups.com/rsvp?id=<n>`. The feed's `URL` is stored in the same form.
- Cornell in NYC (`events.cornell.edu`): the feed is empty today, and its site is not one of the four, so nothing to recognise.
- Luma (when a Luma feed is added): an item's address is `https://luma.com/<slug>` or `https://lu.ma/<slug>`; `lu.ma` now sends to `luma.com`. **Change to D1:** `lu.ma` and `luma.com` are one host. Eventbrite's `www.` is dropped as D1 says. Plan links are stored as pasted (`https://lu.ma/x`, `https://www.eventbrite.com/e/x`), so the lookup matches every stored form of the key.

*Pages (task 1.3).* Single-event paths, from real pages:
| Site | Event page | Not an event page |
|---|---|---|
| Luma (`lu.ma`, `luma.com`) | `/<slug>` (one segment) | `/`, `/discover`, `/home`, `/calendar…`, `/user/…`, `/u/…`, `/signin`, `/create`, `/settings`, `/explore`, `/pricing`, `/<city>` hubs are not told apart by path |
| Posh (`posh.vip`) | `/e/<slug>` | everything else |
| Eventbrite (`eventbrite.com`) | `/e/<slug>` | everything else |
| CampusGroups (`*.campusgroups.com`) | `/rsvp?id=<n>`, `/<club>/rsvp?id=<n>`, `/<club>/rsvp_boot?id=<n>`, `…/events/<base64 "<sub>:Event:<n>">` | everything else |

A Luma calendar page has one segment like an event, so it gets a card in state 3. Pressing "I'm in" there reads no event and sends the person to finish in Loopd, which says the page could not be read. Accepted: telling them apart would mean reading the page.

*Chrome MV3 (task 1.2).* Checked against how MV3 works today: content scripts are classic scripts (not modules), listed with host match patterns; a service worker's `fetch` to an origin in `host_permissions` is not held to CORS; `chrome.storage.local` is not readable by pages; `attachShadow({ mode: 'closed' })` in a content script gives the page no `shadowRoot` to read. **Change to D4:** a web page can message an extension through `externally_connectable` only by its extension id, which differs for every unpacked copy. So the connect page does not message the extension directly: the extension has a second, tiny content script on the Loopd origin only, which tells the page it is there and passes the token from the page (same window, same origin, checked) to the service worker. The token is shown to no other site.

**D4. Connecting the extension to a person.** The extension holds its own token, not the site's sign-in cookie. The student opens `/ext/connect` while signed in to Loopd and presses Connect; the page hands a token to the extension (the manifest lists the Loopd origin as allowed to message it), which keeps it in extension storage. Table `campus_ext_token(token_hash, person_id, created_at, last_used_at, revoked_at)`. The account card's "More" lists "Browser extension: connected" with a Disconnect pill. Alternative: let the extension's requests ride the Clerk cookie. Rejected: whether a browser sends that cookie from an extension depends on cookie settings Loopd does not control, and a token can be revoked on its own.

**D5. Requests go through the service worker.** The content script asks the extension's service worker, which calls Loopd with the token. The page being looked at never sees the token or the answer's raw data. The card is drawn in a closed shadow root so the page's styles do not leak in and the page cannot read it.

**D6. An event Loopd has not seen.** "I'm in" calls the same path as pasting a link: `readPlanLink` then `postPlan` with the link, then the person is in its open outing. It is then a posted plan like any other, shown on the campus at once, as pasted links are today. Where the campus requires a place and the page's place matches none on the list, the button instead reads "Finish in Loopd" and opens the posting panel with the link filled in. The plan limits apply and their refusals are shown on the card in the app's words.

**D7. The four states** (as the mockup):
1. People you know are in: headline with the number, their faces and first names (most times out first), a strip with the count of other students, "I'm in" and "Invite".
2. You are in: your face with theirs, the share link with Copy link, "Invite" and "Leave".
3. Nobody you know, or new to Loopd: "Nobody you know yet", the strip says pressing I'm in adds it, one "I'm in".
4. Not connected: "See who you know here", a count when Loopd knows the event, and "Sign in with school email", which opens `/ext/connect`.

A person with a Loopd account and no campus sees state 4 with the app's own no-school wording.

**D8. The API.** `GET /api/ext/event?url=` returns the state and what the card needs; `POST /api/ext/in`, `POST /api/ext/leave`. All take the token as a bearer header, refuse other origins, and answer with no people for an unknown or revoked token. The signed-out count comes from the public count of a listing and is given only for listings that are public by the rule in `campus-public-places` (feed and hand events), never for a posted plan.

**D9. Look.** The card uses the campus card's look, fixed size, never taller than the mockup's tallest state. Its colours follow the person's campus, sent with the lookup. Archivo is not bundled; the system font stack stands in, as on the in-chat card.

**D10. Dismissing.** A small close pill hides the card on that page until the next visit. The toolbar icon brings it back.

## Risks / Trade-offs

- [A site changes its address pattern] → Only the small table in D2 changes; nothing reads page structure.
- [The same event under two addresses (a short link and a long one)] → Not matched; "I'm in" would add a second plan. Accepted for the demo; a later change can follow redirects on the server.
- [Students worry it tracks their browsing] → It runs on four sites, on event pages only, and sends the page address only. The store listing and `/ext/connect` say so in one line each.
- [A token is copied off a machine] → It can do only what the card can: look up, I'm in, leave. Disconnect revokes it.
- [The other site covers or moves the card] → Fixed position in the corner, above the page; the close pill is always reachable.

## Migration Plan

One migration: `campus_listing.source_url` and `campus_ext_token`. Additive. Before it runs, `/ext/connect` says the extension is not set up yet and the API answers state 4 with no count. The founder runs the SQL on production. Publishing to the Chrome Web Store, with its listing text and privacy answers, is the founder's step; a draft of both goes in `extension/STORE.md`.

## Open Questions

- Should an event added from the card wait for the founder's review, as new feed events now do? This design follows the pasted-link rule (no wait). If it should wait, the person who added it still sees it and its share link works.
- Is "Finish in Loopd" acceptable for campuses that require a place, or should the card carry a place picker?
- Luma's and Eventbrite's terms on overlays by extensions have not been read. Worth a look before the store listing.
