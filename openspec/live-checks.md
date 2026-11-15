# Live-site checks still owed

Three changes were archived on 2026-11-15 after the deploy of merge `5a8442a`, with these founder checks not yet done. Each was covered on made-up people by `npm run groups:browser`, not on the live site.

## Groups (from `loop-group-tree-and-start-form`)

- Build EMBA 2027 › Team 1 › NBAE 6830 and walk it as an outer member and as an inner-only member.
- Open Members on a real group, signed in.
- With Google Drive connected in your own Claude: read a group that holds a Drive link, draft a doc and file it.
- Database: `drop table if exists emba_drive_folder;` on `supabase-loop`, if the earlier migration version created it.

## Events and asks (from `loop-club-events-and-asks`)

- Demo 1: add an event, mark interest from the site and from Claude.
- Demo 2: ask from the site and from Claude, send the link to a WhatsApp chat, answer from a second account, see who is missing, send the reminder.
- Pilot comparison with one real group: the same kind of question as a Loop ask and as a WhatsApp poll; record answers within 48 hours for each.

## Page speed (from `loop-faster-pages`)

- Signed in: a team page looks and behaves as before, with one sign-in check per page view.
- Time a team page. By count the slowest path is 28 statements in a row, about 2.4 seconds at 85ms; it has not been measured signed in.

## Decisions that became spec without a founder answer

- Two-part handles at any depth.
- Only owners and organizers start inner groups.
- Members of an outer group count as members of the groups inside it.
- A person invited by email gets no email from Loop.
- A member who does not manage a group sees only their own row on Members.
