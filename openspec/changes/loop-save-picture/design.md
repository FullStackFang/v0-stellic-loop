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

**D1. The picture is made on the server.** One route, `/c/save`, takes the shape, the colour, whose picture, and whether the mark is on, and answers with the PNG. It is built with `ImageResponse` from `next/og`, which lays out the ground, the picture, the name and the mark, and embeds the Archivo font the app already ships. Alternative: draw it in the browser on a canvas, as the mockup does. Rejected: "no mark" would then be decided in the browser, where anyone can switch it.

**D2. The mark is on unless the server finds Ink+.** A request for no mark from a person without Ink+ (and who is not the admin) is refused, not answered with a quietly marked file: the pane shows the Ink+ plan instead of asking.

**D3. Three shapes, as approved.** Profile: 1080 square, the mark and "Loop" under the figure, inside the round. Lock screen: 1080 by 1920, name, school and the mark at the foot, the top third left empty for a clock. Sticker: 512 square, transparent, a white edge round the figure and the mark as a round tag at the corner. Without the mark the figure sits in the middle.

**D4. Five colours, the school's first.** The person's school colour, ink, cream, lime and sky. The sticker has no ground and offers none.

**D5. Only a large picture is offered.** A picture is saved from its large drawing. Made animals: a new column `large bytea` on `campus_custom_picture`, written when the animal is drawn (the drawing at up to 1024px, before `frame()` cuts it down). A made animal from before has none; its pane offers "Redraw your pet" in place of saving. Group pictures already have one.

**D6. The pane.** In the account card, a row "Save your picture" opens a pane on the dark Ink plate: three shape pills, the picture as it will be saved, the colours, "With the mark" and "No mark · Ink+", and Save. The preview is the same route at a small size, so what is shown is what is saved.

**D7. Whose picture.** A person saves their own face only. A group's picture is saved by any member of the group.

## Risks / Trade-offs

- [`ImageResponse` lays out with a subset of CSS and has no blur or filters] → the three shapes use only fills, images and text; the sticker's white edge is made with sharp from the large drawing before the layout.
- [People wearing one of the 40 shipped animals cannot save yet] → said plainly in the pane, with the way to get a picture that can be saved (make a pet); see Open Questions.
- [Rendering cost on each change of colour] → the preview is small and cached by its address.

## Migration Plan

One migration adding `large bytea` to `campus_custom_picture`, applied by the founder before the code is pushed; the code from before keeps working. Rollback: put the old code back and drop the column.

## Open Questions

- The 40 shipped animals exist only at 192px. Either larger originals are found, or each is drawn again large with the same model (about 40 pictures, a few cents each), or saving stays for made animals and group pictures. This decides how many people can use the feature on day one.
- Whether a made animal from before should be redrawn free once, so its owner can save it.
