## 1. Database

- [x] 1.1 Add migration `supabase/migrations/<stamp>_campus_deals.sql`. It creates:
  - table `campus_deal`: id, campus_id, place_id required, title, line, head_count 2–4, days smallint[] of 0–6 (non-empty), starts_local/ends_local time with ends > starts, note, hidden_at, created_at;
  - column `campus_listing.deal_id`, referencing campus_deal on delete cascade;
  - a unique index on `(deal_id, starts_at)` where deal_id is not null.
- [x] 1.2 Confirm the migration applies in the PGlite test database (`test/db.ts` runs all migrations).

## 2. Deals core (`lib/campus/deals.ts`)

- [x] 2.1 `saveDeal`, `hideDeal` and `campusDeals`, with the validation from the spec: place on the campus, at least one day, until after from, size 2–4, line and title non-empty. Tests first.
- [x] 2.2 `ensureDealDays(q, campus, now)`. For each live deal running today in the campus time zone:
  - insert the hand listing (deal title, place_id, host_name set to the place name, today's local hours as timestamptz) on conflict do nothing;
  - insert its group reward (giver set to the place name, text_member set to the line, head_count) only when the listing was inserted;
  - return early if `campus_deal` does not exist.

  Tests: made once when called twice, none on an off day, none for a hidden deal, correct UTC times across a DST change.
- [x] 2.3 Edits:
  - an edit updates today's listing title and reward text when today exists and has no reward use;
  - hiding sets hidden_at on today's listing.

  Tests.

## 3. Reading the campus page

- [x] 3.1 Call `ensureDealDays` before the week read on the campus page and in the Near you data.
- [x] 3.2 In the week read, leave out listings with a deal_id unless `starts_at <= now < ends_at`. Tests at 4:59pm, 5:02pm and 7:00pm.
- [x] 3.3 Add `deal: { line, need, until, section-ready place } | null` to `Ticket` in `lib/campus/screen.ts`.
  - Never put the note on the ticket.
  - Leave the reward rows made from deals out of the admin Rewards list.

  Test: a ticket's JSON for a deal contains neither the note nor "happy hour".

## 4. Student card and "near it"

- [x] 4.1 Add the deal block to the card in `components/campus/screen.tsx`, in this order: title, line in large type, ink "Deal · N+ of you" pill with "until 7pm", place, existing seats stub. Drop the stub's "Group reward from" header when the ticket has a deal. Style it with the campus CSS tokens, matching `public/demo/mockups-campus-deals-real.html`.
- [x] 4.2 Filter the week list by section:
  - deal tickets render only after `navigator.permissions` reports geolocation `granted` and a position read puts the person in the deal place's section (`sectionAt`);
  - otherwise they are left out, with no prompt and no flash.
- [x] 4.3 On Near you, deal tickets show in their section like any ticket at a known place. Confirm with a test.
- [x] 4.4 Screen tests:
  - the card's text order;
  - no "happy hour";
  - hidden when permission is `prompt`/`denied`;
  - hidden when the person is in another section;
  - shown when granted and in the section;
  - the "0 of 2 checked in" and "Unlocked for your group" states come through unchanged.

## 5. Admin Deals tab

- [x] 5.1 Add a Deals tab in `/c/admin` listing the campus's deals: place, line, size, days, hours, the note, and a Hidden pill when hidden.
- [x] 5.2 Add a deal form with these fields: Place select, Activity name, The deal as students see it, Group of 2+/3+/4+, seven day pills, From and Until, Only you see this. Save and Hide work in place without leaving the page, and every control is a pill.
- [x] 5.3 Before the migration, the tab says to run `<stamp>_campus_deals.sql`.
- [x] 5.4 Admin form tests: save, refused cases, hide.

## 6. Check and land

- [x] 6.1 Run only the affected tests (deals, outings, screen, admin form) with `--maxWorkers=3`. Then run eslint and `tsc --noEmit`.
- [ ] 6.2 Once the founder has run `20261124050000_campus_deals.sql` on the dev database (not yet run on 2026-11-23, nor the plan-time SQL), walk the flow on localhost:3000:
  - enter a deal for now in admin;
  - see it in the week list with location granted and in its section;
  - see it missing when location is not granted;
  - see it on Near you;
  - join with two accounts, check in, unlock, Mark as used.
- [x] 6.3 Commit on local main (no push). Paste the migration SQL in the reply for the founder to run.
- [ ] 6.4 The founder enters the real deals once confirmed (Nisi Date Night, Fridays; Nisi daily offer once known; Free Mod Monday only on its announced Monday).
