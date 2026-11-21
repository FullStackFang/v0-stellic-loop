## Why

A person who likes an animal can't change one thing about it: "Draw again" starts over from a pet photo, which Loopd does not keep. The founder wants Ink+ members to use an animal as the base and describe the change (2026-11-21). It works like making a pet from a photo, but starts from another pet instead of a photo.

## What Changes

- "Create your own" gets **Start from another pet** for Ink+ and the admin: pick a base, write what should change, confirm, and it draws. The result is a new animal of their own and becomes their face, exactly as a pet from a photo does.
- Allowed bases: their own made animals and Ink (premium) animals. Core animals and mascots are not allowed. The admin can use any animal.
- No mockup, no keep-one step, no ready-made chips, no migration (founder: "just build it").

## Capabilities

### New Capabilities
- `dress-up`: who may start from which animal, and what is drawn.

### Modified Capabilities
- (none)

## Impact

- `lib/campus/custom-face.ts`: `drawFromBase`, `baseOf` and `makeFromBase`. They reuse `makeCustomFace`, `frame`, `keepLarge` and `plain`.
- `app/c/actions.ts`: `makeFaceAction` takes a `base` in place of a photo.
- `components/campus/own-face.tsx`, `components/campus/screen.tsx`: the step and the list of bases.
- No database change.
