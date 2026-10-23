// A throwaway local Postgres for `npm run dev` and screenshots: PGlite (WASM,
// in memory, no Docker) served over the Postgres wire protocol.
//   node scripts/local-db.mjs            → postgres://postgres@127.0.0.1:54329/postgres
// Then run the app with DATABASE_URL set to that URL. Data is lost on exit.
// --demo also loads the made-up people and answers of quorum.html v5.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase");
const port = Number(process.env.PORT ?? 54329);
const db = await PGlite.create();
await db.exec("create role anon; create role authenticated;");
for (const f of readdirSync(join(root, "migrations")).filter((n) => n.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
}
await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));

if (process.argv.includes("--demo")) {
  const B = "00000000-0000-4000-8000-000000000027";
  const day = (i) => `2027-02-${14 + i}`;
  const ids = new Map();
  let n = 100;
  async function person(name, show = true) {
    if (ids.has(name)) return ids.get(name);
    const { rows } = await db.query("insert into person (phone, name, show_name) values ($1, $2, $3) returning id", [`+1607555${n++}0`.slice(0, 12), name, show]);
    ids.set(name, rows[0].id);
    await db.query("insert into board_person (board_id, person_id, joined_via) values ($1, $2, 'seed') on conflict do nothing", [B, rows[0].id]);
    return rows[0].id;
  }
  async function intent(o) {
    const poster = await person(o.by);
    const { rows } = await db.query(
      `insert into proposal (board_id, poster_id, title, icon, detail, cost_text, time_text, needs_day, min_count, status, on_day, on_at, locked_by, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now() - $14::interval) returning id`,
      [B, poster, o.title, o.icon, o.detail, o.cost ?? null, o.time ?? null, o.needsDay, o.min ?? null, o.on ? "on" : "open",
       o.on ? day(o.onDay) : null, o.on ? new Date(Date.now() - 86400e3).toISOString() : null, o.on ? await person(o.lockedBy) : null, `${o.age} hours`],
    );
    const id = rows[0].id;
    for (const [name, days, maybe] of o.people) {
      await db.query("insert into response (proposal_id, person_id, answer, days) values ($1,$2,$3,$4)",
        [id, await person(name), maybe ? "maybe" : "in", maybe ? [] : days.map(day)]);
    }
    for (const a of o.adds ?? []) {
      await db.query("insert into proposal_detail (proposal_id, kind, text, url, added_by) values ($1,$2,$3,$4,$5)",
        [id, a.k, a.v, a.url ?? null, await person(a.by)]);
    }
  }
  await db.exec("delete from event; delete from proposal_detail; delete from response; delete from proposal;");
  await intent({ title: "Suits in Hoi An", by: "Priya", icon: "coatHanger", detail: "Tailor near the Japanese bridge, 24h turnaround.", cost: "~$250", time: "3:00pm", needsDay: true, age: 5,
    people: [["Priya", [1, 2, 3]], ["Marcus", [2, 3]], ["Dana", [2]], ["Josh", [2, 4]], ["Maya", [1, 2]], ["Elena", [2, 5]], ["Tom", [3, 4]], ["Ravi", [1, 5]], ["Hana", [2], true]],
    adds: [{ k: "where", v: "Yaly Couture, 47 Nguyen Thai Hoc", url: "https://maps.google.com/?q=Yaly+Couture+Hoi+An", by: "Priya" }, { k: "link", v: "yalycouture.com", url: "https://yalycouture.com", by: "Priya" }, { k: "note", v: "Bring a photo of a suit you like. Two fittings, 24h apart.", by: "Priya" }] });
  await intent({ title: "Street-food crawl", by: "Ravi", icon: "bowlFood", detail: "Five stalls, one night.", cost: "$20", time: "7:30pm", needsDay: true, age: 4,
    people: [["Ravi", [3, 4]], ["Sofia", [3]], ["Ken", [4, 5]], ["Amara", [3, 4]], ["Omar", [3], true]] });
  await intent({ title: "Overnight boat", by: "Marcus", icon: "sailboat", detail: "Halong-style junk, cabins for two.", cost: "~$180", needsDay: true, min: 6, age: 3,
    people: [["Marcus", [3, 4]], ["Elena", [3]], ["Tom", [2, 3]], ["Luis", [4]]] });
  await intent({ title: "5am flight to Da Nang", by: "Josh", icon: "airplaneTilt", detail: "Out and back same day.", cost: "$90", time: "5:10am", needsDay: true, on: true, onDay: 4, lockedBy: "Maya", age: 8,
    people: [["Josh", [4]], ["Maya", [4]], ["Dana", [4, 5]], ["Wei", [4]]] });
  await intent({ title: "Thailand after the trip", by: "Nina", icon: "island", detail: "Three or four days. Islands or Bangkok, undecided.", cost: "$400–700", needsDay: false, age: 2,
    people: [["Nina", []], ["Grace", []], ["Ben", []], ["Leila", []], ["Wei", []], ["Jules", [], true]] });
  await intent({ title: "Cohort shirts", by: "Ken", icon: "tShirt", detail: "One order, embroidered, delivered before the trip.", cost: "$25–35", needsDay: false, age: 1,
    people: [["Ken", []], ["Sofia", []], ["Amara", []], ["Omar", []], ["Luis", []], ["Hana", []], ["Grace", []], ["Priya", []], ["Tom", []]] });
  const you = await person("You");
  for (const d of [1, 2, 4, 5]) await db.query("insert into free_day (board_id, person_id, day) values ($1,$2,$3)", [B, you, day(d)]);
  console.log(`demo person "You": ${you} (sign in with /m/<token>, see below)`);
  const token = "local-demo-token";
  const { createHash } = await import("node:crypto");
  await db.query("insert into magic_token (token_hash, person_id, expires_at) values ($1,$2, now() + interval '1 day')",
    [createHash("sha256").update(token).digest("hex"), you]);
  console.log(`sign in as You: http://localhost:3000/m/${token}?to=/b/emba27`);
}

const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 10 });
await server.start();
console.log(`local db: postgres://postgres@127.0.0.1:${port}/postgres`);
process.on("SIGINT", async () => {
  await server.stop();
  await db.close();
  process.exit(0);
});
