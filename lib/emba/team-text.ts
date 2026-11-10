import {z} from 'zod';

// Text a member or organizer writes is later shown inside assistant results,
// one item per line. Everything stored through here is one visible line.
const invisible=/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\u034F\u115F\u1160\u180E\u2800\u3164\uFFA0\uFFFC\u{E0000}-\u{E007F}]/gu;

/** NFC, line breaks to spaces, no control/format/bidi/zero-width/filler/unassigned/private-use characters, no stacked marks, single spaces. */
export function singleLine(value:string):string {
 return value.normalize('NFC')
  .replace(/[\r\n\t\v\f\u0085\u2028\u2029]+/g,' ')
  .replace(invisible,'')
  .replace(/(\p{M}{3})\p{M}+/gu,'$1')
  .replace(/\p{Zs}+/gu,' ')
  .normalize('NFC')
  .trim();
}
const points=(value:string)=>[...value].length;
/** A cleaned single line of 1..max code points that contains at least one letter or digit. */
export const lineSchema=(max:number)=>z.string().max(max*8).transform(singleLine)
 .refine(value=>points(value)>=1&&points(value)<=max&&/[\p{L}\p{N}]/u.test(value));

// Names an assistant or a chat app could read as addressing a crowd or Loop itself.
const reserved=new Set(['all','anyone','channel','everyone','here','loop','me','nobody','team','you']);
/** A slug or handle: lowercase letters, digits and hyphens, 2 to 48 characters, not a reserved word. */
export const nameSchema=z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/).refine(value=>!reserved.has(value));

/** The name shown for an assistant. A client id can be a web address, which must not be printed as one. */
export function assistantName(clientId:string):string {
 if(clientId==='https://claude.ai/oauth/mcp-oauth-client-metadata')return 'Claude';
 try{return new URL(clientId).hostname||clientId;}catch{return clientId;}
}
