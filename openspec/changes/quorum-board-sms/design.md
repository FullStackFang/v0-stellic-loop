## Context

Every message the product sends is already named once in `lib/notify/index.ts`: `code`, `onReached`, `dropped`, `oneMore`, `maybeNudge`, `magicLink`. Only `LogNotifier` exists. It logs a JSON line and writes a `text_sent` event with channel `log`. Callers:

- `lib/identity.ts` `issueCode` calls `code` inside the respond/post/board transaction;
- `lib/after.ts` calls `onReached` after a lock commits and `dropped` after a yes leaves an ON intent;
- nothing calls `oneMore`, `maybeNudge` or `magicLink` yet.

The `/m/<token>` route exists and sets the session from an unused, unexpired `magic_token`, but nothing issues tokens outside the local seed. `person.sms_opt_out` exists and nothing sets it.

DESIGN.md fixes the product rules this change must keep:
- verification only where impersonation is possible (new numbers need no code);
- the "one more" text fires at two short, once per intent;
- the ON text ends with a post-your-own line (M3);
- the maybes get one text on ON (M6);
- no text on idle, ever;
- STOP is honored except for a sign-in code the person asks for.

The founder chose US-only for now (2026-10-24) and no +1s in this change.

## Goals / Non-Goals

**Goals:**
- People with US numbers get the sign-in code, the ON text, the maybe nudge, the drop text and the one-more text on their phones.
- Tapping a text that is meant for one person signs that person in.
- A send failure is visible where it matters (sign-in code) and harmless everywhere else.
- Tests and local dev never need Twilio.

**Non-Goals:**
- WhatsApp, non-US numbers, the weekly digest, inviting a pasted list, +1s, quiet hours.
- Delivery receipts (Twilio status callbacks) and inbound replies other than STOP.
- Any visual change. The only UI change is two error strings.

## Decisions

**Twilio's REST API through `fetch`, not the `twilio` package.** One call, `POST /2010-04-01/Accounts/{sid}/Messages.json`, with Basic auth and the form fields `To`, `MessagingServiceSid` and `Body`. The SDK is large and adds nothing for a single endpoint. *Alternative:* the official SDK. Rejected for this slice; revisit if inbound webhooks need its signature validation.

