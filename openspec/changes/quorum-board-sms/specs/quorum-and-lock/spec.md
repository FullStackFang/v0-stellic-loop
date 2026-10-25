# Spec Delta

## Purpose

Locking now texts the people it concerns.

## MODIFIED Requirements

### Requirement: Locking hands off to the notifier once
On a successful lock, the system SHALL call the notifier's `onReached` exactly once with: everyone `in`, everyone `maybe`, and the `in` people whose days did not include the locked day. When texts are configured (`sms-delivery`), each recipient SHALL get one text:
- an `in` person whose days include the locked day, or any `in` on a no-day intent: the title, the day and time when set, the count, a sign-in link, and a line inviting them to post their own;
- an `in` person whose days missed the locked day: that it is on for a day they didn't pick, the count, and "Still in?" with a sign-in link;
- a `maybe`: "{title} is on. {n} in. You said maybe. In?" with a sign-in link.

People who answered `out` SHALL get nothing. When texts are not configured, the notifier SHALL log each message and write a `text_sent` event with channel `log`.

#### Scenario: Hand-off
- **WHEN** "Suits" locks to Tue 16 with 8 in, of whom 2 cannot do Tue, and 1 maybe
- **THEN** one `onReached` call is made with 8 yeses, 2 can't-make-it, 1 maybe

#### Scenario: Texts on lock
- **WHEN** texts are configured and that lock happens
- **THEN** 6 people get the ON text, 2 get the "a day you didn't pick" text, 1 gets the maybe text, and nobody who answered out is texted
