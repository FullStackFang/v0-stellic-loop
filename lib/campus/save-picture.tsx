import 'server-only';
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { hex, SHAPES, type Ground, type Shape } from './save-shapes';

// Makes the file a person saves (openspec loop-save-picture, as approved on public/demo/mockups-avatar-download.html):
// their animal on a ground, with their name and the Loop mark. Made here, on the server, so that leaving the mark off is
// not something a browser can decide.

const font = readFile(path.join(process.cwd(), 'public/fonts/Archivo-Black.ttf'));

/** The Loop mark, as in components/LoopGlyphs.tsx: three woven rings, the top one lit. */
const AT = [[50, 35], [35.5, 60], [64.5, 60]], R = 21;
const ring = (i: number) => `M${AT[i][0] - R} ${AT[i][1]}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0`;
const markSvg = (fg: string, lit: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 100 100" fill="none"><defs>${[0, 1, 2].map(i => `<mask id="m${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="white"/><path d="${ring((i + 2) % 3)}" stroke="black" stroke-width="15.3"/></mask>`).join('')}</defs>${[0, 1, 2].map(i => `<g mask="url(#m${i})"><path d="${ring(i)}" stroke="${i ? fg : lit}" stroke-width="9"/></g>`).join('')}</svg>`;
const uri = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

/** The figure with its empty edge cut away, as large as fits a box. A small picture is made larger, and sharpened so that it does not come out blurred. */
async function fit(figure: Uint8Array, w: number, h: number): Promise<{ png: Buffer; w: number; h: number }> {
  const cut = await sharp(figure).trim().png().toBuffer({ resolveWithObject: true }), grown = Math.min(w / cut.info.width, h / cut.info.height) > 1.5;
  const sized = sharp(cut.data).resize(w, h, { fit: 'inside', kernel: 'lanczos3' });
  const { data, info } = await (grown ? sized.sharpen({ sigma: 1.2, m1: 0.6, m2: 2 }) : sized).png().toBuffer({ resolveWithObject: true });
  return { png: data, w: info.width, h: info.height };
}

/** The sticker: the figure cut out, a white edge all round as a cut sticker has, and the mark as a round tag at its corner. */
async function sticker(figure: Uint8Array, mark: boolean, ink: Ground): Promise<Buffer> {
  const { w, h } = SHAPES.sticker, pet = await fit(figure, 400, 400);
  const left = Math.round((w - pet.w) / 2) - (mark ? 10 : 0), top = Math.round((h - pet.h) / 2) - (mark ? 6 : 0);
  const clear = { create: { width: w, height: h, channels: 4 as const, background: { r: 0, g: 0, b: 0, alpha: 0 } } };
  const placed = await sharp(clear).composite([{ input: pet.png, left, top }]).png().toBuffer();
  // The figure's own outline, spread out about 14px every way and filled white. One step at a time: sharp runs the steps of one
  // pipeline in its own order, not the order they are written in.
  const soft = await sharp(placed).extractChannel('alpha').blur(9).png().toBuffer();
  const hard = await sharp(soft).threshold(14).png().toBuffer();
  const spread = await sharp(hard).blur(1.2).extractChannel(0).toBuffer();
  const edge = await sharp({ create: { width: w, height: h, channels: 3, background: '#fff' } }).joinChannel(spread).png().toBuffer();
  const tag = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="418" cy="412" r="62" fill="#fff"/><circle cx="418" cy="412" r="50" fill="${hex(ink.bg)}"/></svg>`);
  const rings = await sharp(Buffer.from(markSvg(hex(ink.fg), hex(ink.lit)))).resize(92, 92).png().toBuffer();
  return sharp(clear).composite([{ input: edge }, { input: placed }, ...(mark ? [{ input: tag }, { input: rings, left: 418 - 46, top: 412 - 44 }] : [])]).png().toBuffer();
}

export type Saved = { figure: Uint8Array; shape: Shape; ground: Ground; /** The Ink ground of the same school: what the sticker's tag is drawn in. */ ink: Ground; mark: boolean; name: string; /** Under the name on the lock screen: a person's school. */ sub: string };
/** The saved picture, as a PNG. */
export async function savedPicture({ figure, shape, ground, ink, mark, name, sub }: Saved): Promise<Buffer> {
  if (shape === 'sticker') return sticker(figure, mark, ink);
  const { w, h } = SHAPES[shape], tall = shape === 'tall', bg = hex(ground.bg), fg = hex(ground.fg);
  // Without the mark the figure of a profile picture sits in the middle.
  const cy = tall ? 1010 : mark ? 468 : 510, r = tall ? 450 : 372, pet = await fit(figure, tall ? 860 : 700, tall ? 760 : 600);
  const rings = uri(await sharp(Buffer.from(markSvg(fg, hex(ground.lit)))).png().toBuffer());
  const lockup = (y: number, size: number) => <div style={{ position: 'absolute', left: 0, top: y - size, width: w, height: size * 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- a picture file is being drawn, not a page */}
    <img src={rings} width={size * 1.5} height={size * 1.5} style={{ marginRight: size * 0.12, marginTop: -size * 0.06 }} />
    <div style={{ display: 'flex', fontSize: size, letterSpacing: -size * 0.03, color: fg }}>Loop</div>
  </div>;
  const line = (words: string, y: number, size: number, opacity = 1) => <div style={{ position: 'absolute', left: 60, top: y - size, width: w - 120, height: size * 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size, letterSpacing: -size * 0.015, color: fg, opacity, whiteSpace: 'nowrap' }}>{words}</div>;
  // A long name is set smaller, so it stays on one line.
  const big = Math.min(104, Math.floor(1560 / Math.max(1, name.length)));
  const made = new ImageResponse(<div style={{ position: 'relative', display: 'flex', width: w, height: h, background: bg, fontFamily: 'Archivo' }}>
    {/* A round of lighter ground behind the figure, so it stands off the colour. */}
    <div style={{ position: 'absolute', left: w / 2 - r, top: cy + 30 - r, width: r * 2, height: r * 2, borderRadius: r, background: fg, opacity: 0.1 }} />
    {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
    <img src={uri(pet.png)} width={pet.w} height={pet.h} style={{ position: 'absolute', left: Math.round(w / 2 - pet.w / 2), top: Math.round(cy - pet.h / 2) }} />
    {tall && line(name, 1560, big)}
    {tall && sub && line(sub, 1560 + big * 0.36 + 46, 46, 0.72)}
    {/* On a profile picture the mark sits inside the round the picture is cut to. */}
    {mark && lockup(tall ? 1786 : 920, tall ? 50 : 58)}
  </div>, { width: w, height: h, fonts: [{ name: 'Archivo', data: await font, weight: 900, style: 'normal' }] });
  return Buffer.from(await made.arrayBuffer());
}
