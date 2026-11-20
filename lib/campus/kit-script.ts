// The script that puts the colours on before the page is painted, so a picked or school kit never flashes in after the
// default (components/campus/shell.tsx, app/groups/layout.tsx). It is here and not in components/campus/kit.tsx because
// a server component cannot call a function of a client file; it follows the same rule as Kit and mayWear there. The
// key is the one kit.tsx uses.

/**
 * The pick kept on this browser, if the person may wear it, or else `own`; and who may wear what, left on the page as
 * data-kits and data-any-kit. `yours` is null for someone signed out, who may wear any.
 */
export function kitScript(own: string, yours: string[] | null, any: boolean): string {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  return `try{var d=document.documentElement,o=${json(own)},y=${json(yours)},a=${any},k=localStorage.getItem('loop-kit');if(y){d.dataset.kits=y.join(' ');if(a)d.dataset.anyKit=''}d.dataset.kit=k&&(a||!y||y.indexOf(k)>=0)?k:o}catch(e){}`;
}
