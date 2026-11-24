## Context

The campus model already has everything after "I'm in":
- `campus_listing` (`origin` `hand` for admin-entered events);
- `campus_outing` and its members with `checked_in_at`;
- `campus_reward` of kind `group`, riding on one `listing_id` with a `head_count`;
- `campus_reward_use`, keyed by reward and outing.

`lib/campus/screen.ts` turns these into the seat stub ("One more unlocks it", "1 of 2 checked in", "Unlocked for your group") and the top-bar "Show at the counter" strip. Check-in at a known place needs the person within 150 m (`lib/campus/outings.ts`, 6c38b97).

What is missing is a standing offer that repeats on a schedule, can only be seen during its hours and near its place, and a card that leads with the deal.

Mockups: `public/demo/mockups-campus-deal-flow.html` (the flow, agreed 2026-11-23) and `public/demo/mockups-campus-deals-real.html` (the card, approved).

## Goals / Non-Goals

**Goals:**
- The admin enters a deal once, and it runs on its weekdays without further work.
- Students see it only as "Deal for 2+" on an activity, only during its hours, and in the week list only when they stand in its section.
- Reuse the outing, invite, check-in, unlock and use path unchanged.

**Non-Goals:**
- Notices of any kind (text, email, push) when someone joins.
- Repeat deals ("go 5 times").
- Venue accounts or venue sign-up.
- ID checks.
- Deals on campuses without a section map.
- Editing a day already made from an edited deal, beyond its line and hiding (see D5).

## Decisions

**D1. A deal is a schedule. Each day it runs is an ordinary hand listing plus a group reward.**
- New table `campus_deal`:
  - campus, `place_id` (required);
  - `title`, `line`, `head_count` (2–4);
  - `days` (smallint[] of 0–6, Sunday = 0);
  - `starts_local` / `ends_local` (`time`, in the campus's time zone, ends after starts, same day);
  - `note` (private);
  - `hidden_at`, `created_at`.
- New nullable column `campus_listing.deal_id`, referencing `campus_deal` on delete cascade, with a unique index on `(deal_id, starts_at)`.
- A day's listing:
  - `origin` `hand`, the deal's title, `place_id`;
  - `host_name` set to the place's name;
  - `starts_at` / `ends_at` as that day's local times.
- Its reward:
  - `kind` `group`, `listing_id` set to that listing;
  - `head_count` set to the deal's;
  - `text_member` set to the line;
  - `giver` set to the place's name.

*Why:* everything after "I'm in" keys on a listing and a reward, so nothing downstream changes, and uses stay per day.

*Alternative rejected:* one reward on `host_name`. It would also attach to every other event at that venue, and it would be visible all week.

**D2. Today's day is made when the campus page is read, and making it twice is harmless.**
`ensureDealDays(q, campus, now)` runs before `weekListings` on the campus page and the Near you data:
- For each live deal whose weekday matches today in the campus time zone, it inserts the listing and its reward.
- The insert is `on conflict (deal_id, starts_at) do nothing`, and the reward is only inserted when the listing was.

There is no cron job and no back-fill, so days nobody opened never exist.

*Alternative rejected:* a daily cron. It is another moving part, and there is nothing to show until someone looks anyway.

**D3. "Only while it runs" is a filter in the week read.**
- A listing with a `deal_id` is left out of the list unless `starts_at <= now < ends_at`.
- Check-in already opens 30 minutes before the start. That is harmless here: the card appears at the start, and check-in stays open until the end.
- After the end, the card is gone, so the "Used" state stays visible only in the top-bar strip for that moment.

**D4. "Only near it" is decided in the browser, with no location prompt.**
- In the week list, a deal ticket is shown only if both hold:
  - `navigator.permissions.query({name:'geolocation'})` is already `granted`;
  - a position read finds the person in the same section (`sectionAt`) as the deal's place.
- Otherwise, the ticket is left out of the week list. Before the check settles, deal tickets are not drawn, so nothing pops in and out.
- The Near you tab draws it in its section like any ticket at a known place: looking at the map of that section is itself "near it".
- The server never learns where anyone is.

*Alternative rejected:* asking for location on page load. It is a prompt nobody asked for, and the Privacy page says location is read only at check-in.

**D5. Edits.**
- Editing a deal changes the days not yet made.
- It also changes today's listing title and reward line, when today's day exists and has no reward use.
- Hiding a deal hides today's listing too (`hidden_at`), so the card goes at once.
- Times and size changes apply from the next day.

**D6. The card.**
- `Ticket` gets `deal: { line, need, until } | null`.
- When it is set, the card renders:
  - the title;
  - the `.cs-deal` block: the line in large type, then an ink "Deal · 2+ of you" pill and "until 7pm" (or "until 7:30pm");
  - the place line;
  - the existing group stub, without its "Group reward from …" header, since the deal block already says it.
- The look follows `mockups-campus-deals-real.html`, on the campus kit's tokens in the existing campus CSS.
- The words "happy hour" appear nowhere in student code paths. Only `note` holds the truth, and only the admin page reads it.

**D7. Admin.**
- The Deals tab in `/c/admin` lists the deals of the campus being administered.
- Its form has:
  - Place, a select of `campus_place`;
  - Activity name;
  - The deal, as students see it;
  - Group of (2+ / 3+ / 4+);
  - Days (seven toggle pills);
  - From and Until;
  - Only you see this (the note).
- It has Save and Hide. Saving works in place, as the animal form does (5c5d273).
- Day rewards made from deals are left out of the existing Rewards list, so they do not flood it.

## Risks / Trade-offs

- **[A deal at an unpublished price]**
  - Nisi's real offer is unknown.
  - → The admin types the line, and the note keeps the source. Nothing ships seeded: the founder enters each deal after confirming it.
- **[Students under 21 see a drinks deal]**
  - → Same as any bar listing today: the venue checks ID. The line can name non-alcoholic items. This is noted to the founder, not enforced.
- **[Nobody knows a friend joined]**
  - → Accepted for this build. The card shows the state the next time either person opens Loopd.
- **[Browsers that lack `navigator.permissions`]**
  - → Treated as not granted. Deals then show only on Near you.
- **[A friend without a school account cannot fill the seat]**
  - → That is the existing campus rule, and it is unchanged.
- **[A day made just after its window starts]**
  - → `ensureDealDays` runs on every page read, so the first visitor makes it.

## Migration Plan

1. The founder runs `supabase/migrations/<stamp>_campus_deals.sql` (the table, the column and the index) by hand on prod.
2. Until then, the code finds no deals:
   - `ensureDealDays` returns early if `campus_deal` is missing.
   - The admin tab says to run the migration.
3. Rollback: hide every deal. The column and table can stay.

## Open Questions

- What Nisi's daily offer and hours really are. The founder will ask before entering it.
