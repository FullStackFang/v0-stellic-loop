# Tasks

Order: 1 → 2 → 3 → {4, 5, 6} → 7 → 8. Group 1 is the founder's and can run in parallel with everything else. Without the Twilio variables, the code ships safely and keeps logging.

## 1. Founder setup (parallel, has lead time)

Revised 2026-10-26: codes only, through Twilio Verify (no number, no 10DLC, no toll-free verification).

- [ ] 1.1 In the existing Twilio account, create a Verify Service named "Quorum" (SMS channel, 6-digit code)
- [x] 1.2 ~~10DLC registration~~ not needed: Verify sends from Twilio's registered senders
- [ ] 1.3 Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` in Vercel Production only (not Preview), then redeploy

## 2. Database

- [x] 2.1 Write `supabase/migrations/0006_sms.sql`: `alter type event_type add value if not exists 'one_more_sent'` and nullable `to_path text` and `source source` on `magic_token`; and `0007_sms_once.sql`: the partial unique index `event_one_more_once on event (proposal_id) where type = 'one_more_sent'` (Postgres refuses a new enum value in the transaction that adds it, so the index needs its own file). Verify on PGlite that a second `one_more_sent` for the same proposal is rejected, and add the case to `supabase/tests/constraints.test.sql`.
- [x] 2.2 Add `one_more_sent` to `EventType` in `lib/types.ts`

## 3. Notifier core

- [x] 3.1 `lib/phone.ts`: `isUsNumber(e164)`; verify that "+16075550123" passes, and "+447700900123" and a +1 number that isn't valid for the US both fail
- [x] 3.2 `lib/notify/copy.ts`: one function per message, each returning its body (code, ON, ON missed day, ON no day, maybe, drop, one-more). Verify unit tests for the exact copy in the specs, the "One more"/"{k} more" switch, "Someone" for a hidden name, and that each body with a 60-character link stays at most 2 GSM-7 segments.
- [x] 3.3 `lib/notify/twilio.ts`: `TwilioNotifier` built on a `send(to, body)` that posts to the Messages API with `fetch`. It resolves person ids to phone, name and opt-out; skips `not_us` and `opted_out` (except for `code`); sets `sms_opt_out` on error 21610 and clears it on a successful code; and writes one `text_sent` event per recipient (channel `sms`, kind, person, status, sid or error code, never the code). Verify with a mocked `fetch` covering sent, failed, 21610, not_us, opted_out and the code exception, and that the request uses Basic auth and `MessagingServiceSid`.
- [x] 3.4 `notifier(q)` picks `TwilioNotifier` only when all three env vars are set, otherwise `LogNotifier`; `Notifier.code` returns `{ sent: boolean }` (the log notifier returns `true`); verify both branches and that `setNotifier` still overrides

## 4. Sign-in links

- [x] 4.1 `lib/tokens.ts`: `magicToken()` 16 bytes; new `issueMagicLink(q, personId, toPath, source)` that inserts a hashed token with a 24-hour expiry, `to_path` and `source`, and returns `appUrl("/m/<token>")`
- [x] 4.2 `app/m/[token]/route.ts`: prefer the token's stored `to_path` and `source`, fall back to `?to=&src=`, keep `safePath`; verify the existing magic-link test still passes, plus new cases: a stored destination, an expired token landing unsigned, and a used token landing unsigned

## 5. Codes by text

- [x] 5.1 `lib/identity.ts`: `withIdentity` refuses non-US numbers with error `not_us`, and `issueCode` deletes its `otp_code` row and returns `code_not_sent` when `code` returns `{ sent: false }`. `actions/results.ts` gets "US numbers only for now." and "We couldn't text that number. Try again.", and `IDENTITY_ERRORS` and the phone hint copy are updated. Verify identity tests for both errors, including that no code row survives a failed send.

## 6. ON, drop and one-more texts

- [x] 6.1 `TwilioNotifier.onReached`: split recipients into in-day-works, in-missed-day and maybe; issue a sign-in link (`/p/<id>`, source `on_text` for yeses, `maybe_nudge` for maybes) per person; send nothing to `out`. Verify the 8 in / 2 missed / 1 maybe scenario sends 6 + 2 + 1 with the right bodies.
- [x] 6.2 `TwilioNotifier.dropped`: text the poster only, with the dropper's display name or "Someone" and a sign-in link; verify both name cases
- [x] 6.3 One-more trigger: in `respondAs` (inside the transaction), after an `in` on an `open` intent, insert `one_more_sent` with `on conflict do nothing` when `max(2, min - 2) <= n < min`, and return whether it fired. In `actions/respond.ts`, after commit, call `notifyOneMore` (`lib/after.ts`). That mints one share per recipient (poster plus every yes, with a `share_minted` event naming them) and calls `oneMore`. Verify: 6 of 8 fires once; the 7th sends nothing; the poster alone on a default-4 intent sends nothing and the 2nd `in` fires; two concurrent commits fire once; maybe and out never fire.
- [x] 6.4 `TwilioNotifier.oneMore` sends the one-more body with each recipient's share link and no magic token; verify the body contains `?s=` and no `/m/`
- [x] 6.5 Every follow-up send runs after commit and swallows its own errors; verify a lock with `fetch` rejecting still returns success, the intent is ON, and one `failed` event per recipient exists

## 7. Verify

- [x] 7.1 Lint, all vitest suites and the build are green; `app/globals.css` is unchanged
- [x] 7.2 Local walkthrough with the log notifier (`node scripts/local-db.mjs --demo`): a lock, a drop and a one-more all produce `text_sent` log events with the intended bodies and short `/m/` links that sign in
- [x] 7.3 Update README's last-run line

## 8. Production (founder go-ahead)

- [x] 8.1 Founder runs `0006_sms.sql`, then `0007_sms_once.sql` as a separate run, on `supabase-loop`; verify the new enum value, the index and the `magic_token` columns, that `emba27` is unchanged, and that the advisors show only the known INFO lint
- [ ] 8.2 Push `main` and verify the live site still logs (no Twilio vars yet): `/b/emba27` loads, posting works
- [ ] 8.3 After 1.3, from a second device: start as a new number, receive the Verify code, sign in; then from a third browser as the same number, receive a code again and land signed in. Then delete the test rows.

## 9. Codes only, through Verify (revision 2026-10-26)

- [x] 9.1 `lib/notify/verify.ts`: `verifyConfig`, a transport that starts an SMS verification, `checkVerification` (approved / wrong / expired on 404 / failed), and `VerifyNotifier` (codes through Verify, everything else logged); `notifier()` prefers it over the Messaging Service
- [x] 9.2 `withIdentity`: an unknown number gets a code too, with its name carried in `pending.person`; `verifyCode` checks with Verify when configured, creates the person on success, and returns `code_check_failed` (keeping the code) when Verify can't be reached
- [x] 9.3 Copy: the consent line, the code hint, `/privacy` and `/terms` say codes are the only texts
- [x] 9.4 Tests: Verify request shape, unknown-number codes, plan texts logged only, check outcomes, and end-to-end respond → verify for approved, wrong and unreachable; existing flows updated to enter the code
