// The one path to the database: server-only, Postgres over Supabase's pooler,
// with real transactions so every state change and its event commit together.
import "server-only";
import pg from "pg";

export type Q = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
};
export type Db = Q & { tx<T>(fn: (q: Q) => Promise<T>): Promise<T> };

// Dates stay 'YYYY-MM-DD' strings and timestamps become ISO strings, so rows
// serialise to client components unchanged and compare as strings.
const DATE = 1082, DATE_ARRAY = 1182, TIMESTAMPTZ = 1184;
const parseDateArray = (v: string) => (v === "{}" ? [] : v.slice(1, -1).split(","));
const parseTs = (v: string) => new Date(v).toISOString();

export const PARSERS: Record<number, (v: string) => unknown> = {
  [DATE]: (v) => v,
  [DATE_ARRAY]: parseDateArray,
  [TIMESTAMPTZ]: parseTs,
};

let current: Db | null = null;

export function db(): Db {
  if (!current) current = fromPool(databaseUrl(process.env));
  return current;
}

/** Tests point the app at PGlite or board-test. */
export function setDb(d: Db | null) {
  current = d;
}

/** DATABASE_URL, else POSTGRES_URL, which the Vercel Supabase integration injects. */
export function databaseUrl(env: Record<string, string | undefined>): string | undefined {
  return env.DATABASE_URL || env.POSTGRES_URL || undefined;
}

/**
 * TLS for Supabase, none for a local database. Supabase signs with its own CA,
 * and pg now reads sslmode=require as verify-full, so the mode comes off the
 * URL and the link stays encrypted without verifying the chain.
 */
export function poolConfig(url: string): { connectionString: string; ssl: false | { rejectUnauthorized: false } } {
  const u = new URL(url);
  if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return { connectionString: url, ssl: false };
  u.searchParams.delete("sslmode");
  return { connectionString: u.toString(), ssl: { rejectUnauthorized: false } };
}

export function fromPool(url: string | undefined): Db {
  if (!url) throw new Error("DATABASE_URL (or POSTGRES_URL) is not set");
  const pool = new pg.Pool({
    ...poolConfig(url),
    max: 5,
    types: {
      getTypeParser: ((oid: number, format?: string) =>
        PARSERS[oid] ?? pg.types.getTypeParser(oid, format as "text")) as typeof pg.types.getTypeParser,
    },
  });
  return {
    query: (text, params) => pool.query(text, params as unknown[]) as never,
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out = await fn({ query: (t, p) => c.query(t, p as unknown[]) as never });
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
  };
}
