## Context

A pet from a photo is drawn by `drawFace`: one reference picture plus one short line, sent to `openai/gpt-image-2.6-flare`, then put through `frame`. `makeCustomFace` stores the result, counts it and makes it the face.

## Decisions

- **Same path as a pet from a photo.** `makeFromBase` checks the base and calls `makeCustomFace` with a different `Draw` (`drawFromBase`). That gives the same storage, large drawing, face, and the admin's list for free. The picture is counted as made, but Ink+ and the admin have no limit, so they never see a count.
- **The base is the only picture sent.** It is the made animal's large drawing (`customFaceLarge`) or the shipped PNG, flattened on white at 1024. The words are: "Keep this toy figure exactly as it is: its colours, markings, face, pose and style. Change only this: {line}. Nothing else in the picture. Transparent background, no shadow." There is no `look` call, because the base is already one of ours.
- **Checked on the server** (`baseOf`):
  - Ink+ is required (admin exempt).
  - A shipped base must have tier `premium` in `builtAnimals`.
  - A made base must be the person's own and not let go, or have tier `premium`.
  - The admin may use any base.
- **The page's list** (`screen.tsx`): their own made animals plus `picks.premium`. For the admin it adds every pick.

## Risks / Trade-offs

- [The face or style drifts a little on each redraw] → The founder judges this by drawing. If it drifts, try a masked edit or a stricter line.
- [Shipped animals are 192px, so the base is soft] → The model redraws it at 1024. If results are poor, the large redraws of the shipped PNGs (open in loop-save-picture) would fix it.
