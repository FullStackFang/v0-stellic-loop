## Revision (2026-10-26): codes only, through Twilio Verify

The founder chose to text **sign-in codes only**, for now, and to have **every** number confirm one. Plan updates (ON, drop, one more, maybe) stay in the app and are only logged.

- **Codes go through Twilio Verify.** Verify makes the code and sends it from Twilio's own registered senders, so Quorum needs no number, no 10DLC campaign and no toll-free verification. Three Vercel variables: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. When they are set, Verify wins over the Messaging Service.
- **Every new number confirms a code.** An unknown number no longer becomes a person on the spot: the action waits for the code, like a known number on a new device, and the person is created (with the name typed) only when the code checks.
- **Kept, not switched on:** the Messaging Service notifier, the ON/drop/one-more copy, the one-more trigger and the short `/m/` links all stay in the code and tests, ready for when plan texts are wanted.
- The consent line, `/privacy` and `/terms` say codes are the only texts.

## Why

The live board writes every text it would send to a log. A stranger can still tap in (a new number needs no code), but anyone coming back on a second device gets a code that never arrives, and nobody hears that an intent is ON unless they open the board. ON is the moment the board pays off, and today nobody is told. Real texts make the lock mean something and let people come back from any phone.

## What Changes

- **Texts go out through Twilio.** A Twilio notifier replaces the log notifier in production when Twilio is configured. Without Twilio settings (local, tests, preview) the log notifier stays, unchanged. Every send still writes one `text_sent` event, now with channel `sms` and the send status; the code itself is never stored.
- **US numbers only, for now.** The phone field accepts US numbers only ("US numbers only for now."). No international texting, no WhatsApp. A person whose number is not +1 (none exist on the live board) is never texted.
- **What gets texted** (the messages that already fire, plus one):
  - the sign-in code for a known number on a new device (unchanged trigger);
  - the ON text to everyone in, with the day, time and a "Post your own" line;
  - a separate line for yeses whose days missed the locked day;
  - the maybe nudge on ON ("Suits is on. 8 in. You said maybe. In?");
  - the poster's "Marcus dropped. 7 in." when a yes leaves an ON intent;
  - **new:** the "one more" text, once per intent, to the poster and every yes the first time the intent is within two of its minimum (DESIGN.md decision 7): "7 of 8 for Suits. One more and it's on. Send it to someone: <link>".
- **Every text carries a sign-in link.** Each message to a person includes a single-use `/m/<token>` link to the intent, so tapping a text never asks for a code. The `/m` route already exists; this change starts issuing tokens.
- **STOP is honored.** Opt-outs are handled by the Twilio Messaging Service. When Twilio reports a number has opted out, the person is marked `sms_opt_out` and gets no more texts, except a sign-in code they ask for themselves.
- **A failed send never breaks the action.** ON, drop and one-more texts are sent after the transaction commits; a failure is logged and recorded. A sign-in code that cannot be sent returns "We couldn't text that number. Try again." instead of asking for a code that will never come.

Out of scope, each for a later change: +1 guests, WhatsApp and non-US numbers, the weekly digest text, inviting a pasted member list, quiet hours, inbound replies other than STOP.

## Capabilities

### New Capabilities
- `sms-delivery`: which notifier runs where, how a text is sent and recorded, US-only recipients, opt-out, sign-in links in texts, and what happens when a send fails.
- `one-more-text`: the once-per-intent text when an intent first gets within two of its minimum.

### Modified Capabilities
- `board-identity`: "A person is a phone number and a name" accepts US numbers only; "Known numbers on a cookieless device verify once" sends the code by text and fails visibly when it can't; "Magic-link tokens set the session" also reads a destination and source stored on the token.
- `quorum-and-lock`: "Locking hands off to the notifier once" sends real texts (yeses, can't-make-it, maybes) instead of only logging.

## Impact

- **Founder setup (before the code matters):** a Twilio account, US A2P 10DLC brand and campaign registration (days to weeks), a Messaging Service with a number, and three Vercel env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`. A trial account can text only verified numbers, which is enough to test.
- **Code:** `lib/notify/` (a Twilio notifier, message copy, notifier choice from env), `lib/identity.ts` (code send failure), `lib/phone.ts` (US only), `lib/after.ts` (sign-in links, one-more trigger), `actions/respond.ts` (one-more after commit), `actions/results.ts` (two messages), `app/m/[token]/route.ts` (stored destination).
- **Database:** one additive migration: `one_more_sent` added to `event_type` with a partial unique index so it fires once per intent, and nullable `to_path`/`source` on `magic_token` so links in texts stay short.
- **No new dependencies:** Twilio's REST API is called with `fetch`.
- **Live data:** `emba27` is untouched. The live board has no people yet, so the US-only rule affects nobody today.
