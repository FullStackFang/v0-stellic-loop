// Saving a picture out of the app (openspec loop-save-picture): the shapes and the ground colours. Read by the pane in
// the browser and by the server that makes the file, so it imports nothing.

export const SHAPES = {
  profile: { name: 'Profile', w: 1080, h: 1080, fits: '1080 × 1080 · Instagram, Discord, WhatsApp', file: 'profile' },
  tall: { name: 'Lock screen', w: 1080, h: 1920, fits: '1080 × 1920 · lock screen or story', file: 'lock-screen' },
  sticker: { name: 'Sticker', w: 512, h: 512, fits: '512 × 512, no ground · iMessage, WhatsApp, Discord', file: 'sticker' },
} as const;
export type Shape = keyof typeof SHAPES;
export const isShape = (given: unknown): given is Shape => typeof given === 'string' && Object.hasOwn(SHAPES, given);

/** A colour as lightness (0 to 1), chroma and hue: the same numbers app/c/campus.css writes as oklch(). */
type Lch = readonly [l: number, c: number, h: number];
const PAPER: Lch = [0.993, 0.004, 117], ON_INK: Lch = [0.994, 0.003, 230];
/** Each school's colours, as in app/c/campus.css under [data-kit]. */
const KIT: Record<string, { field: Lch; ink: Lch; action: Lch }> = {
  loop: { field: [0.964, 0.19, 117], ink: [0.25, 0.07, 252], action: [0.476, 0.13, 250] },
  cornell: { field: [0.82, 0.12, 38], ink: [0.24, 0.035, 30], action: [0.485, 0.185, 27] },
  columbia: { field: [0.87, 0.075, 235], ink: [0.25, 0.06, 255], action: [0.46, 0.14, 255] },
  cuny: { field: [0.88, 0.13, 88], ink: [0.24, 0.08, 265], action: [0.38, 0.18, 264] },
  nyu: { field: [0.85, 0.09, 305], ink: [0.24, 0.08, 305], action: [0.4, 0.2, 305] },
};
/** A ground a picture sits on: its colour, what is written on it, and the one lit ring of the Loopd mark. */
export type Ground = { key: string; name: string; bg: Lch; fg: Lch; lit: Lch };
/** Grounds that belong to no school. A school whose own colour is one of them is offered the next instead. */
const OTHERS: (Ground & { kit: string })[] = [
  { key: 'lime', name: 'Lime', kit: 'loop', bg: KIT.loop.field, fg: KIT.loop.ink, lit: KIT.loop.action },
  { key: 'sky', name: 'Sky', kit: 'columbia', bg: KIT.columbia.field, fg: KIT.columbia.ink, lit: PAPER },
  { key: 'coral', name: 'Coral', kit: 'cornell', bg: KIT.cornell.field, fg: KIT.cornell.ink, lit: PAPER },
];
/** The five grounds offered to a person of a school, their school's own first. */
export function grounds(kit: string): Ground[] {
  const slug = Object.hasOwn(KIT, kit) ? kit : 'loop', own = KIT[slug];
  return [
    { key: 'school', name: 'Your school', bg: own.field, fg: own.ink, lit: slug === 'loop' ? own.action : PAPER },
    { key: 'ink', name: 'Ink', bg: own.ink, fg: ON_INK, lit: own.field },
    { key: 'cream', name: 'Cream', bg: [0.955, 0.03, 85], fg: own.ink, lit: own.action },
    ...OTHERS.filter(each => each.kit !== slug).slice(0, 2).map(({ key, name, bg, fg, lit }) => ({ key, name, bg, fg, lit })),
  ];
}
/** For a stylesheet. */
export const css = ([l, c, h]: Lch) => `oklch(${+(l * 100).toFixed(1)}% ${c} ${h})`;
/** For a picture file, which knows no oklch: the nearest colour a screen shows, as #rrggbb. */
export function hex([l, c, h]: Lch): string {
  const a = c * Math.cos(h * Math.PI / 180), b = c * Math.sin(h * Math.PI / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3, M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3, S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const part = (linear: number) => { const shown = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, shown)) * 255).toString(16).padStart(2, '0'); };
  return `#${part(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S)}${part(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S)}${part(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S)}`;
}
/** Where the saved picture is made: for the pane's preview and for the file itself. */
export const saveHref = (shape: Shape, ground: string, mark: boolean, of: { orgId: string; loopId: string } | null = null, small = false) =>
  `/c/save?shape=${shape}&ground=${ground}${mark ? '' : '&mark=0'}${of ? `&org=${of.orgId}&group=${of.loopId}` : ''}${small ? '&small=1' : ''}`;
/** Where the pane asks which grounds this person is offered: their school's own first. */
export const GROUNDS_HREF = '/c/save?grounds=1';
/** A ground as the pane is told of it: its key, its name and its colour for a stylesheet. */
export type Swatch = { key: string; name: string; colour: string };
