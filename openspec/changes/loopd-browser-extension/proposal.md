## Why

Students find events on Luma, Posh, Eventbrite and CampusGroups, not in Loopd. The question they have on those pages is "who do I know that's going?", and only Loopd can answer it. A small Chrome extension that puts a Loopd card on those pages answers it where the student already is, needs nothing from those sites, and is a demo that can be shown in one screen.

## What Changes

- A Chrome extension that, on an event page of Luma, Posh, Eventbrite or CampusGroups, shows one Loopd card on top of the page.
- The card shows the faces and first names of people the student knows who are in, a count of other students going, and "I'm in".
- "I'm in" does what it does in Loopd. If Loopd has not seen the event, pressing it adds the event the same way pasting its link into a plan does today.
- After joining: the group's faces, the share link to copy, Invite (opens Loopd) and Leave.
- Signed out: a count and one button to sign in with a school email. No faces.
- The extension sends Loopd the address of the event page it is on and nothing else, and only on those sites.
- Feed events remember the page they came from, so an event read from a Luma or CampusGroups feed is recognised on its own page.
- Mockup: `public/demo/mockups-six-adds.html`, section 3 (four states).

## Capabilities

### New Capabilities
- `browser-extension`: the card on other sites' event pages, what it shows in each state, what it sends, and how it is connected to a person.

### Modified Capabilities
- `campus-listings`: events imported from feeds also keep the address of their page at the source, used only to recognise the page. The rule that no link out is shown stays.

## Impact

- New folder `extension/` (Manifest V3: manifest, content script, service worker, the card).
- New in the app: `lib/campus/ext.ts`, routes under `app/api/ext/` (look up, I'm in, leave, connect), page `app/ext/connect/page.tsx`.
- Reuses `readPlanLink`, `postPlan`, `imIn`, `leave`, `knownTo`, and `timesOut` from `campus-going-together`.
- Migration: `campus_listing.source_url` for feed events, and `campus_ext_token`. The founder runs it on production.
- Publishing to the Chrome Web Store is the founder's step. The demo runs from the folder, loaded by hand.
