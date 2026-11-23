# Loopd Who's in: design

*2026-11-22. Status: draft. Direction set by the founder; not approved to build,
and no look is approved. Mockups made on the way, for reference only:
`/demo/mockups-who-is-in.html` (the ask on its own) and
`/demo/mockups-when-and-in.html` (rejected: it tied Who's in to the poll as
"step 2 of 2").*

## Intent

A second free tool beside Loopd When. When answers "what time works?". Who's
in answers "who is actually coming?". Someone makes an ask with a time already
known, shares one link, and people tap an answer.

## What the founder decided

- **A completely separate ask from When.** "If you use when2meet, you get a
  time. Great." A poll ends when its time is set. It does not turn into a
  Who's in page, and it carries no "step 2".
- **The tie is a hand-off, not a merge.** Once a poll's time is settled, its
  organizer can send out a Who's in for that time. It is their choice, one
  press, and it makes a new ask with its own link.
- **Who's in may also start from the platform itself**, not only from a poll
  (a group's event, a campus plan). Which surfaces, and in what order, is open.
- **Each ask has its own rule for when it is settled.** When has its threshold
  already. Who's in gets its own (for example "on if 5 are in").
- **Where is not part of this.** It stays a later, separate tool.

## Carried over from When (assumed, to confirm)

- Nobody needs an account to answer: a name beside the action, remembered on
  that browser (`lib/when/guests.ts`), an initial in place of an animal, and
  answers that move to the account on sign-in.
- One link, pasted into a chat, with a picture of the ask as a ticket.
- The Loopd Campus look, phone first, nothing that scrolls inside a card.

## Open questions for the founder

1. Does painting a time in the poll count someone in, or is everyone asked
   afresh? (The rejected mockup asked afresh.)
2. Who gets the Who's in when it is sent from a poll: the people who answered
   the poll, or only whoever the organizer passes the link to?
3. What happens when the minimum is not reached by the day: called off and
   everyone told, or left to the organizer?
4. Does "Maybe" count toward the minimum? Are plus-ones counted?
5. Which platform surfaces start a Who's in first: a team's event, a campus
   plan, an Imprint club?
6. Is it one table of asks shared by When and Who's in, or its own tables?
   (Builder's call unless the answers above force it.)

## Not in scope

Where, payments, tickets, check-in at the door, reminders beyond what When
already sends, and any change to the poll's own pages beyond the one
"send a Who's in" action on a settled poll.

## Next

Answers to the open questions, then a mockup of the ask on its own and of the
hand-off on a settled poll, then the founder's yes before any build.
