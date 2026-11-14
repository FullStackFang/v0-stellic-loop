import { normaliseLink } from './team-link';

// What the start-a-group box does with what a person types or pastes. The box in the browser and the
// server action both use this, so the lanes a person sees are the lanes that get saved.

/** How much one start may carry. Links and the announcement are team writes, which are limited per hour. */
export const START_LIMITS = { files: 5, links: 10, people: 30, bytes: 3.5 * 1024 * 1024 } as const;


const EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/** A plain email address in the form invitations are matched on, or null. */
export const emailOf = (text: string) => { const email = text.trim().toLowerCase(); return email.length <= 254 && EMAIL.test(email) ? email : null; };

export type Sorted = { links: string[]; emails: string[]; note: string };
/**
 * Sorts typed or pasted text: web addresses to links,
 * email addresses to people, and whatever words are left to the note. An address that is not a usable link is dropped.
 */
export function sortInput(text: string): Sorted {
  const links: string[] = [], emails: string[] = [], kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const words: string[] = [];
    for (const word of line.split(/\s+/).filter(Boolean)) {
      const token = word.replace(/^[<(["']+|[>)\]"',;]+$/g, '');
      if (/^https?:\/\//i.test(token)) {
        const link = normaliseLink(token.replace(/[.]+$/, ''));
        if ('problem' in link) continue;
        if (!links.includes(link.url)) links.push(link.url);
        continue;
      }
      const email = emailOf(token.replace(/[.]+$/, ''));
      if (email) { if (!emails.includes(email)) emails.push(email); continue; }
      words.push(word);
    }
    if (words.length) kept.push(words.join(' '));
  }
  // Words left around lifted addresses ("and", a stray comma) are not a note.
  const note = kept.join('\n').trim();
  return { links, emails, note: /[\p{L}\p{N}]{2}/u.test(note) && !/^(and|,|;|&|\s)+$/i.test(note) ? note : '' };
}

/** A name as a handle: lowercase letters, digits and single hyphens. */
export const slugOf = (name: string) => name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
/** The title a link is saved under until someone gives it a better one: where it points, without the scheme. */
export const linkTitle = (url: string) => {
  const { hostname, pathname } = new URL(url);
  let path = pathname;
  try { path = decodeURI(pathname); } catch { /* a stray percent sign: show the path as written */ }
  return `${hostname.replace(/^www\./, '')}${path === '/' ? '' : path}`.slice(0, 100);
};
