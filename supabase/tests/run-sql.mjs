// Runs every supabase/tests/*.test.sql against SUPABASE_TEST_DB_URL, then
// checks the seed is idempotent and the publishable key reads nothing.
// Each SQL file raises on failure (`assert` / `raise exception`).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.SUPABASE_TEST_DB_URL;
if (!url) throw new Error("SUPABASE_TEST_DB_URL is not set");

const client = new pg.Client({ connectionString: url });
await client.connect();
let failed = 0;

async function counts() {
  const { rows } = await client.query(
    "select (select count(*) from board) b, (select count(*) from proposal) p, (select count(*) from event) e",
  );
  return JSON.stringify(rows[0]);
}

// seed idempotency: the reset already seeded once
const before = await counts();
await client.query(readFileSync(join(here, "..", "seed.sql"), "utf8"));
const after = await counts();
if (before !== after) {
  console.error(`✗ seed is not idempotent: ${before} → ${after}`);
  failed++;
} else console.log(`✓ seed idempotent ${after}`);

for (const f of readdirSync(here).filter((n) => n.endsWith(".test.sql")).sort()) {
  try {
    await client.query("begin");
    await client.query(readFileSync(join(here, f), "utf8"));
    await client.query("rollback");
    console.log(`✓ ${f}`);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.error(`✗ ${f}: ${e.message}`);
    failed++;
  }
}

// The concurrent latch needs two connections and committed rows.
try {
  const { concurrentLockCheck } = await import("./latch.mjs");
  await concurrentLockCheck(url);
  console.log("✓ latch: two concurrent lock_proposal calls → one locked, one already_on");
} catch (e) {
  console.error(`✗ latch: ${e.message}`);
  failed++;
}

// The publishable key must read nothing.
if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_PUBLISHABLE_KEY) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_PUBLISHABLE_KEY);
  const tables = ["board", "person", "board_person", "proposal", "proposal_detail", "response",
    "free_day", "share", "otp_code", "magic_token", "event"];
  for (const t of tables) {
    const { data } = await sb.from(t).select("*").limit(1);
    if (data && data.length) {
      console.error(`✗ publishable key reads rows from ${t}`);
      failed++;
    }
  }
  const { data: rpc } = await sb.rpc("lock_proposal", { p_id: "00000000-0000-4000-8000-0000000000a1", p_person: "00000000-0000-4000-8000-000000000001" });
  if (rpc) {
    console.error("✗ publishable key can call lock_proposal");
    failed++;
  }
  console.log("✓ publishable key reads zero rows from every table");
} else {
  console.error("✗ SUPABASE_TEST_URL / SUPABASE_TEST_PUBLISHABLE_KEY not set: grants not checked");
  failed++;
}

await client.end();
if (failed) {
  console.error(`${failed} SQL check(s) failed`);
  process.exit(1);
}
