// The script that puts the colours on before the page is painted, so a picked or school kit never flashes in after the
// default. Kit (components/campus/kit.tsx) draws it, from the server only; it follows the same rule as Kit and mayWear
// there. The key is the one kit.tsx uses.

/** Where the colours last put on are kept on this browser, for the loader of the next fresh load (components/loading/fresh-wait.tsx). */
export const WORN = 'loop-kit-worn';

/**
 * The pick kept on this browser, if the person may wear it, or else `own`; and who may wear what, left on the page as
 * data-kits and data-any-kit. `yours` is null for someone signed out, who may wear any. With `worn`, the colours this
 * browser last wore come before `own`: a page built once for everyone (Terms, Privacy) cannot know the person's school.
 */
export function kitScript(own: string, yours: string[] | null, any: boolean, worn = false): string {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  return `try{var d=document.documentElement,o=${json(own)},y=${json(yours)},a=${any},k=localStorage.getItem('loop-kit');${worn ? `o=localStorage.getItem('${WORN}')||o;` : ''}if(y){d.dataset.kits=y.join(' ');if(a)d.dataset.anyKit=''}d.dataset.kit=k&&(a||!y||y.indexOf(k)>=0)?k:o;localStorage.setItem('${WORN}',d.dataset.kit)}catch(e){}`;
}
