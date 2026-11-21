import type { Q } from '@/lib/db';

// Some tables and columns are added by a migration the founder runs by hand after the deploy, so the code asks the
// catalogue whether they are there before it reads them (a query that fails would abort the transaction it is in).
// That question was asked on every read, several times per page view. Once the answer is yes it stays yes, so it is
// remembered for the life of the server; "not yet" is asked again, since the migration may be run at any time.

const known = new Set<string>();

/** Whether what `sql` asks about is there. `sql` returns one row with a boolean `ok`; `key` names the question. */
export async function there(q: Q, key: string, sql: string): Promise<boolean> {
  if (known.has(key)) return true;
  const ok = !!(await q.query<{ ok: boolean }>(sql)).rows[0]?.ok;
  // A test changes what is there under one running process, so tests always ask.
  if (ok && process.env.NODE_ENV !== 'test') known.add(key);
  return ok;
}
