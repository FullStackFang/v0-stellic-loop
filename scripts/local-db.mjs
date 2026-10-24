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
  // `board`/`day` default to the trip; the rolling example boards pass their own.
  async function person(name, show = true, board = B) {
    if (!ids.has(name)) {
      const { rows } = await db.query("insert into person (phone, name, show_name) values ($1, $2, $3) returning id", [`+1607555${n++}0`.slice(0, 12), name, show]);
      ids.set(name, rows[0].id);
    }
    await db.query("insert into board_person (board_id, person_id, joined_via) values ($1, $2, 'seed') on conflict do nothing", [board, ids.get(name)]);
    return ids.get(name);
  }
  async function intent(o) {
    const board = o.board ?? B, d = o.day ?? day;
    const who = (name) => person(name, !(o.hidden ?? []).includes(name), board);
    const poster = await who(o.by);
    const { rows } = await db.query(
      `insert into proposal (board_id, poster_id, title, icon, detail, cost_text, time_text, needs_day, min_count, status, on_day, on_at, locked_by, deadline, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now() - $15::interval) returning id`,
      [board, poster, o.title, o.icon, o.detail, o.cost ?? null, o.time ?? null, o.needsDay, o.min ?? null, o.on ? "on" : "open",
       o.on && o.onDay != null ? d(o.onDay) : null, o.on ? new Date(Date.now() - 86400e3).toISOString() : null, o.on ? await who(o.lockedBy) : null,
       o.deadline ?? null, `${o.age} hours`],
    );
    const id = rows[0].id;
    for (const [name, days, maybe] of o.people) {
      await db.query("insert into response (proposal_id, person_id, answer, days) values ($1,$2,$3,$4)",
        [id, await who(name), maybe ? "maybe" : "in", maybe ? [] : days.map(d)]);
    }
    for (const a of o.adds ?? []) {
      await db.query("insert into proposal_detail (proposal_id, kind, text, url, added_by) values ($1,$2,$3,$4,$5)",
        [id, a.k, a.v, a.url ?? null, await who(a.by)]);
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
  // Two rolling boards (local only: on the live site nobody could close or
  // reopen seeded intents). Days are offsets from today in New York; needs-a-day
  // intents carry the implied deadline a real post would get (posted day + 13).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const rday = (i) => new Date(Date.parse(`${today}T00:00:00Z`) + i * 86400e3).toISOString().slice(0, 10);
  const deadline = rday(13);
  async function rollingBoard(slug, name) {
    const { rows } = await db.query("insert into board (slug, name, window_kind) values ($1, $2, 'rolling') returning id", [slug, name]);
    return rows[0].id;
  }
  const TEAM = await rollingBoard("example-team", "Strategy team");
  const team = (o) => intent({ board: TEAM, day: rday, deadline: o.needsDay ? deadline : null, ...o });
  await team({ title: "Room after class Thu", by: "Marcus", icon: "confetti", detail: "Book a breakout room for the case write-up.", time: "6:30pm", needsDay: true, age: 6,
    people: [["Marcus", [2, 9]], ["Priya", [2, 9]], ["Dana", [2]], ["Josh", [2, 9]], ["Elena", [9], true]] });
  await team({ title: "Case prep Sunday", by: "Priya", icon: "camera", detail: "Two hours on the Harvard case, then dinner.", needsDay: true, age: 5,
    people: [["Priya", [5, 12]], ["Marcus", [5]], ["Tom", [12]], ["Josh", [5, 12]]] });
  await team({ title: "Mock interview swap", by: "Dana", icon: "coatHanger", detail: "Pairs, 30 minutes each way.", needsDay: true, min: 6, age: 4,
    people: [["Dana", [1, 3]], ["Ravi", [3]], ["Maya", [1, 3]]] });
  await team({ title: "Stats office hours", by: "Ravi", icon: "bus", detail: "Ask the TA about problem set 4.", time: "4:00pm", needsDay: true, age: 4,
    people: [["Ravi", [4]], ["Tom", [4, 11]]] });
  await team({ title: "Climbing gym", by: "Josh", icon: "mountains", detail: "Day passes, shoes to rent.", cost: "$28", needsDay: true, age: 3,
    people: [["Josh", [6, 13]], ["Maya", [6]], ["Elena", [13]]] });
  await team({ title: "Deck review before submission", by: "Elena", icon: "camera", needsDay: true, min: 5, age: 3,
    people: [["Elena", [7, 8]], ["Priya", [8]], ["Marcus", [8]], ["Dana", [8]], ["Tom", [7, 8]]] });
  await team({ title: "Board games night", by: "Tom", icon: "beerStein", detail: "Bring one game.", needsDay: true, age: 2,
    people: [["Tom", [10]], ["Josh", [10]]] });
  await team({ title: "Team photo for the deck", by: "Maya", icon: "camera", needsDay: true, age: 2, people: [["Maya", []]] });
  await team({ title: "Run along the lake", by: "Sofia", icon: "mountains", time: "7:00am", needsDay: true, age: 1,
    people: [["Sofia", [3, 10]], ["Josh", [3]], ["Ravi", [10]]] });
  await team({ title: "Team hoodies", by: "Ken", icon: "tShirt", detail: "One order, the team name on the back.", cost: "$40", needsDay: false, age: 9,
    people: [["Ken", []], ["Priya", []], ["Dana", []]] });
  await team({ title: "Shared notes doc", by: "Priya", icon: "confetti", needsDay: false, min: 6, age: 8,
    people: [["Priya", []], ["Marcus", []], ["Tom", []], ["Elena", []]] });
  await team({ title: "Weekend in the city after finals", by: "Josh", icon: "airplaneTilt", cost: "$300", needsDay: false, age: 7,
    people: [["Josh", []], ["Maya", []], ["Sofia", [], true]] });
  await team({ title: "Lunch with the alumni panel", by: "Dana", icon: "bowlFood", time: "12:30pm", needsDay: true, on: true, onDay: 3, lockedBy: "Marcus", age: 10,
    people: [["Dana", [3]], ["Marcus", [3]], ["Priya", [3]], ["Ravi", [3]]] });
  await team({ title: "Group dinner", by: "Marcus", icon: "martini", time: "8:00pm", cost: "~$45", needsDay: true, on: true, onDay: 9, lockedBy: "Priya", age: 11,
    people: [["Marcus", [9]], ["Priya", [9]], ["Josh", [9]], ["Elena", [9]], ["Tom", [9]]] });
  await team({ title: "Printing the final report", by: "Tom", icon: "bus", needsDay: false, on: true, lockedBy: "Tom", age: 12,
    people: [["Tom", []], ["Ken", []], ["Sofia", []], ["Maya", []]] });

  const CLUB = await rollingBoard("example-club", "Ski club");
  const club = (o) => intent({ board: CLUB, day: rday, deadline: o.needsDay ? deadline : null, hidden: ["Ines", "Theo"], ...o });
  await club({ title: "Ski trip to Vermont", by: "Grace", icon: "mountains", detail: "A long weekend in February. Gauging interest before booking.", cost: "~$450", needsDay: false, min: 12, age: 30,
    people: [["Grace", []], ["Nina", []], ["Wei", []], ["Ines", []], ["Theo", []], ["Jules", []], ["Omar", [], true], ["Hana", [], true]] });
  await club({ title: "Season pass group discount", by: "Wei", icon: "tent", detail: "Ten people gets 15% off.", needsDay: false, min: 10, age: 26,
    people: [["Wei", []], ["Grace", []], ["Nina", []], ["Amara", []], ["Theo", []], ["Luis", []], ["Jules", []], ["Omar", []], ["Ines", []], ["Ken", []]] });
  await club({ title: "Gear swap", by: "Nina", icon: "coatHanger", detail: "Bring what you've outgrown.", needsDay: false, age: 20,
    people: [["Nina", []], ["Amara", []], ["Luis", []]] });
  await club({ title: "Club jackets", by: "Jules", icon: "tShirt", cost: "$60–80", needsDay: false, age: 15,
    people: [["Jules", []], ["Grace", []], ["Hana", [], true]] });
  await club({ title: "Wax and tune night", by: "Omar", icon: "beerStein", detail: "At the shop on Main, they host.", time: "7:00pm", needsDay: true, age: 4,
    people: [["Omar", [4, 11]], ["Wei", [4]], ["Grace", [4, 11]], ["Nina", [11]], ["Theo", [4]]] });

  const you = await person("You");
  for (const d of [1, 2, 4, 5]) await db.query("insert into free_day (board_id, person_id, day) values ($1,$2,$3)", [B, you, day(d)]);
  for (const b of [TEAM, CLUB]) {
    await person("You", true, b);
    for (const d of [2, 5, 9]) await db.query("insert into free_day (board_id, person_id, day) values ($1,$2,$3)", [b, you, rday(d)]);
  }
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
