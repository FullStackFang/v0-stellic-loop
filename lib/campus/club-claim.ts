import 'server-only';
import type { Db, Q } from '../db';
import { guardedFetch, type GuardDeps } from '../guarded-fetch';

// Claiming a club (public/demo/mockups-organizer-flow.html). A school keeps each registered club's officers on its
// CampusGroups site, on a page anyone can read. A person signed in with their school email who pastes their club's
// link is checked against that page: with their name on it the club is theirs at once, and otherwise they may ask the
// admin to look. The admin can approve, turn down or take back any claim (app/c/admin), so a wrong match is undone.
// A matching name is not proof of who someone is: every automatic approval is listed for the admin, marked as one.

/** What may be pasted: a club's page on a school's CampusGroups site. */
export type ClubLink = { /** The club's page, the form a claim is kept under. */ page: string; /** Its public officer list. */ officers: string; host: string };
export function clubLink(raw: unknown): ClubLink | null {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { return null; }
  const host = url.hostname.toLowerCase(), key = url.pathname.split('/').filter(Boolean)[0] ?? '';
  if (!/^[a-z0-9-]+\.campusgroups\.com$/.test(host) || !/^[A-Za-z0-9_-]{1,80}$/.test(key)) return null;
  return { page: `https://${host}/${key}/`, officers: `https://${host}/${key}/officers/`, host };
}

export type Officer = { name: string; role: string | null };
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) =>
  code[0] === '#' ? String.fromCodePoint((code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))) || 32) : ENTITIES[code.toLowerCase()] ?? whole).replace(/\s+/g, ' ').trim();

/** The club's name and its officers, from the text of its officer page. Pure: no request is made here. */
export function readOfficers(html: string): { club: string | null; officers: Officer[] } {
  const title = /<h1[^>]*class="[^"]*header-cg--h2[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(html), club = title ? plain(title[1]).slice(0, 200) : '';
  const officers = html.split(/<table[^>]*class="[^"]*\bmember_card\b[^"]*"/i).slice(1).flatMap((card): Officer[] => {
    const name = /class="[^"]*\becg_large_txt\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(card), role = /<td[^>]*class="[^"]*\bother\b[^"]*"[^>]*>\s*<strong>([\s\S]*?)<\/strong>/i.exec(card);
    const named = name ? plain(name[1]).slice(0, 120) : '', does = role ? plain(role[1]).slice(0, 120) : '';
    return named ? [{ name: named, role: does || null }] : [];
  });
  return { club: club || null, officers: officers.slice(0, 60) };
}

const words = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’-]/g, '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
/** Whether two names are the same person's: the same first and last word, whatever sits between, accents and case aside. One word alone never matches. */
export function sameName(a: string, b: string): boolean {
  const one = words(a), two = words(b);
  return one.length > 1 && two.length > 1 && one[0] === two[0] && one[one.length - 1] === two[two.length - 1];
}

export type Claimant = { personId: string; /** The email they signed in with, kept with the claim for the admin. */ email: string | null; /** Whether that email is one of their school's: only then is a name match enough. */ schoolEmail: boolean };
export type ClaimResult =
  | { state: 'bad link' }
  | { state: 'unreadable'; page: string }
  | { state: 'approved'; club: string; role: string | null; page: string }
  /** Their name is not on the list, or they have no school email. Nothing is kept until they ask for a check. */
  | { state: 'unlisted'; club: string; page: string }
  /** Already waiting, or turned down: what stands. */
  | { state: 'waiting' | 'refused'; club: string; page: string };

const listed = (officers: Officer[]) => officers.map(each => each.role ? `${each.name} (${each.role})` : each.name).join('; ').slice(0, 4000);
async function officersOf(link: ClubLink, deps: GuardDeps) {
  const got = await guardedFetch(link.officers, { mode: 'link', hosts: [link.host] }, deps);
  if (!got.ok) return null;
  const read = readOfficers(got.text);
  return read.club ? { club: read.club, officers: read.officers } : null;
}

/** Checks a pasted club link for this person. With their name on the club's officer list, and a school email, the club is theirs at once. */
export async function claimClub(db: Db, who: Claimant, raw: unknown, deps: GuardDeps = {}): Promise<ClaimResult> {
  const link = clubLink(raw);
  if (!link) return { state: 'bad link' };
  const { rows: [had] } = await db.query<{ state: 'approved' | 'waiting' | 'refused'; club: string; role: string | null }>('select state,club_name as club,role from campus_club_claim where person_id=$1 and club_url=$2', [who.personId, link.page]);
  if (had) return had.state === 'approved' ? { state: 'approved', club: had.club, role: had.role, page: link.page } : { state: had.state, club: had.club, page: link.page };
  const read = await officersOf(link, deps);
  if (!read) return { state: 'unreadable', page: link.page };
  const { rows: [person] } = await db.query<{ name: string }>('select name from person where id=$1', [who.personId]);
  const mine = who.schoolEmail && person ? read.officers.find(each => sameName(each.name, person.name)) : undefined;
  if (!mine) return { state: 'unlisted', club: read.club, page: link.page };
  await db.query(`insert into campus_club_claim(person_id,email,club_url,club_name,role,state,how,seen,decided_at) values($1,$2,$3,$4,$5,'approved','officer list',$6,now()) on conflict(person_id,club_url) do nothing`,
    [who.personId, who.email, link.page, read.club, mine.role, listed(read.officers)]);
  return { state: 'approved', club: read.club, role: mine.role, page: link.page };
}

/** "Send for review": the claim waits for the admin, with what the person wrote. A claim that is already decided stays as it is. Returns false for a link that cannot be read. */
export async function askClubReview(db: Db, who: Claimant, raw: unknown, note: unknown, deps: GuardDeps = {}): Promise<boolean> {
  const link = clubLink(raw);
  if (!link) return false;
  const read = await officersOf(link, deps);
  if (!read) return false;
  const said = typeof note === 'string' ? note.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
  await db.query(`insert into campus_club_claim(person_id,email,club_url,club_name,state,how,seen,note) values($1,$2,$3,$4,'waiting','admin',$5,$6) on conflict(person_id,club_url) do nothing`,
    [who.personId, who.email, link.page, read.club, listed(read.officers), said || null]);
  return true;
}

export type MyClaim = { club: string; page: string; role: string | null; state: 'approved' | 'waiting' | 'refused' };
/** A person's own claims, the newest first. */
export const myClaims = async (q: Q, personId: string) => (await q.query<MyClaim>('select club_name as club,club_url as page,role,state from campus_club_claim where person_id=$1 order by asked_at desc,id', [personId])).rows;

export type AdminClaim = MyClaim & { id: string; person: string; email: string | null; how: 'officer list' | 'admin'; seen: string | null; note: string | null; asked: string };
/** For the admin: every claim, those waiting first, then the newest. */
export const clubClaims = async (q: Q) => (await q.query<AdminClaim>(`select c.id,c.club_name as club,c.club_url as page,c.role,c.state,c.how,c.seen,c.note,c.email,p.name as person,to_char(c.asked_at,'YYYY-MM-DD') as asked
  from campus_club_claim c join person p on p.id=c.person_id order by (c.state='waiting') desc,c.asked_at desc,c.id limit 500`)).rows;
/** The admin's word on a claim, whatever it was before: approved, or refused. It is marked as the admin's. Returns false for a claim that is gone. */
export const decideClubClaim = async (q: Q, id: string, state: 'approved' | 'refused') =>
  (await q.query(`update campus_club_claim set state=$2,how='admin',decided_at=now() where id=$1 returning id`, [id, state])).rows.length > 0;
