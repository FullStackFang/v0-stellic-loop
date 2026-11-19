import type { Q } from '../db';

// Loop Ink, the paid plan (openspec/changes/loop-ink-placements). This file is read by the browser too (the bar links
// to INK_PAGE), so it imports nothing that is for the server only.

/** Where every placement leads. The approved mockup, until there is a real page: then this one line changes. */
export const INK_PAGE = '/demo/mockups-premium.html';

/**
 * Whether a person has Ink. There is no payment yet, so it means they asked to subscribe. The campus screen reads the
 * same fact for many people at once as `asked` in customFaces (lib/campus/custom-face.ts): the day payment exists, both change.
 */
export const hasInk = async (q: Q, personId: string) => (await q.query('select 1 from campus_custom_face where person_id=$1', [personId])).rows.length > 0;
