// Two connections call lock_proposal on the same ready proposal at once.
// Exactly one must get `locked`, the other `already_on`, and one
// threshold_reached event must exist. Cleans up after itself.
import pg from "pg";

const B = "30000000-0000-4000-8000-000000000001";
const P = "30000000-0000-4000-8000-0000000000c1";
const people = [1, 2, 3, 4].map((i) => `30000000-0000-4000-8000-0000000000b${i}`);

async function cleanup(c) {
  await c.query("delete from event where board_id = $1", [B]);
  await c.query("delete from response where proposal_id = $1", [P]);
  await c.query("delete from proposal where id = $1", [P]);
  await c.query("delete from person where id = any($1::uuid[])", [people]);
  await c.query("delete from board where id = $1", [B]);
}

export async function concurrentLockCheck(url) {
  const setup = new pg.Client({ connectionString: url });
  const a = new pg.Client({ connectionString: url });
  const b = new pg.Client({ connectionString: url });
  await Promise.all([setup.connect(), a.connect(), b.connect()]);
  try {
    await cleanup(setup);
    await setup.query(
      "insert into board (id, slug, name, window_start, window_end) values ($1, 'latch', 'Latch', '2099-02-14', '2099-02-20')",
      [B],
    );
    for (const [i, id] of people.entries()) {
      await setup.query("insert into person (id, phone, name) values ($1, $2, $3)", [id, `+1607555030${i}`, `P${i}`]);
    }
    await setup.query(
      "insert into proposal (id, board_id, poster_id, title, needs_day) values ($1, $2, $3, 'Shirts', false)",
      [P, B, people[0]],
    );
    for (const id of people) {
      await setup.query("insert into response (proposal_id, person_id, answer) values ($1, $2, 'in')", [P, id]);
    }
    const [ra, rb] = await Promise.all([
      a.query("select lock_proposal($1, $2) r", [P, people[0]]),
      b.query("select lock_proposal($1, $2) r", [P, people[1]]),
    ]);
    const got = [ra.rows[0].r, rb.rows[0].r].sort();
    if (got.join() !== "already_on,locked") throw new Error(`got ${got.join(", ")}`);
    const { rows } = await setup.query(
      "select count(*)::int n from event where proposal_id = $1 and type = 'threshold_reached'",
      [P],
    );
    if (rows[0].n !== 1) throw new Error(`${rows[0].n} threshold_reached events`);
  } finally {
    await cleanup(setup).catch(() => {});
    await Promise.all([setup.end(), a.end(), b.end()]);
  }
}
