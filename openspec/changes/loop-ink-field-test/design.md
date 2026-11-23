## Context

Every sign-up in the app goes through `joinPlan` (`lib/campus/ink.ts`) and leaves a row in `campus_subscribe_ask`: person, email, plan, place, time. The Ink page also takes a signed-out sign-up with an email, kept in `campus_ink_waitlist` and given to the person when they sign in with that email (`claimSignedOut`).

Every other button posts to `app/c/ink/join`, which answers a signed-out press with 401 and what the sign-in card needs. Nothing is written. Since the one-button standard (commit c9de77a) the browser holds the plan for an hour (`loopd-held-ink`) and the top bar signs the person up once they are back signed in, so a press that ends in a sign-in is recorded then. A press by someone who never signs in is lost, on every surface.

Page opens are already counted in `site_open`, with a random visitor number from the `lp_v` cookie (`app/c/seen/route.ts`, production only). The database runs in UTC and the admin lists print `to_char(asked_at, ...)` as it is.

The founder applies migrations to production by hand. Code must work before and after a migration is applied.

## Goals / Non-Goals

**Goals:**
- No press of a sign-up button is lost.
- The admin reads times in the founder's own time, and can tell his presses from real ones.
- The legal pages say what signing up does and keeps.

**Non-Goals:**
- Changing any button's label, look or behaviour for a member.
- Moving perks between Ink and Ink+.
- Joining a signed-out press to the account that later signs in. The visitor number is kept so this can be read later from `site_open`; no screen does it now.

## Decisions

**D1. The signed-out press goes in `campus_ink_waitlist`, with no email.** The table already means "asked while signed out" and already has plan, place and time. `email` becomes nullable and a `visitor` column is added. A second table was considered and dropped: it would repeat four of five columns and split one question ("what was pressed signed out?") over two tables. `claimSignedOut` matches on `lower(email)`, so a row with no email is never claimed and never gives a plan.

**D2. The route writes the press, then answers 401 as now.** `app/c/ink/join` keeps the row and returns the same 401 body. The plain pages (Conga, Seats, the Ink page's frame) need no edit. One browser change: while a plan is held and the person is still signed out, the top bar (`HeldInk`) posts to the route on every page it mounts on. That is a retry, not a press, so it sends `again: true` and the route keeps nothing for it. The write is wrapped: any failure, including the column not being there yet (23502, 42703), is swallowed, and the person is sent to sign in all the same.

**D3. The visitor number is read from `lp_v`, never set here.** The route reads the cookie `app/c/seen` sets. With no cookie (local, or a browser that blocked it) the row is kept with no visitor. Setting the cookie in two places would give two rules for one cookie.

**D4. A limit on signed-out presses.** They are the only writes an anonymous browser can make with no email. A new `join` bucket in `lib/ratelimit.ts`: 20 a minute per address. Over it, nothing is written and the answer is the same 401.

**D5. New York time in SQL, said once in the words.** Each admin reader changes `to_char(asked_at, ...)` to `to_char(asked_at at time zone 'America/New_York', ...)`. The Premium tab's first line says "Times are New York time." One zone, not the viewer's: there is one admin, and the lists are read as text. The call ask's own days and times stay as typed, as now.

**D6. The admin's own sign-ups are marked, not hidden.** The founder presses buttons to check the test works and must see that they landed. A row whose email is one `LOOP_ADMIN` lists shows "Yours", and the counts in the lede leave those rows out. An admin listed by account id only is not matched; the lists hold emails, not account ids, and production lists the admin by email.

**D7. Legal words are the founder's to approve.** The proposed words are in the spec. They are written into the pages only after his yes, and "invitation only" in the Terms stays unless he says to change it.

## Risks / Trade-offs

- [A signed-out press and the signed-in press that follows are two rows in two tables] → The admin shows them as two lists with their own counts, and says the first has no email. They are not added together.
- [Bots pressing buttons signed out] → The origin check already in the route, plus D4. Rows carry no personal data.
- [Migration not applied when the code goes out] → D2: nothing is recorded, nothing breaks. The task list has the founder apply it first.
- [`visitor` is absent in local runs] → Tests pass the cookie in; a row with no visitor is valid.

## Migration Plan

1. Founder runs `supabase/migrations/20261123020000_campus_ink_press.sql` on production (two `alter table` statements, additive).
2. Code is published.
3. Rollback: put the old code back. The column and the nullable email can stay; to undo fully, delete rows with no email, set `email` not null, drop `visitor`.

## Open Questions

- Do the Terms still say "invitation only" once the field test is open to anyone at a school?
- The exact words of the Terms part and the Privacy sentence.
