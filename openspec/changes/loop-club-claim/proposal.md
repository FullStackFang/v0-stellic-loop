## Why

"Claim your club" is live as a door (`/organizers`), and the organizer's home is next. The founder stopped the build on one point: "the 'claim your club' should have some sort of approval process no? Not everyone can claim ownership". A club's name is public, so whoever holds it speaks for the club.

A school already keeps the answer. Each registered club has a page on the school's CampusGroups site with its officers on it, the school controls that list, and the page opens without signing in. The founder agreed to use it ("ok this works for me lets implement that") and asked that it be automatic, with a way for the admin to override. He approved the look in `public/demo/mockups-club-claim.html` ("this is fine").

## What Changes

- **A claim page at `/organizers/claim`.** A signed-in person pastes their club's CampusGroups link and presses "Check".
- **Automatic approval.** Loopd reads the club's public officer list. With a school email and their name on the list, the club is theirs at once, with the role the list gives.
- **Review for everyone else.** Someone whose name is not on the list, or who has no school email, is told so and may press "Send for review" with a note. Nothing is kept until they do.
- **The admin's override.** The admin page gains a "Clubs" section: every claim, how it was decided, and the officer list as it was read. The admin can approve, turn down, or take back any claim. The admin's word is not undone by another look at the list.
- **The door.** The sign-up form on the organizers page leads on to the claim page.
- **Nothing opens yet.** An approved claim is a record. The organizer's home will read it when it is built.

## Capabilities

### New Capabilities
- `club-claim`: claiming a club by its CampusGroups link, the automatic check against the officer list, review by the admin, and the admin's override.

### Modified Capabilities
None.

## Impact

- **New:** `lib/campus/club-claim.ts`, `app/organizers/claim/` (page, actions, styles), `lib/__tests__/campus-club-claim.test.ts`, `public/demo/mockups-club-claim.html`.
- **Changed:** `app/c/admin/page.tsx` and `app/c/admin/actions.ts` (the Clubs section), `components/SiteNav.tsx` (the old demo menu stays off every organizers page), `public/demo/mockups-imprint.html` (the door).
- **Database:** one new table, `campus_club_claim`, in `supabase/migrations/20261120300000_campus_club_claim.sql`. The founder runs it by hand before the code is merged.
- **Outside requests:** Loopd's server reads `https://<school>.campusgroups.com/<club>/officers/`, through the existing guarded reader, only when someone presses "Check" or "Send for review".
- **Not touched:** Ink, payments, the bar, the organizers page's own content.
