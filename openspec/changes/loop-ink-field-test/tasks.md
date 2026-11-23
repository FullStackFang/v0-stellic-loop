## 1. Migration

- [x] 1.1 Write `supabase/migrations/20261123020000_campus_ink_press.sql`: `campus_ink_waitlist.email` may be empty; add `visitor text` with the same check as `site_open.visitor`. Additive, with `lock_timeout`, a rollback note, and "the code works before this is applied"
- [x] 1.2 Paste the SQL in the reply for the founder to run on production before publishing

## 2. Keep the signed-out press

- [x] 2.1 Test first (`app/c/ink/join/route.test.ts`): a signed-out press with no email keeps one row (plan, place, visitor from `lp_v`) and still answers 401 with the sign-in address; with no cookie the visitor is empty; signing in afterwards gives no plan
- [x] 2.2 Test first: a failed write (the column missing) still answers 401 and shows no error
- [x] 2.3 `lib/ratelimit.ts`: a `join` bucket, 20 a minute per address
- [x] 2.4 `lib/campus/ink.ts`: `pressSignedOut(q, plan, place, visitor)` writes the row and swallows any failure
- [x] 2.5 `app/c/ink/join/route.ts`: before the 401, unless the body says `again`, read `lp_v`, check the limit, call `pressSignedOut`
- [x] 2.6 `components/campus/join-plan.tsx`: `HeldInk` sends `again: true`; test that the retry keeps no row

## 3. Admin: New York time, own presses, signed-out presses

- [x] 3.1 Test first (`lib/campus/ink` readers): `subscribeAsks` and `signedOutAsks` give New York time for a row made at 01:30 UTC
- [x] 3.2 Change `to_char(asked_at, ...)` to New York time in `subscribeAsks`, `signedOutAsks` (`lib/campus/ink.ts`), `callAsks` (`lib/campus/call-ask.ts`), `clubAsks` (`lib/campus/imprint.ts`) and `premiumAsks` (`lib/campus/custom-face.ts`)
- [x] 3.3 `signedOutAsks` gives only rows with an email; a new `signedOutPresses` gives the rows with none (plan, place, time)
- [x] 3.4 `lib/campus/admin.ts`: `adminEmails()` gives the emails `LOOP_ADMIN` lists (`isAdmin` is left as it was)
- [x] 3.5 `app/c/admin/page.tsx` Premium tab: "Times are New York time." once; sign-up rows of an admin email show "Yours" and the count leaves them out; the list of signed-out presses with its count, shown only when there are any
- [x] 3.6 Page test for the Premium tab: the "Yours" mark, the count, and the signed-out presses list

## 4. Legal pages (after the founder's yes to the words)

- [x] 4.1 Founder approves the Terms part and the Privacy sentence in the spec, and says whether "invitation only" stays
- [x] 4.2 `app/terms/page.tsx`: the Ink part, and the new date
- [x] 4.3 `app/privacy/page.tsx`: the sentence, and the new date

## 5. Check and land

- [x] 5.1 Run only the affected tests (`--maxWorkers=3`), `tsc --noEmit`, and lint on the changed files
- [ ] 5.2 On localhost, signed out: press Ink+ on Conga and Get Ink on Seats, then see both in the admin's Premium tab; signed in as the admin: press a button and see it marked "Yours"
- [ ] 5.3 Commit on local main. The founder runs the migration, then publishes
