## Why

A person's animal lives only inside Loop. The founder wants people to take it out, as a profile picture, a lock screen or a sticker, because every saved picture that carries the Loop mark is an advert, and taking the mark off is a reason to want Ink+. The flow was mocked and approved on 2026-11-19 (public/demo/mockups-avatar-download.html), and the Ink page already promises it ("Take it with you.").

## What Changes

- "Save your picture" in the account card: pick one of three shapes and one of five ground colours, and save a PNG. Free for everyone, with the Loop mark on it.
- "No mark" beside it is Ink+: a person who has not asked for Ink+ is shown the Ink+ plan, subscribes with an email (recorded, nothing charged), and may then save without the mark.
- The three shapes: a 1080 square for a profile picture, with the mark inside the round a profile is cut to; a 1080 by 1920 lock screen or story, with the person's name, their school and the mark; a 512 cut-out sticker with no ground, the mark as a small tag at its corner.
- A group's picture (change loop-group-picture) is saved the same way, with the group's name where a person's name would be.
- Made animals are kept large from now on, so they can be saved sharp. Until now only a 192px copy was kept.
- Not in this change: any other customization (frames, text of one's own), and printing.

## Capabilities

### New Capabilities
- `save-picture`: saving a person's or a group's picture out of the app: the shapes, the colours, the Loop mark, and taking the mark off with Ink+.

### Modified Capabilities

None. Keeping a made animal large changes what is stored, not what any requirement says.

## Impact

- Database: one new column on `campus_custom_picture` for the large drawing (a migration the founder applies by hand). Ink+ asks use `campus_ink_plus`, which loop-group-picture adds.
- Code: `lib/campus/custom-face.ts` keeps the large drawing; a route that renders the saved picture on the server; a "Save your picture" pane in the account card (`components/campus`); the same pane offered on a group's picture.
- No new spend: nothing is drawn again to save a picture.
