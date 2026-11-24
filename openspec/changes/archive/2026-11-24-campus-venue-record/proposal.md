## Why

When Loopd talks to a bar or a café, the strongest thing it can show is proof: student groups who said they would come, groups who did, and groups who came back. Loopd already keeps every check-in, but there is no page that adds them up for a place. This is that page, with counts only and never who.

## What Changes

- A record page for a place: three numbers (groups that said they were coming, groups that showed up, groups that came back) over the last 4 weeks, 8 weeks or all time.
- Below them, when there are enough groups to keep people from being picked out: groups that showed up by week, how big they were, and which days they came.
- One line saying how a group is counted.
- The page opens from a private link the admin copies on the admin page. The admin can switch a place's record to public; it is private by default.
- The page never shows a name, a face, a first name or anything about one person.
- Mockup: `public/demo/mockups-six-adds.html`, section 2 (laptop and phone).

## Capabilities

### New Capabilities
- `venue-record`: the per-place record of groups, how each number is counted, who may open it, and what it must never show.

### Modified Capabilities

(none)

## Impact

- New: `lib/campus/record.ts`, page `app/places/[campus]/[place]/record/page.tsx` and its styles.
- Admin: the Places tab in `app/c/admin/page.tsx` gets "Copy record link" and a public switch.
- Migration: two columns on `campus_place` (`record_token`, `record_public`). The founder runs it on production by hand.
- Depends on nothing. `campus-public-places` reads the same numbers when a record is public.
