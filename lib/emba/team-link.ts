// A filed output is a pointer. Loop never fetches it; it only decides whether
// the text is a plain https link to a named host, and stores one normal form.

const label='[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?';
const hostPattern=new RegExp(`^(${label}[.])+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$`);
const safe=/^[\]A-Za-z0-9._~:/?#@!$&'()*+,;=%[-]*$/;
export const MAX_URL=500;
export type LinkProblem='not_https'|'has_login'|'has_port'|'host_not_a_name'|'too_long'|'not_a_link';

/** Returns the stored form of a link, or the reason it is refused. */
export function normaliseLink(raw:string):{url:string;host:string}|{problem:LinkProblem} {
 const text=raw.trim();
 // Anything a person cannot see in the link is a reason to refuse it, not to clean it.
 if(!text||/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\s]/u.test(text))return {problem:'not_a_link'};
 if(text.length>MAX_URL*4)return {problem:'too_long'};
 let parsed:URL;
 try{parsed=new URL(text);}catch{return {problem:'not_a_link'};}
 if(parsed.protocol!=='https:')return {problem:'not_https'};
 if(parsed.username||parsed.password)return {problem:'has_login'};
 if(parsed.port)return {problem:'has_port'};
 const host=parsed.hostname;
 // A DNS name with a dot: no IP address, no bare name, no punycode look-alike.
 if(host.length>253||!hostPattern.test(host)||host.split('.').some(part=>part.startsWith('xn--')))return {problem:'host_not_a_name'};
 // The parser has already escaped spaces and non-ASCII; escape the few ASCII characters it leaves that could break a line of text.
 const rest=(parsed.pathname+parsed.search+parsed.hash).replace(/[^\]A-Za-z0-9._~:/?#@!$&'()*+,;=%[-]/g,char=>encodeURIComponent(char).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`));
 const url=`https://${host}${rest}`;
 if(!safe.test(rest))return {problem:'not_a_link'};
 if(url.length>MAX_URL)return {problem:'too_long'};
 return {url,host};
}

// Well-known document services. Used only to label a link; never to refuse one.
// Redirectors and pages anyone can host under a well-known name (short links, sites, user content) are left out on purpose.
const known=['docs.google.com','drive.google.com','sharepoint.com','onedrive.live.com','office.com','dropbox.com','box.com',
 'notion.so','figma.com','canva.com','miro.com','airtable.com','github.com','gitlab.com','overleaf.com','loom.com','youtube.com','zoom.us'];
export const recognisedHost=(host:string)=>known.some(name=>host===name||host.endsWith(`.${name}`));
export const hostOf=(url:string)=>url.slice('https://'.length).split(/[/?#]/)[0];
