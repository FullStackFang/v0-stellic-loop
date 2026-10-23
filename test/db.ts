// Integration-test database. By default an in-process PGlite (real Postgres in
// WASM, no Docker) with the migrations applied; with QB_DB=remote, board-test
// via SUPABASE_TEST_DB_URL (already reset and migrated by `npm run test:db`).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { fromPool, PARSERS, setDb, type Db, type Q } from "@/lib/db";

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");
const TABLES = "event, share, otp_code, magic_token, free_day, response, proposal_detail, board_person, proposal, person, board";

export type TestDb = { db: Db; reset(): Promise<void>; close(): Promise<void> };

export async function openTestDb(): Promise<TestDb> {
  const d = process.env.QB_DB === "remote" ? remote() : await local();
  setDb(d.db);
  await d.reset();
  return d;
}

function remote(): TestDb {
  const url = process.env.SUPABASE_TEST_DB_URL;
  if (!url) throw new Error("QB_DB=remote needs SUPABASE_TEST_DB_URL");
  const db = fromPool(url);
  return {
    db,
    reset: async () => void (await db.query(`truncate ${TABLES} cascade`)),
    close: async () => setDb(null),
  };
}

async function local(): Promise<TestDb> {
  const pg = new PGlite({ parsers: PARSERS as never });
  // Supabase's API roles, so 0003_grants.sql applies unchanged.
  await pg.exec("create role anon; create role authenticated;");
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  const wrap = (x: { query: PGlite["query"] }): Q => ({
    query: async (text, params) => ({ rows: (await x.query(text, params as unknown[])).rows as never }),
  });
  const db: Db = {
    ...wrap(pg),
    tx: (fn) => pg.transaction((t) => fn(wrap(t))),
  };
  return {
    db,
    reset: async () => void (await pg.exec(`truncate ${TABLES} cascade`)),
    close: async () => {
      setDb(null);
      await pg.close();
    },
  };
}

/** Runs a supabase/tests/*.test.sql file inside a rolled-back transaction (PGlite only). */
export async function runSqlFile(name: string): Promise<void> {
  const pg = new PGlite({ parsers: PARSERS as never });
  await pg.exec("create role anon; create role authenticated;");
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  try {
    await pg.exec("begin");
    await pg.exec(readFileSync(join(MIGRATIONS, "..", "tests", name), "utf8"));
    await pg.exec("rollback");
  } finally {
    await pg.close();
  }
}

/** Seeds a board with a window far enough out that nothing idles. */
export async function makeBoard(q: Q, over: Partial<{ slug: string; window_start: string; window_end: string; tz: string }> = {}) {
  const { rows } = await q.query<{ id: string; slug: string }>(
    `insert into board (slug, name, tz, window_start, window_end) values ($1, 'Test board', $2, $3, $4) returning id, slug`,
    [over.slug ?? "t" + Math.random().toString(36).slice(2, 8), over.tz ?? "America/New_York", over.window_start ?? "2099-02-14", over.window_end ?? "2099-02-20"],
  );
  return rows[0];
}

let phoneSeq = 1000;
export async function makePerson(q: Q, name = "P", over: Partial<{ show_name: boolean; phone: string }> = {}) {
  const phone = over.phone ?? `+1607555${String(phoneSeq++).padStart(4, "0")}`;
  const { rows } = await q.query<{ id: string; phone: string }>(
    `insert into person (phone, name, show_name) values ($1, $2, $3) returning id, phone`,
    [phone, name, over.show_name ?? true],
  );
  return rows[0];
}
