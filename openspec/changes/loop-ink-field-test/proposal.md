## Why

Ink and Ink+ go to production as a field test: nobody is charged, and what is learned is who presses a sign-up button, which one, and when. A review before publishing (2026-11-23) found four things that would spoil that reading: a signed-out press that does not end in a sign-in is thrown away everywhere but the Ink page, the admin shows times in UTC with no label, the Terms and Privacy pages say nothing about signing up, and the founder's own test presses sit among everyone else's.

## What Changes

- A signed-out press on any Ink or Ink+ sign-up button is kept before the sign-in card opens: the plan, the button, the time and the browser's visitor number. No email, since none was given.
- The admin's Premium tab shows every sign-up time in New York time and says so.
- The admin's Premium tab marks the admin's own sign-ups "Yours" and leaves them out of the counts it states.
- The admin's Premium tab lists signed-out presses with no email as their own list, with a count.
- Terms gain a part about Ink, and Privacy gains a sentence: signing up charges nothing, and what is kept is the email, the plan, the button pressed and when. Both pages take the new date.

Not in this change: any button's look or behaviour. The one-button standard and the Ink / Ink+ split were built on 2026-11-23 (commit c9de77a); this change only adds what is recorded.

## Capabilities

### New Capabilities
- `ink-field-test`: what the Ink and Ink+ field test records about a press, how the admin reads it, and what the legal pages say about it.

### Modified Capabilities

None. `ink-placements` keeps its requirements; the sign-up rules of `loop-ink-tiers` (not yet archived) are added to, not changed.

## Impact

- `supabase/migrations/`: one new migration on `campus_ink_waitlist` (email may be empty, new `visitor` column). Run by hand by the founder before the code is published; the code works before it is applied and simply records no signed-out press.
- `lib/campus/ink.ts`, `app/c/ink/join/route.ts`: keep the signed-out press; read times in New York time.
- `components/campus/join-plan.tsx`: the top bar's retry of a held plan says it is a retry, so it is not counted as a press.
- `lib/campus/call-ask.ts`, `lib/campus/imprint.ts`: the same New York time for their admin lists.
- `lib/ratelimit.ts`: one new bucket for signed-out presses.
- `app/c/admin/page.tsx`: the Premium tab's lists and words.
- `app/terms/page.tsx`, `app/privacy/page.tsx`: one part and one sentence.
- No change to any sign-up button, card or page a member sees.
