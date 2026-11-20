## 1. The claim record and the check

- [x] 1.1 Migration `supabase/migrations/20261120300000_campus_club_claim.sql`: table `campus_club_claim`, unique on person and club page, RLS on, no grants.
- [x] 1.2 `lib/campus/club-claim.ts`: `clubLink`, `readOfficers`, `sameName`, `claimClub`, `askClubReview`, `myClaims`, `clubClaims`, `decideClubClaim`.
- [x] 1.3 `lib/__tests__/campus-club-claim.test.ts`: links taken and refused, the page read, name matching, approval at once, nothing kept when unlisted, no match without a school email, the admin's override standing, unreadable pages.

## 2. The claim page

- [x] 2.1 `app/organizers/claim/page.tsx`, `actions.ts`, `claim.css`: the box, the six answers, "Your clubs", signed-out pills.
- [x] 2.2 `components/SiteNav.tsx`: the old demo menu stays off every organizers page.
- [x] 2.3 A page test: signed out shows no box; each `said` shows its card; a `link` that is not a club page is not shown back.

## 3. The admin's side

- [x] 3.1 `app/c/admin/page.tsx`: the Clubs section and its waiting count.
- [x] 3.2 `app/c/admin/actions.ts`: `decideClubClaimAction`.
- [x] 3.3 A test that the action refuses anyone who is not the admin.

## 4. The door

- [x] 4.1 `public/demo/mockups-imprint.html`: after a saved sign-up in the app, the answer offers "Check you run it" to `/organizers/claim`. Not shown when opened alone.

## 5. Going live

- [x] 5.1 The founder runs the migration on production.
- [x] 5.2 Run the affected tests, `tsc --noEmit` and eslint. (No local production build: the dev server was running; the deploy builds it.)
- [x] 5.3 Commit only this change's files, push, open the PR, merge.
- [ ] 5.4 On the live site: a real claim by a listed officer, one sent for review, and both in the admin's Clubs section. Read a second club's officer page, and one at another school.
