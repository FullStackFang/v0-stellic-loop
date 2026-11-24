## Why

Loopd's group rewards unlock only when two or more people check in together, but today every reward is typed in by hand against one event. A venue's standing offer, like a bar's daily happy hour, has no way in. The founder wants to prove the "come as 2+" idea on Cornell Tech with real island venues. Students should see these offers only as an activity carrying a **Deal for 2+**: never the words "happy hour", only while the deal runs, and only near it. The flow was agreed on `public/demo/mockups-campus-deal-flow.html`, and the card look on `public/demo/mockups-campus-deals-real.html`.

## What Changes

- **Admin "Deals":** the admin enters a deal once, with these fields:
  - a known place on the campus;
  - the activity's name (e.g. "Drinks at Nisi Bistro");
  - the one line students see (e.g. "$2 off every drink");
  - the group size, 2+ to 4+;
  - the weekdays;
  - a from–until time;
  - a private note that only the admin ever sees (what it really is, where it came from).

  The admin can edit or hide a deal.
- **One activity per day:** on each weekday the deal runs, Loopd makes that day's activity by itself, at the deal's place and hours, with a group reward carrying the deal's line and size.
- **Only while it runs:** a deal's activity is off the campus page before its start and after its end.
- **Only near it:** in the week list, a deal shows only to someone whose browser already allows location and who stands in the deal's section of the map. On the Near you map it shows in its own section, like any event at a known place.
- **The approved card:** a deal card leads with the deal line in large type under the title, then an ink "Deal · 2+ of you" tag and when it runs ("until 7pm"), then the place.
- **Unchanged:** everything after "I'm in" stays as it is today:
  - inviting;
  - "One more unlocks it";
  - checking in at the place (location checked, not kept, since 6c38b97);
  - "Unlocked for your group";
  - Show at the counter;
  - Mark as used;
  - outings counting toward levels.
- **Not in this change:**
  - notices when someone joins;
  - repeat deals ("go 5 times");
  - venue sign-up;
  - an ID check for drinks deals.

## Capabilities

### New Capabilities
- `campus-deals`: deals entered by the admin that become one activity per weekday, shown only during their hours and near their place, on the approved card, unlocking through the existing group reward.

### Modified Capabilities
(none: the existing list, check-in and reward rules are unchanged, and a deal's activity is a hand listing that follows them)

## Impact

- **Database:** one migration, which the founder runs by hand.
  - New table `campus_deal`.
  - New column `campus_listing.deal_id` with a unique `(deal_id, starts_at)`.
- **Code:**
  - `lib/campus/deals.ts` (new): save, hide and list deals, and make today's activity.
  - `lib/campus/listings.ts` / `lib/campus/screen.ts`: deal activities hidden outside their hours; tickets carry the deal.
  - `components/campus/screen.tsx` and its CSS: the deal card, and the "near it" filter in the week list.
  - `app/c/admin/` (page, actions, a deal form): the Deals tab.
- **Tests:** vitest for deals (PGlite), the screen and the admin form.
- **No new dependencies.**
