## Context

The approved mockup draws the saved picture in the browser from a large test drawing. In the app a face is one of 40 pictures shipped at 192px (`public/animals`), or a made animal, drawn at 1024px by the model and then cut down to 192px (`frame()` in `lib/campus/custom-face.ts`); the large drawing is thrown away. A group's picture is kept at up to 1024px (`emba_group_picture.image`). Ink+ is an ask recorded in `campus_ink_plus` (`hasInkPlus`, `subscribeInkPlus` in `lib/campus/ink.ts`), added by loop-group-picture.

## Goals / Non-Goals

**Goals:**
- Saving is free with the Loop mark, for every picture that is large enough to save well.
- A picture without the mark can only be had with Ink+, and that is decided on the server.
- One pane serves a person's picture and a group's.

**Non-Goals:**
- Charging anyone.
- Frames, stickers on top, text of one's own, or other shapes.
- Making the 40 shipped animals large (see Open Questions).

## Decisions

**D1. The picture is made on the server.** One route, `/c/save`, takes the shape, the colour, whose picture, and whether the mark is on, and answers with the PNG. It is built with `ImageResponse` from `next/og`, which lays out the ground, the picture, the name and the mark, and embeds Archivo Black, the one fixed-weight Archivo the app ships (`ImageResponse` cannot use the variable one). The pane learns from the same route which grounds to offer and whether the mark may come off, so it is told nothing by the page it sits on. Alternative: draw it in the browser on a canvas, as the mockup does. Rejected: "no mark" would then be decided in the browser, where anyone can switch it.

**D2. The mark is on unless the server finds Ink+.** A request for no mark from a person without Ink+ (and who is not the admin) is refused, not answered with a quietly marked file: the pane shows the Ink+ plan instead of asking.

**D3. Three shapes, as approved.** Profile: 1080 square, the mark and "Loop" under the figure, inside the round. Lock screen: 1080 by 1920, name, school and the mark at the foot, the top third left empty for a clock. Sticker: 512 square, transparent, a white edge round the figure and the mark as a round tag at the corner. Without the mark the figure sits in the middle.

**D4. Five colours, the school's first.** The person's school colour, ink, cream, lime and sky. The sticker has no ground and offers none.

**D5. Saved from the largest picture there is.** Made animals: a new column `large bytea` on `campus_custom_picture`, written when the animal is drawn (the drawing at up to 1024px, before `frame()` cuts it down). Group pictures already have one. An animal with only its 192px picture (the ones shipped with the app, and a pet made before this change) is saved all the same, made larger: softer, most of all on the lock screen, but nobody is shut out of the feature on its first day. (Decided while building, 2026-11-19; first written as "only a large picture is offered".) The large drawing is written on its own, after the animal is kept, and a failure to write it is not a failure to make the animal: the code runs before and after the migration.

**D6. The pane.** In the account card, a row "Save your picture" opens a pane on the dark Ink plate: three shape pills, the picture as it will be saved, the colours, "With the mark" and "No mark · Ink+", and Save. The preview is the same route at a small size, so what is shown is what is saved.

**D7. Whose picture.** A person saves their own face only. A group's picture is saved by any member of the group.

## Risks / Trade-offs

- [`ImageResponse` lays out with a subset of CSS and has no blur or filters] → the three shapes use only fills, images and text; the sticker's white edge is made with sharp from the large drawing before the layout.
- [The shipped animals exist only at 192px, so their saved pictures are soft] → accepted for now (D5); see Open Questions.
- [Rendering cost on each change of colour] → the preview is small and cached by its address.

## Migration Plan

One migration adding `large bytea` to `campus_custom_picture`, applied by the founder before the code is pushed; the code from before keeps working. Rollback: put the old code back and drop the column.

## Open Questions

- The shipped animals exist only at 192px and are saved made larger. Either larger originals are found, or each is drawn again large with the same model (about 40 pictures, a few cents each). Until then they are soft.
- Whether a made animal from before should be redrawn free once, so its owner can save it sharp.
