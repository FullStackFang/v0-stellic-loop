import type { ReactNode } from 'react';
import type { Me } from './ending';

// What the last page's top bar showed, kept in memory so the loading state of the next page can draw the same bar
// (openspec loop-loading-seats, design D3): the bar is drawn by each page, so without this a page change would take it away.
// A plain module variable and not sessionStorage: it must be empty on a fresh load, so the first paint agrees with what
// the server sent.

export type LastBar = { home: string; on?: string; member: boolean; plus?: boolean; /** The end of the bar as it was drawn: the account card, or the way in. */ account: ReactNode };
let bar: LastBar | null = null, me: Me = {}, going: string | null = null;

/** The bar says what it shows each time it is drawn. Whatever link was pressed has now arrived. */
export function rememberBar(next: LastBar) { bar = next; going = null; }
/** Whose face, plan and blot the loaders show: said by whatever draws the person's own avatar. */
export function rememberMe(next: Me) { me = next; }
/** A link of the bar was pressed: the loading state marks it, and it holds the small one. */
export function pressed(href: string) { going = href; }
export const lastBar = () => ({ bar, me, going });
/** For tests: as on a fresh load. */
export function forget() { bar = null; me = {}; going = null; }
