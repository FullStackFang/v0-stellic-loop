import 'server-only';
import sharp from 'sharp';

/**
 * A face as the pages show it: the same picture as WebP, with its clear ground kept (openspec loop-lighter-pages, D2).
 * The settings are those scripts/animals-webp.mjs makes the set's faces with. Only for serving: what is kept, and what
 * later drawings and saved pictures start from, stays the PNG, so no drawing is ever made from a lossy copy.
 */
export const asWebp = (png: Uint8Array) => sharp(png).webp({ quality: 85, alphaQuality: 100, effort: 6 }).toBuffer();
