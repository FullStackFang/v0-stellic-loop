// The SQL test files, run in PGlite on every `npm test`. `npm run test:db`
// runs the same files (and the seed and grants checks) against board-test.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestDb, runSqlFile, type TestDb } from "@/test/db";

const TABLES = ["board", "person", "board_person", "proposal", "proposal_detail", "response", "free_day", "share", "otp_code", "magic_token", "event"];

describe.skipIf(process.env.QB_DB === "remote")("SQL tests (PGlite)", () => {
  let t: TestDb;
  beforeAll(async () => void (t = await openTestDb()));
  afterAll(() => t.close());

  it("constraints", () => runSqlFile("constraints.test.sql"));
  it("lock_proposal", () => runSqlFile("lock.test.sql"));

  it("the seed is idempotent", async () => {
    // a raw PGlite: the seed is a multi-statement file, which only exec() runs
    const pg = new PGlite();
    await pg.exec("create role anon; create role authenticated;");
    const dir = join(__dirname, "..", "migrations");
    for (const m of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) await pg.exec(readFileSync(join(dir, m), "utf8"));
    const seed = readFileSync(join(__dirname, "..", "seed.sql"), "utf8");
    const counts = () => Promise.all(TABLES.map(async (n) => Number((await pg.query<{ n: number }>(`select count(*)::int n from ${n}`)).rows[0].n)));
    await pg.exec(seed);
    const once = await counts();
    await pg.exec(seed);
    expect(await counts()).toEqual(once);
    await pg.close();
    expect(once[TABLES.indexOf("proposal")]).toBe(5);
  });

  // PGlite has no Supabase default privileges, so this guards against a grant
  // creeping into a migration; only test:db proves 0003 against the real defaults.
  it("anon and authenticated can read no table and cannot lock", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const n of TABLES) {
        await expect(t.db.tx(async (q) => {
          await q.query(`set local role ${role}`);
          await q.query(`select * from ${n}`);
        })).rejects.toThrow(/permission denied/);
      }
      await expect(t.db.tx(async (q) => {
        await q.query(`set local role ${role}`);
        await q.query("select lock_proposal(gen_random_uuid(), gen_random_uuid())");
      })).rejects.toThrow(/permission denied/);
    }
  });
});
