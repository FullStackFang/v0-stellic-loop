## Why

A group has no picture of its own: every group wears the same Loop rings. The founder wants a group to have one picture of several animals drawn together, chosen by whoever runs the group, as the lead perk of Ink+. A live test on 2026-11-19 showed the image model the app already uses draws four of the set's animals together and keeps each one recognisable (public/demo/animal-tests/group, mockup public/demo/mockups-group-picture.html, approved by the founder the same day).

## What Changes

- Whoever runs a group (its owner or an organizer, which includes the person who started it) can open "Group picture" on the group, pick two to six animals, and have them drawn together. The animals are any the person may pick for themselves, in any mix: they need not be the members' own faces, so a group can be given its picture before anyone else has joined.
- Each ask makes two drawings. The person keeps one; the other is let go. The kept one becomes the group's picture for everyone who can open the group.
- The group's picture replaces the Loop rings wherever the group is shown on the groups pages: its head, the groups list, the "inside this group" list, and the top bar.
- Drawing is part of Ink+. There is no payment: a person who is not the admin is first asked to subscribe to Ink+ with an email, which is recorded and nothing is charged, and may then draw. The admin is never asked.
- A later phase of this change gives every group without a drawn picture a free one made of its members' faces set close.
- Not in this change: saving the picture out of the app (it waits for the "save your picture" change; the drawing is kept large enough for it), and redrawing by itself when someone joins.

## Capabilities

### New Capabilities
- `group-picture`: a group's own picture: who may make one, picking the animals, the two drawings and keeping one, where the picture shows, the Ink+ ask, and the free picture made of members' faces.

### Modified Capabilities

None. The groups pages change what they show in the group's tile, which no existing requirement describes.

## Impact

- Database: one new table for group pictures and one for Ink+ asks (a migration the founder applies by hand before the code is pushed).
- Code: a new `lib/emba/group-picture.ts` beside the group code, reusing the drawing set-up of `lib/campus/custom-face.ts` and the picker's list from `lib/campus/animal-tiers.ts`; a picture route; a "Group picture" pane on the group's page; the group tile on `app/groups` pages and the bar.
- Spend: two pictures an ask through the Vercel AI Gateway (`openai/gpt-image-2.6-flare`), a few cents each.
