// Readable board slugs. The name is folded to lowercase ASCII and hyphens; a
// taken slug gets "-2", "-3", ... Allocation never raises a unique violation,
// so the surrounding transaction (and the identity step before it) never aborts.
import { randomInt } from "node:crypto";
import type { Q } from "./db";

const BASE_MAX = 28;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomSlug(n = 6): string {
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** "Ski Club '26!" → "ski-club-26"; a name with no letters or digits → a random 6-character slug. */
export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BASE_MAX)
    .replace(/-+$/, "");
  return base || randomSlug();
}

/** Inserts a rolling board at `base`, or the first free `base-N` past the highest taken suffix. */
export async function allocateBoard(q: Q, base: string, b: { name: string; tz: string }): Promise<{ id: string; slug: string }> {
  const insert = async (slug: string) =>
    (await q.query<{ id: string; slug: string }>(
      `insert into board (slug, name, tz, window_kind) values ($1, $2, $3, 'rolling')
       on conflict (slug) do nothing returning id, slug`,
      [slug, b.name, b.tz],
    )).rows[0];
  const first = await insert(base);
  if (first) return first;
  // base is [a-z0-9-] only, so it is safe inside the pattern
  const { rows: [top] } = await q.query<{ n: number }>(
    "select coalesce(max(substring(slug from '-([0-9]+)$')::int), 1)::int n from board where slug ~ ('^' || $1 || '-[0-9]+$')",
    [base],
  );
  for (let n = top.n + 1; ; n++) {
    const got = await insert(`${base}-${n}`);
    if (got) return got;
  }
}
