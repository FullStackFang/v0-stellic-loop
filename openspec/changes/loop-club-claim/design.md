## Context

- The door is live: the "Claim your club" pill, the organizers page at `/organizers`, and a sign-up form that saves a club name and email to `campus_club_ask`. That table is a list of interest; it proves nothing about who runs a club.
- Cornell requires registered clubs to re-register on CampusGroups each year, and officer changes go through Campus Activities. One club's officer page (`cornell.campusgroups.com/ACLU/officers/`) was read signed out on 2026-11-20: no login wall, each officer's name and role in the page.
- Loopd already reads outside pages safely with `guardedFetch` (`lib/guarded-fetch.ts`): a list of allowed hosts, no private addresses, limits on time, size and redirects.
- A signed-in person has a name (`person.name`), and their sign-in carries a verified email. A campus lists its email domains (`campus.domains`).
- The admin page (`app/c/admin`) is sections of rows with small forms, and already has a Review queue for people with no school email.

## Goals / Non-Goals

**Goals:**
- An officer of a registered club gets the club with no wait and no work for the admin.
- Nobody else gets a club without the admin's yes.
- The admin can see why each claim stands, and reverse any of them.

**Non-Goals:**
- What a claimed club can do. That is the organizer's home (slice 2).
- Clubs that are not on a CampusGroups site. They start a private group, as today.
- Schools on another system. Their claims go to review once such a link can be pasted; for now the link is refused.
- Keeping claims in step with the list over time (see Open Questions).

## Decisions

### D1. The officer list is the proof, matched by name
The page gives names and roles, not emails. A claim is approved when the person's name and an officer's name have the same first and last word, ignoring case, accents, apostrophes and hyphens. Middle names are ignored ("Ana María López" matches "Ana Lopez"). A one-word name never matches.

- *Why not a code pasted into the club's description:* it proves control of the page, but it is an extra step for every honest officer. It is kept in reserve for disputes.
- *Why not email the club:* the page shows no club address.

### D2. A name match counts only with a school email
Two students can share a name, and anyone can type a name. The match is taken only when the email the person signed in with is at one of their campus's domains. Without one, the person is treated as not on the list and may ask for review.

### D3. Not on the list keeps nothing
A check that does not match saves no row. A row is made only by an approval or by "Send for review". The admin's list holds real claims only.

### D4. One row a person and club, and the admin's word stands
`campus_club_claim` is unique on person and club page. `state` is approved, waiting or refused; `how` is "officer list" or "admin". A check for a club the person already has a row for answers from the row and does not read the site. So a claim the admin turned down is not handed back by the list, and an approval the admin took back stays taken back.

### D5. The admin sees the list as it was read
Each row keeps `seen`, the officers and roles read at the time, and the email the person signed in with. The Clubs section shows both, with a link to the live list.

### D6. Only a club's own page on a CampusGroups site is read
The pasted link must be `https://<name>.campusgroups.com/<club>`. Anything else is refused before any request. The officer page is derived from it, and the guarded reader is told that one host only.

### D7. The claim page is its own page, in the campus look
Cards with a tab that overlaps each one, one line each, pills for every control, as in the approved mockup. The answer to a press is carried in the address (`said`, `link`), so a reload shows the same thing. The club name shown is read again from the kept row where there is one.

### D8. The door is the organizers page's form
After the sign-up form saves, its answer offers one pill, "Check you run it", that opens the claim page. The bar and the account card keep pointing at `/organizers`.

## Risks / Trade-offs

- **A shared name gets someone a club that is not theirs** → school email required (D2); every automatic approval is listed for the admin, marked "by Loopd, from the officer list", with "Take back".
- **The page's markup changes, or another school's differs** → the reader finds no club name and answers "could not read it"; it never approves on a page it cannot read. Only one Cornell page has been checked.
- **A person's name in Loopd differs from the list** (nickname, changed name) → they fall to review, with a note.
- **An officer steps down** → the claim stays until the admin takes it back (see Open Questions).
- **Reading a school's site by program** → one request a press, only for signed-in people, through the guarded reader.

## Migration Plan

1. The founder runs `supabase/migrations/20261120300000_campus_club_claim.sql` on production. Code from before keeps working.
2. Merge. The claim page and the Clubs section read the new table; both show an empty list if it is missing, but "Check" would fail, so the SQL goes first.
3. Rollback: revert the merge, then drop the table.

## Open Questions

- Should approved claims be checked against the list again each term, so a past officer drops off?
- Should the admin be told when a claim is waiting (email or a count in the bar), or is the count in the admin page enough?
- Other schools: which use CampusGroups with a public officer page, and what do the rest use?
