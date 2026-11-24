# Chrome Web Store listing (draft, for the founder)

Publishing is the founder's step. Nothing here has been submitted.

## Before submitting

- Icons: the store needs a 128×128 icon (and the manifest should list 16, 48 and 128). None are in the folder yet.
- Screenshots: 1280×800, at least one. The four states of `public/demo/mockups-six-adds.html` section 3, on real pages.
- Remove `http://localhost:3000/*` from `host_permissions` and from the connect content script's `matches` in `manifest.json` for the store build.
- Luma's and Eventbrite's terms on extensions that draw over their pages have not been read (design, Open Questions).

## Listing

**Name:** Loopd

**Short description (132 characters at most):**
See who you know is going, right on Luma, Posh, Eventbrite and CampusGroups event pages. Say I'm in and go together.

**Description:**
Found an event on Luma, Posh, Eventbrite or CampusGroups? Loopd shows you, on the event page itself, which people you know from your school are going, and how many other students are.

- Press I'm in to join the group of people you know, the same as in Loopd.
- Copy the group's link, or open Loopd to invite people.
- New event? I'm in adds it to your campus's list in Loopd.

Loopd never registers you on the other site, and never reads the page. It runs only on single event pages of those four sites, and the only thing it sends Loopd is the address of the page you are on.

Needs a Loopd account with a school email.

**Category:** Social & Communication

## Privacy answers

**Single purpose:** Show, on event pages of Luma, Posh, Eventbrite and CampusGroups, which people the user knows on Loopd are going, and let them join.

**Permissions, and why:**
- `storage`: keeps the extension's own Loopd token on this computer.
- Host access to `lu.ma`, `luma.com`, `posh.vip`, `eventbrite.com` and `*.campusgroups.com`: to draw the card on their event pages.
- Host access to `getloopdin.social`: to ask Loopd about the event page, and to receive the token when the user presses Connect.

**Remote code:** No. All code is in the package.

**Data collected (Chrome's form):**
- Web history: **yes, limited**: the address of the event page the user is on, only on single event pages of the four sites, sent to Loopd to look the event up. It is not stored by the lookup.
- Authentication information: **yes**: the extension's own token, issued by Loopd, kept in extension storage. It can only look up an event, say I'm in, and leave.
- Personally identifiable information, health, financial, personal communications, location, user activity, website content: **no**.

**Certifications:** Data is not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy URL:** https://www.getloopdin.social/privacy (should gain one paragraph on the extension before submitting).
