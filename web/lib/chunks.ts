/**
 * Splits `items` into consecutive batches of at most `size`. PostgREST encodes
 * `in` filters into the URL, so `.in()` reads of unbounded id lists go out in
 * batches of 100 to stay well under URL limits. An empty list yields no batches.
 */
export function chunks<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
