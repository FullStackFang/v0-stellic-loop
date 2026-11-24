## Context

A place is a row in `campus_place`. An event (`campus_listing`) points at one through `place_id`, set when its place text matches or when the admin pins it. A group is an outing (`campus_outing`), and `campus_outing_member.checked_in_at` says who came. Checking in is a button that checks the phone is within about 150 m (`NEAR` in `lib/campus/outings.ts`) during the event's window.

There is no venue account and no venue sign-in. The founder is the only admin and runs production SQL by hand.

## Goals / Non-Goals

**Goals:**
- Three honest numbers per place, each with a definition a venue owner can repeat.
- Counts only. No path from the page to a person.
- A link the founder can hand to a venue today.

**Non-Goals:**
- Venue accounts, venue sign-in, or venues editing anything.
- Cryptographic signing of the record. The link and the definitions are the proof for now.
- Money, bookings, or anything the venue does at the till.
- Showing the record inside the student pages.

## Decisions

**D1. What the three numbers are.** For a place and a span of time, taking outings on events at that place whose event started in the span:
- *Said they were coming*: outings with two or more members.
- *Showed up*: outings where two or more members checked in. This is the same test as "Outings that count".
- *Came back*: of those that showed up, the ones where at least two of the checked-in members had checked in together at this same place on an earlier day.

People is the sum of members across the first set. Alternative for "came back": the exact same set of members. Rejected: groups change by one person all the time and would never count.

**D2. Small numbers hide the breakdowns.** With fewer than five groups that showed up in the span, the page shows only the three numbers. The by-week, by-size and by-day panels appear at five or more. A venue that saw two students on a quiet Tuesday could otherwise match a bar on a chart to faces at a table.

**D3. Private link by default, public by a switch.** `campus_place.record_token` (random, made on first copy) and `record_public boolean default false`. The page opens with `?k=<token>` or when the record is public; anything else is not found. Alternative: public for all places. Rejected for now: a thin record ("2 groups") is not proof, and the founder should choose which places are shown.

**D4. Address.** `/places/[campus]/[place]/record`, where `[place]` is the place's tag from `placeTag` (`lib/campus/place-tags.ts`). It sits outside `/c`, so the school gate does not apply. The page is marked not to be indexed unless the record is public.

**D5. One read, no stored totals.** `placeRecord(q, placeId, span, now)` runs the counts in SQL each time. A place has at most hundreds of outings. Alternative: a nightly table. Rejected until a page is slow.

**D6. Time.** Spans end now and are counted in the campus timezone; weeks start on Monday, as the campus pages do. "Which days" groups Monday to Thursday, Friday, and the weekend.

**D7. Look.** As the mockup: the app's bar, a band in the school's field colour with the place name, three number cards (the third on ink), panels with a filled tab for a title, and the dark note. One column on a phone.

## Risks / Trade-offs

- [A private link gets forwarded] → It shows counts only; the admin can make a new link, which stops the old one.
- [Events with no matched place are missed] → The record counts only events pinned to the place; the admin Events tab already lets a place be pinned by hand.
- [Deal days make one outing per day, so a daily pair counts as many "came back"] → That is true coming back; the definition line says "another day".
- [Check-in can be pressed nearby without going in] → The note says how a group is counted, 150 m included. No stronger claim is made.

## Migration Plan

One migration adds the two columns, both nullable or defaulted, so old code keeps working. The page says a record is not set up when the columns are missing. The founder runs the SQL on production; the reply that lands this change pastes it.

## Open Questions

- Whether a venue should be able to see the record for a place before any deal or reward exists there. The design allows it.
- Whether "people" under the first number is wanted or is one number too many.