**The notifier is chosen by env.** `notifier(q)` returns a `TwilioNotifier` when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID` are all set; otherwise it returns `LogNotifier` exactly as today. `setNotifier` stays for tests.
- Local runs, tests and preview deploys (without the vars) never text anyone.
- Production texts as soon as the founder sets the three vars.
- *Alternative:* a `NOTIFIER=twilio` flag. Rejected: one more var that can disagree with the credentials.

**One send path, one event per message.** `TwilioNotifier` resolves each recipient person id to phone, name and `sms_opt_out`, then for each recipient:
1. skips them (event status `skipped`, reason `opted_out` or `not_us`) when they have opted out or the number is not `+1`;
2. otherwise posts to Twilio;
3. writes one `text_sent` event with channel `sms`, the kind, the person, the Twilio message sid, and status `sent` or `failed` (with Twilio's error code).

The code is never written to an event or a log line. A failed or skipped message is still one event, so `/stats` can count attempts.

**Opt-out comes from Twilio, not from us.** The Messaging Service's default opt-out handling answers STOP/START itself and refuses later sends with error 21610. On 21610 the notifier sets `person.sms_opt_out = true`; from then on only `code` is attempted for that person (a code they asked for is the exception DESIGN.md names). No inbound webhook in this slice. *Alternative:* our own `/api/sms/inbound` webhook. Rejected for now: it needs Twilio signature validation and duplicates what the Messaging Service already does. *Gap:* if the person texts START, we don't learn of it until a later code send succeeds, so a successful `code` send clears `sms_opt_out`.

**The sign-in code fails visibly.** `Notifier.code` returns `{ sent: boolean }`. `issueCode` deletes the `otp_code` row it just wrote when the send fails, and `withIdentity` returns a new error `code_not_sent` instead of `needs_code`. The user sees "We couldn't text that number. Try again." The send stays inside the transaction because the action must know the outcome before it answers. A Twilio call adds about 300 ms to that one request. The existing `identify` and `verify` rate limits already cap code requests per phone and IP.

**Personal texts carry a short sign-in link; the one-more text carries a share link.**
- The ON, can't-make-it, maybe and drop texts are for one person. Each gets a fresh magic token, which expires in 24 hours and works once.
- The token row stores its destination and source (two new nullable columns, `to_path` and `source`), so the link is just `<app>/m/<token>`. The route uses the stored values when present and still accepts `?to=&src=` (the existing spec). This keeps a text with a link under two SMS segments.
- The token shrinks from 32 to 16 random bytes (22 base64url characters). That is still 128 bits, and only its hash is stored.
- The one-more text says "Send it to someone", so it will be forwarded. It must never carry a sign-in token. It carries a share link minted for the recipient (`/p/<id>?s=<token>`, a `share_minted` event with that person as sharer), so the forwards are attributed to them.
- *Alternative:* no magic links at all, and a code on every new device. Rejected: DESIGN.md wants tapping a text to never ask for a code. *Alternative:* a magic link in the one-more text too. Rejected: whoever taps a forwarded link first would be signed in as the sender.

**What each recipient gets on ON.** `onReached` already carries yeses, can't-make-it (a subset of yeses) and maybes, all as person ids. Copy, with `{day}` from `shortLabel` and `{time}` only when set:
- **in, day works:** "{title} is on: {day}, {time}. {n} in. {link} Got an idea? Post it on the board."
- **in, missed the day:** "{title} is on for {day}, a day you didn't pick. {n} in. Still in? {link}"
- **in, no-day intent:** "{title} is on. {n} in. {link} Got an idea? Post it on the board."
- **maybe:** "{title} is on. {n} in. You said maybe. In? {link}"

The person who locked it gets the ON text like everyone else. They just locked it, but the text holds their sign-in link and is the record. The poster's "list" (DESIGN.md) is the proposal page itself, which the link opens. There is no separate list text.

**Drop text.** Unchanged trigger, now texted to the poster: "{name} dropped out of {title}. {n} in. {link}". `{name}` respects the name switch ("Someone" when off).

**One-more trigger.** After a response commits with answer `in` on an `open` intent:
- with `min = min_count ?? 4` and `n` = the number of yeses, the text fires when `min - 2 <= n < min` and `n >= 2`. Two is the poster plus one: a fresh post never pings its own poster.
- Once per intent is enforced by the database, through a new event type `one_more_sent` and a partial unique index like `event_threshold_once`. The respond action inserts it with `on conflict do nothing` inside its transaction and calls `notifyOneMore` after commit only when the insert returned a row.
- Recipients are the poster and every yes. The copy is "{n} of {min} for {title}. {k} more and it's on. Send it to someone: {share link}", with "One more" when k = 1.
- On a needs-a-day intent `n` counts yeses, matching how the card reads "7 in · needs 8". The best day might still be short; that is accepted, because the text is a nudge, not a promise.

**US-only input.** `normalizePhone` keeps returning E.164 for any valid number. A new `isUsNumber(e164)` check (`+1` and valid for region US) runs in `withIdentity`, which returns a new error `not_us`: "US numbers only for now." Existing non-US people (none live) keep working but are never texted.

## Risks / Trade-offs

- [10DLC registration is slow or rejected] → Until it is approved, the founder runs a trial account that texts only verified numbers. The app is the same either way. Start registration the day this change is approved.
- [A forwarded ON text signs the forwardee in as the recipient] → The link works once and expires in 24 hours; the one-more text, the one meant for forwarding, has no token. The worst case is someone changing another person's answer on one intent. DESIGN.md accepts low-stakes identity; revisit if it happens.
- [A Twilio outage during a lock] → The lock has already committed; texts fail with events recorded and are not retried. The board still shows ON. Accepted for v1; a retry job is a later change.
- [Cost] → About $0.008 per US segment plus carrier fees; a 60-person board with a few locks a week is a few dollars a month.
- [Code send inside the transaction holds a DB connection for the Twilio round trip] → It happens only on the known-number, new-device path, which is rate-limited.
- [Opt-out state can lag if someone texts START] → A successful code send clears it; otherwise they stay quiet, which is the safe side.

## Migration Plan

1. Migrations `0006_sms.sql` and `0007_sms_once.sql`, all additive:
   - `one_more_sent` in `event_type` (0006), with its partial unique index (0007: Postgres refuses a new enum value in the transaction that adds it);
   - nullable `to_path` and `source` on `magic_token` (0006).
   The founder runs them, one after the other as separate runs, in the Supabase SQL editor (auto mode blocks applying it from here), or adds the permission rule.
2. Deploy the code. Without the Twilio vars production keeps logging, so the deploy is safe before 10DLC is approved.
3. When Twilio is ready, set the three vars in Vercel and redeploy. Check by asking for a sign-in code on a second device with a verified number.
4. Rollback: remove the vars (back to logging). The migration needs no rollback.

## Open Questions

- Should the ON text also go to people who answered "out"? DESIGN.md says no; this design follows it.
- Quiet hours: a 2 a.m. lock texts 2 a.m. Fine for a cohort, for now.
