// Conga: the rules of the game. Nothing here draws or touches the browser, so the same file can later run on a room
// server and be the referee. A caller adds lines, sets where each one wants to go, and calls step() every frame.

export const GAP = 33; // distance between animals in a line
export const SPEED = 150;
export const DASH = 270;
export const TURN = 3.4; // radians a second
export const FACES = 42;
export const MILESTONES = [10, 25, 50, 100];
export const SAFE = 2.5; // seconds a fresh line cannot be scattered
export { PLAZA };

const JOIN = 38; // a stray this close to a head joins
const PULL = 150; // a stray this close is drawn to the head, faster the closer it is, and always faster than a line walks
const HIT = 27; // a head this close to another line's animal scatters
const HEAD_HIT = 38;
const STEP = 5; // distance between remembered points of a head's path
const ROOMY = 30000; // square units of ground for each stray kept on it: the grounds grew 1.5 times across, so this came down to keep them as busy
const STRAY_CAP = 420;
const SPROUT = 9; // strays a second that turn up on a ground below its feed
// The world has no cap. The ground always refills to `feed` strays, and a really long line sheds from its back as it goes,
// each one shed a stray for anyone (agar.io's decay, slither.io's trail). Barely at first, then fast as it gets huge.
// If the lines together still pass what a slow phone can draw, step() says so ('full') and the page starts a new round.
// Lighter since the founder felt a line of 100+ "losing a few per second" (2026-11-22): a line of 140 sheds about 0.3 a
// second (was 2), one of 200 about 1.6 (was 5.5).
const EASY = 60; // a line this long or shorter sheds nothing
const SHED = 0.6; // animals a second shed at EASY + 100; an eighth of that at EASY + 50 and a sixty-fourth at EASY + 25
export const FULL = 800; // animals in all the lines together that a slow phone was measured to draw at 60 frames a second
// A line that has picked nobody up for IDLE seconds gets restless: its back wanders off, slowly at first and faster the
// longer the line (agar.io's decay is a share of size; slither.io has none). Picking anyone up settles it again.
const IDLE = 15;
const WANDER = 0.2; // animals a second off a restless line, at the least
const WANDER_SHARE = 0.001; // and this share of the line a second on top
const DROP = 0.45; // seconds of dashing that cost one animal
const DANCE = 4;
const DAZE = 0.03; // chance, each time a bot looks, that it stops looking for a moment
const BACK = 2.5; // seconds before a scattered bot comes back
const PLAZA = 130; // a head this close to where a car lets its riders off is waiting for it
const SWEEP = 80; // a car passing this close over a line takes animals off its back
const TAKEN = 6; // how many it takes. Over the head of the line it takes half the line, if that is more
const SEATS = 40; // how many a car can carry: without it one car could hand a single line hundreds at once
const SPARED = 1.5; // seconds before the same line is swept again, if the car is still over it
// Pickups lie about the ground; a head that walks over one has it for a while (seconds here). The megaphone draws strays
// from twice as far, coffee makes dashing free, and the whistle is safe passage: the head slips through other lines
// without scattering (2026-11-22; it used to only keep the bus or tram off, which hardly ever mattered).
export const POWERS = { megaphone: 10, coffee: 8, whistle: 8 };
export const LOUD = PULL * 2; // how far a megaphone draws strays from
const TAKE = 46; // a head this close to a pickup takes it
const LYING = 50; // strays kept on the ground for each pickup lying there, so a bigger ground has more
const AGAIN = 6; // seconds before a taken pickup is replaced somewhere else
// A scattered line leaves a mob: all its animals in one heap where it fell, kept as one thing rather than many strays,
// so a big spill costs no more to run or draw than a small one. It is drawn as one sack with its count on it, and a head
// that reaches it takes the whole count at once. Left alone, it breaks up into strays after a while.
const MOB_MIN = 6; // a line shorter than this just scatters
const PILE = 12; // animals to a sack when a long line bursts; never more than PILES sacks
const PILES = 8;
const FLING = [150, 420]; // how far the sacks land from where the line fell
const FLY = 0.7; // seconds a sack is in the air, and cannot be taken
const MOB_HOLD = 12; // seconds a mob stays whole
const MOB_LEAK = 3; // animals a second it loses after that, as strays
/** How far from its middle a mob reaches: the sack is the same size however much it holds. */
export const mobReach = () => 40;

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

/** A round ground, for when no map is given. */
export const round = (r = 1500) => [Array.from({ length: 48 }, (_, n) => [Math.cos(n * Math.PI / 24) * r, Math.sin(n * Math.PI / 24) * r])];

function within(ring, x, y) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
const areaOf = ring => Math.abs(ring.reduce((twice, p, i) => { const q = ring[(i + 1) % ring.length]; return twice + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
/** Whether a point is on the ground: inside any of the map's outlines, and not inside anything that stands on it. */
// A ground can hold hundreds of things that stand on it (every tree is one), so each is first tried against the box round it.
// This is asked several hundred times a step, so the ground is also cut into squares (`world.cells`), each listing the few
// things that reach into it: a point is tried against those only.
export function inside(world, x, y) {
  let on = false;
  for (const ring of world.rings) if (within(ring, x, y)) { on = true; break; }
  if (!on) return false;
  for (const i of world.cells[Math.floor((y - world.box.north) / CELL) * world.cols + Math.floor((x - world.box.west) / CELL)]) {
    const box = world.boxes[i];
    if (x > box[0] && x < box[2] && y > box[1] && y < box[3] && within(world.holes[i], x, y)) return false;
  }
  return true;
}
const boxOf = ring => ring.reduce((box, [x, y]) => [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const CELL = 150; // how wide each of those squares is
/** For each square of the ground, which of the things standing on it (by their boxes) reach into it. */
function squares(world) {
  const { west, east, north, south } = world.box, cols = Math.floor((east - west) / CELL) + 1, rows = Math.floor((south - north) / CELL) + 1;
  const cells = Array.from({ length: cols * rows }, () => []), col = x => Math.max(0, Math.min(cols - 1, Math.floor((x - west) / CELL))), row = y => Math.max(0, Math.min(rows - 1, Math.floor((y - north) / CELL)));
  world.boxes.forEach((box, i) => { for (let r = row(box[1]); r <= row(box[3]); r++) for (let c = col(box[0]); c <= col(box[2]); c++) cells[r * cols + c].push(i); });
  Object.assign(world, { cols, cells });
}

// Somewhere on the ground, with `room` clear on each side when asked.
function spot(world, room = 0) {
  const { west, east, north, south } = world.box;
  for (let tries = 0; tries < 400; tries++) {
    const x = west + world.random() * (east - west), y = north + world.random() * (south - north);
    if (inside(world, x, y) && (!room || [[room, 0], [-room, 0], [0, room], [0, -room]].every(([dx, dy]) => inside(world, x + dx, y + dy)))) return { x, y };
  }
  return { x: world.rings[0][0][0], y: world.rings[0][0][1] };
}
/** The nearest open ground to a point, looking outwards in rings; anywhere open if there is none near. */
function outTo(world, x, y) {
  for (let far = 20; far <= 400; far += 20) for (let n = 0; n < 16; n++) {
    const a = n * Math.PI / 8, px = x + Math.cos(a) * far, py = y + Math.sin(a) * far;
    if (inside(world, px, py)) return { x: px, y: py };
  }
  return spot(world);
}
const face = world =>1 + Math.floor(world.random() * FACES);
const stray = (world, at = spot(world)) => ({ ...at, face: face(world), a: world.random() * Math.PI * 2, vx: 0, vy: 0 });
const KINDS = Object.keys(POWERS);
const item = world => ({ ...spot(world, 40), kind: KINDS[Math.floor(world.random() * KINDS.length)] });
const reachOf = line => line.powers.megaphone > 0 ? LOUD : PULL;

/**
 * `rings` are the outlines of the ground, each a list of [x, y] corners. Outlines may touch or overlap.
 * `holes` are the outlines of what stands on it, buildings and water, which everyone walks around.
 * `shuttles` are cars that bring animals in, like a tram: { name, from: [x, y], to: [x, y], off: [x, y], riders, ride, stay, away }.
 * A car leaves `from` full, takes `ride` seconds to reach `to`, lets its riders off at `off`, waits `stay` seconds,
 * rides back empty and is `away` for a while. Each keeps where it is (`x`, `y`) and how many are still aboard (`load`).
 */
export function createWorld(random = Math.random, rings = round(), holes = [], shuttles = []) {
  const xs = rings.flat().map(p => p[0]), ys = rings.flat().map(p => p[1]);
  // A bigger ground keeps more strays on it. Outlines that overlap are counted twice, which is near enough.
  const area = rings.reduce((sum, ring) => sum + areaOf(ring), 0) - holes.reduce((sum, ring) => sum + areaOf(ring), 0);
  const world = { t: 0, lines: [], strays: [], random, rings, holes, boxes: holes.map(boxOf), feed: Math.round(Math.min(400, Math.max(60, area / ROOMY))), shuttles: shuttles.map(each => ({ ...each, clock: 0, load: each.riders, kept: 0, hop: 0, x: each.from[0], y: each.from[1] })), box: { west: Math.min(...xs), east: Math.max(...xs), north: Math.min(...ys), south: Math.max(...ys) } };
  squares(world);
  while (world.strays.length < world.feed) world.strays.push(stray(world));
  world.mobs = []; world.items = []; world.lay = Math.max(2, Math.round(world.feed / LYING)); world.later = 0;
  while (world.items.length < world.lay) world.items.push(item(world));
  return world;
}

/** Puts a line somewhere away from the other heads, alone or with `start` animals behind it. */
export function place(world, line, start = 0) {
  let at = spot(world, 120);
  for (let tries = 0; tries < 30; tries++) {
    if (world.lines.every(other => other === line || other.dead || Math.hypot(other.x - at.x, other.y - at.y) > 380)) break;
    at = spot(world, 120);
  }
  const a = world.random() * Math.PI * 2;
  Object.assign(line, { ...at, a, want: a, dash: false, dead: 0, owed: [], owing: 0, safe: SAFE, dance: 0, drop: 0, idle: 0, wander: 0, powers: { megaphone: 0, coffee: 0, whistle: 0 }, top: 0, slack: 0, spared: 0, path: [{ ...at }] });
  line.tail = Array.from({ length: start }, () => ({ face: face(world), ...at }));
  return line;
}

/** A bot is a line with a `bot` of { skill, aggro }, both 0 to 1. A line without one is steered by steer(). */
export function addLine(world, { id, face, name, bot = null, start = 0 }) {
  const line = { id, face, name, bot: bot && { ...bot, wait: 0, drift: 0, chase: -5 } };
  world.lines.push(line);
  return place(world, line, start);
}

/** Where a line wants to go. What a player sends is not trusted: a heading that is not a number is ignored, since it would stop the line for good. */
export function steer(line, want, dash) {
  if (Number.isFinite(want)) line.want = want;
  line.dash = dash === true;
}

/** Takes a line out, when its player leaves. Its animals stay behind as strays. */
export function removeLine(world, id) {
  const at = world.lines.findIndex(line => line.id === id);
  if (at < 0) return;
  const [line] = world.lines.splice(at, 1);
  for (const f of line.dead ? [] : line.tail) world.strays.push({ x: f.x, y: f.y, face: f.face, a: world.random() * Math.PI * 2, vx: 0, vy: 0 });
}

// Each animal stands a fixed distance further back along the path its head walked.
function follow(line, dt) {
  const { path, tail } = line, ease = Math.min(1, dt * 14);
  // An animal that has just joined stands at the head, and `slack` is how far the line has still to move back to make room.
  let px = line.x, py = line.y, walked = 0, need = GAP - line.slack, i = 0, k = 0;
  for (; k < path.length && i < tail.length; k++) {
    const q = path[k], length = Math.hypot(q.x - px, q.y - py);
    while (i < tail.length && walked + length >= need) {
      const u = length ? Math.max(0, need - walked) / length : 0, f = tail[i++];
      f.x += (px + (q.x - px) * u - f.x) * ease;
      f.y += (py + (q.y - py) * u - f.y) * ease;
      need += GAP;
    }
    walked += length; px = q.x; py = q.y;
  }
  for (; i < tail.length; i++) { const f = tail[i]; f.x += (px - f.x) * ease; f.y += (py - f.y) * ease; }
  if (path.length > k + 2) path.length = k + 2;
}

// A bot looks ahead for trouble first, then for a smaller line to cut off, then for the nearest stray.
function think(world, line, dt) {
  const bot = line.bot;
  bot.chase -= dt;
  if ((bot.wait -= dt) > 0) return;
  // Now and then a bot stops paying attention for a moment, which is what lets a long line be caught out.
  bot.wait = world.random() < DAZE ? 0.7 : 0.07 + (1 - bot.skill) * 0.2 * world.random();
  const n = line.tail.length, dx = Math.cos(line.a), dy = Math.sin(line.a);
  line.dash = false;

  const clear = turn => [60, 150].every(far => inside(world, line.x + Math.cos(line.a + turn) * far, line.y + Math.sin(line.a + turn) * far));
  if (!clear(0)) { line.want = line.a + (clear(1) ? 1 : clear(-1) ? -1 : 2.6); return; }

  const reach = 70 + bot.skill * 120;
  let near = Infinity, side = 0;
  const look = (x, y) => {
    const rx = x - line.x, ry = y - line.y, ahead = rx * dx + ry * dy;
    if (ahead <= 0 || ahead >= near || ahead > reach) return;
    const across = dx * ry - dy * rx;
    if (Math.abs(across) < 34 + ahead * 0.3) { near = ahead; side = across; }
  };
  for (const other of world.lines) {
    if (other === line || other.dead) continue;
    if (other.tail.length >= n) look(other.x, other.y);
    for (const f of other.tail) look(f.x, f.y);
  }
  if (near < Infinity) { line.want = line.a - Math.sign(side || 1) * 1.6; return; }

  for (const car of world.shuttles) {
    const dx = car.off[0] - line.x, dy = car.off[1] - line.y, far = Math.hypot(dx, dy);
    if (car.clock < car.ride && car.clock > car.ride - 8 && far < 1100) { line.want = far > 60 ? Math.atan2(dy, dx) : line.a + 1; return; }
  }

  if (n >= 5 && bot.aggro > 0.4 && (bot.chase > 0 || bot.chase <= -5)) {
    let prey = null, close = 420;
    for (const other of world.lines) {
      if (other === line || other.dead || other.safe > 0) continue;
      const d = Math.hypot(other.x - line.x, other.y - line.y);
      if (d < close) { close = d; prey = other; }
    }
    if (prey) {
      if (bot.chase <= -5) bot.chase = 4; // four seconds of chasing, then five of leaving it alone
      // Aim in front of it, so its head meets this line's body.
      const lead = close * 0.9;
      line.want = Math.atan2(prey.y + Math.sin(prey.a) * lead - line.y, prey.x + Math.cos(prey.a) * lead - line.x);
      line.dash = bot.aggro > 0.7 && n > 8 && close < 320;
      return;
    }
  }

  // A mob is worth going a long way for.
  let pick = null, far = 1000;
  for (const mob of world.mobs) { const d = Math.hypot(mob.x - line.x, mob.y - line.y); if (d < far) { far = d; pick = mob; } }
  if (pick) { line.want = Math.atan2(pick.y - line.y, pick.x - line.x); return; }
  // A pickup close by is worth a short detour.
  far = 600;
  for (const it of world.items) { const d = Math.hypot(it.x - line.x, it.y - line.y); if (d < 260 + bot.skill * 140 && d < far) { far = d; pick = it; } }
  if (pick) { line.want = Math.atan2(pick.y - line.y, pick.x - line.x); return; }
  for (const s of world.strays) {
    const d = Math.hypot(s.x - line.x, s.y - line.y);
    if (d < far) { far = d; pick = s; }
  }
  if (pick) { line.want = Math.atan2(pick.y - line.y, pick.x - line.x); return; }
  bot.drift += (world.random() - 0.5) * 0.6;
  line.want = bot.drift;
}

// An animal falls in right behind the head and the rest of the line moves back one place.
function join(world, line, face, x, y, events) {
  line.tail.unshift({ face, x, y, born: world.t });
  line.slack += GAP;
  line.idle = 0; line.wander = 0;
  events.push({ type: 'join', line: line.id, size: line.tail.length + 1 });
  // A line dances the first time it reaches each size, not every time it gets back there.
  if (MILESTONES.includes(line.tail.length) && line.tail.length > line.top) {
    line.top = line.tail.length;
    line.dance = DANCE;
    events.push({ type: 'dance', line: line.id, size: line.tail.length });
  }
}

/** A line owed a sack's or a car's animals takes them one after another at its head, each out of a puff ('pop'), quickly
 * while many are owed and slower as they run out: all at once they would pile up at the back of the line. */
const OWE = 8, OWE_SHARE = 0.6; // animals a second at the least, and this share of those still owed on top
const GIANT = 400; // the longest line a slow phone was measured to draw (see FULL)
function owe(world, line, dt, events) {
  if (!line.owed.length) { line.owing = 0; return; }
  for (line.owing += (OWE + line.owed.length * OWE_SHARE) * dt; line.owing >= 1 && line.owed.length; line.owing--) {
    // A line already past GIANT is too long to join: the animal goes home, as a shed one does, so one big sack cannot keep
    // a line past what a slow phone can draw.
    if (line.tail.length >= GIANT) { const face = line.owed.shift(); events.push({ type: 'home', x: line.x, y: line.y, face, a: line.a }); continue; }
    join(world, line, line.owed.shift(), line.x, line.y, events);
    events.push({ type: 'pop', line: line.id, x: line.x, y: line.y, left: line.owed.length });
  }
}

function scatter(world, line, by, events) {
  if (line.tail.length + line.owed.length >= MOB_MIN) {
    // A long line bursts into sacks flung all round where it fell, which whoever wants them has to go and get.
    // The head itself is not one of them.
    const faces = [...line.tail.map(f => f.face), ...line.owed], piles = Math.min(PILES, Math.ceil(faces.length / PILE)), turn = world.random() * Math.PI * 2;
    for (let n = 0; n < piles; n++) {
      const a = turn + n * Math.PI * 2 / piles + (world.random() - 0.5) * 0.6, far = FLING[0] + world.random() * (FLING[1] - FLING[0]);
      let x = line.x + Math.cos(a) * far, y = line.y + Math.sin(a) * far;
      if (!inside(world, x, y)) ({ x, y } = outTo(world, x, y));
      const share = faces.splice(0, Math.ceil(faces.length / (piles - n)));
      world.mobs.push({ x, y, fx: line.x, fy: line.y, ready: world.t + FLY, fly: FLY, faces: share, from: line.id, lead: line.face, name: line.name, born: world.t, leak: 0 });
    }
    events.push({ type: 'spill', line: line.id, name: line.name, size: line.tail.length + line.owed.length, piles, x: line.x, y: line.y });
  } else for (const f of line.tail) {
    const a = world.random() * Math.PI * 2, v = 120 + world.random() * 160;
    world.strays.push({ x: f.x, y: f.y, face: f.face, a, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
  }
  events.push({ type: 'scatter', line: line.id, by: by.id, size: line.tail.length + 1, x: line.x, y: line.y });
  line.tail = []; line.owed = [];
  line.dash = false;
  line.dead = line.bot ? BACK : Infinity;
}

/** Moves the world on by dt seconds. Returns what happened: { type: 'join' | 'dance' | 'scatter' | 'arrive' | 'lift' | 'restless' | 'power' | 'spill' | 'grab' | 'pop' | 'full', ... }. */
export function step(world, dt) {
  const events = [];
  world.t += dt;

  for (const line of world.lines) {
    if (line.dead) {
      if ((line.dead -= dt) <= 0) place(world, line);
      continue;
    }
    if (line.bot) think(world, line, dt);
    const turn = TURN * dt, dashing = line.dash && line.tail.length > 0;
    line.a = wrap(line.a + Math.max(-turn, Math.min(turn, wrap(line.want - line.a))));
    const v = (dashing ? DASH : SPEED) * dt;
    // At the edge of the ground a line slides along it: it takes the nearest heading that stays on.
    for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.5, -1.5]) {
      const x = line.x + Math.cos(line.a + turn) * v, y = line.y + Math.sin(line.a + turn) * v;
      if (inside(world, x, y)) { line.x = x; line.y = y; break; }
    }
    if (Math.hypot(line.x - line.path[0].x, line.y - line.path[0].y) >= STEP) line.path.unshift({ x: line.x, y: line.y });
    line.slack *= Math.exp(-7 * dt);
    follow(line, dt);
    owe(world, line, dt, events);
    // Dashing costs animals off the back, and so does a line that has gone a while without picking anyone up.
    const was = line.idle;
    line.idle += dt;
    if (was < IDLE && line.idle >= IDLE && line.tail.length) events.push({ type: 'restless', line: line.id });
    if (line.idle >= IDLE) line.wander += (WANDER + line.tail.length * WANDER_SHARE) * dt;
    if (line.tail.length > EASY) line.wander += SHED * ((line.tail.length - EASY) / 100) ** 3 * dt;
    // One dropped by dashing is an ordinary stray, anyone's to pick up, its own line's too. One that wanders off a line too
    // long or too idle goes home: it leaves the game ('home', for the page to show it walking off), so a line cannot
    // undo its shedding by circling, and nothing lies on the ground that cannot be picked up.
    if (dashing && line.powers.coffee <= 0 && (line.drop += dt) >= DROP && line.tail.length) {
      line.drop = 0; const f = line.tail.pop(); world.strays.push({ x: f.x, y: f.y, face: f.face, a: world.random() * Math.PI * 2, vx: 0, vy: 0 });
    }
    for (; line.wander >= 1; line.wander--) if (line.tail.length) { const f = line.tail.pop(); events.push({ type: 'home', x: f.x, y: f.y, face: f.face, a: line.a }); }
    line.safe = Math.max(0, line.safe - dt);
    line.spared = Math.max(0, line.spared - dt);
    line.dance = Math.max(0, line.dance - dt);
    for (const kind of KINDS) line.powers[kind] = Math.max(0, line.powers[kind] - dt);
    for (let i = world.items.length - 1; i >= 0; i--) {
      const it = world.items[i];
      if (Math.hypot(it.x - line.x, it.y - line.y) >= TAKE) continue;
      world.items.splice(i, 1);
      line.powers[it.kind] = POWERS[it.kind];
      events.push({ type: 'power', line: line.id, kind: it.kind, x: it.x, y: it.y });
    }
  }
  // A taken pickup turns up again somewhere else after a while.
  if (world.items.length < world.lay && (world.later += dt) >= AGAIN) { world.later = 0; world.items.push(item(world)); }

  // The nearest head that reaches a mob takes all of it at once; left alone long enough, it breaks up into strays.
  for (let m = world.mobs.length - 1; m >= 0; m--) {
    const mob = world.mobs[m], r = mobReach();
    let head = null, close = Infinity;
    for (const line of world.lines) {
      if (line.dead || world.t < (mob.ready ?? 0)) continue; // still in the air
      const d = Math.hypot(line.x - mob.x, line.y - mob.y);
      if (d < r + JOIN && d < close) { close = d; head = line; }
    }
    if (head) {
      events.push({ type: 'grab', line: head.id, from: mob.from, count: mob.faces.length, x: mob.x, y: mob.y });
      head.owed.push(...mob.faces.splice(0)); // they join one after another (see owe)
    } else if (world.t - mob.born > MOB_HOLD) {
      for (mob.leak += MOB_LEAK * dt; mob.leak >= 1 && mob.faces.length; mob.leak--) {
        const a = world.random() * Math.PI * 2, v = 60 + world.random() * 80;
        world.strays.push({ x: mob.x + Math.cos(a) * r * 0.6, y: mob.y + Math.sin(a) * r * 0.6, face: mob.faces.pop(), a, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
      }
    }
    if (!mob.faces.length) world.mobs.splice(m, 1);
  }

  const slow = Math.exp(-3 * dt);
  // Every stray is tried against every head, every step: the heads are listed once, and distances are compared squared.
  const alive = world.lines.filter(line => !line.dead), reaches = alive.map(reachOf);
  for (let i = world.strays.length - 1; i >= 0; i--) {
    const s = world.strays[i];
    // Each head draws strays from its own reach, twice as far with a megaphone; the nearest head that reaches one has it.
    let head = null, close = Infinity, span = PULL;
    for (let h = 0; h < alive.length; h++) {
      const dx = alive[h].x - s.x, dy = alive[h].y - s.y, d = dx * dx + dy * dy, r = reaches[h];
      if (d < r * r && d < close) { close = d; head = alive[h]; span = r; }
    }
    close = Math.sqrt(close);
    if (head && close < JOIN) {
      world.strays.splice(i, 1);
      join(world, head, s.face, s.x, s.y, events);
      continue;
    }
    // One that landed somewhere no head can reach (spilled or dropped into a building, a tree or the water) steps out to the
    // nearest open ground, or failing that anywhere open, so every animal lying about can be picked up.
    if (!inside(world, s.x, s.y)) { Object.assign(s, outTo(world, s.x, s.y)); s.vx = s.vy = 0; continue; }
    s.a += (world.random() - 0.5) * 2 * dt;
    s.vx *= slow; s.vy *= slow;
    const pull = head ? (170 + 280 * (1 - close / span)) / (close || 1) : 0;
    const x = s.x + (Math.cos(s.a) * 14 + s.vx + (head ? head.x - s.x : 0) * pull) * dt, y = s.y + (Math.sin(s.a) * 14 + s.vy + (head ? head.y - s.y : 0) * pull) * dt;
    if (inside(world, x, y)) { s.x = x; s.y = y; } else s.a += Math.PI;
  }

  // Everyone who walked into someone is found first and scattered after, so two heads meeting is fair to both.
  const hits = [];
  const touches = (tail, x, y) => { for (let i = 0; i < tail.length; i++) { const dx = tail[i].x - x, dy = tail[i].y - y; if (dx * dx + dy * dy < HIT * HIT) return true; } return false; };
  for (const line of world.lines) {
    if (line.dead || line.safe > 0 || line.powers.whistle > 0) continue; // the whistle: safe passage
    for (const other of world.lines) {
      if (other === line || other.dead) continue;
      const heads = Math.hypot(other.x - line.x, other.y - line.y) < HEAD_HIT && other.safe <= 0 && line.tail.length <= other.tail.length;
      if (heads || touches(other.tail, line.x, line.y)) { hits.push([line, other]); break; }
    }
  }
  for (const [line, by] of hits) scatter(world, line, by, events);

  for (const car of world.shuttles) {
    const there = car.ride, leaves = there + car.stay, back = leaves + car.ride, was = car.clock, ease = f => f * f * (3 - 2 * f);
    car.clock = (car.clock + dt) % (back + car.away);
    if (car.clock < was) { car.load = Math.min(SEATS, car.riders + car.kept); car.kept = 0; } // it sets off again, full, with anyone it carried away
    const at = car.clock < there ? ease(car.clock / there) : car.clock < leaves ? 1 : car.clock < back ? 1 - ease((car.clock - leaves) / car.ride) : 0;
    car.x = car.from[0] + (car.to[0] - car.from[0]) * at;
    car.y = car.from[1] + (car.to[1] - car.from[1]) * at;
    const out = (x, y, push) => { const a = world.random() * Math.PI * 2, v = push * (0.3 + world.random() * 0.7); world.strays.push({ x, y, face: face(world), a, vx: Math.cos(a) * v, vy: Math.sin(a) * v }); car.load--; };
    // Coming in over the ground, the keenest few jump early. The rest get off together when it stops.
    if (car.clock < there && car.load > car.riders * 0.7 && inside(world, car.x, car.y) && (car.hop -= dt) <= 0) { car.hop = 0.45; out(car.x, car.y, 40); }
    // While it moves over the ground it sweeps: a line it passes over loses the animals at its back, which ride on.
    // Swept on the way in, they get off with the rest. Swept on the way out, they come back on the next car.
    const moving = car.clock < there || (car.clock >= leaves && car.clock < back);
    if (moving && inside(world, car.x, car.y)) for (const line of world.lines) {
      if (line.dead || line.safe > 0 || line.spared > 0 || !line.tail.length) continue;
      const head = Math.hypot(line.x - car.x, line.y - car.y) < SWEEP * 0.75;
      if (!head && !line.tail.some(f => Math.hypot(f.x - car.x, f.y - car.y) < SWEEP)) continue;
      const off = line.tail.splice(-(head ? Math.max(TAKEN, Math.ceil(line.tail.length / 2)) : TAKEN)), taken = off.length, aboard = Math.min(taken, Math.max(0, SEATS - car.load));
      // Those there is no seat for are left where they stood, as strays.
      for (const f of off.slice(aboard)) world.strays.push({ x: f.x, y: f.y, face: f.face, a: world.random() * Math.PI * 2, vx: 0, vy: 0 });
      line.spared = SPARED;
      car.load += aboard; if (car.clock >= there) car.kept += aboard;
      events.push({ type: 'lift', name: car.name, line: line.id, count: taken, head, x: car.x, y: car.y });
    }
    if (was < there && car.clock >= there && car.load > 0) {
      // Whoever is waiting where it stops gets its riders straight onto their line, dealt round. With nobody there they scatter.
      const count = car.load, waiting = world.lines.filter(line => !line.dead && Math.hypot(line.x - car.off[0], line.y - car.off[1]) < PLAZA), onto = waiting.map(line => ({ line: line.id, count: 0 }));
      for (let n = 0; car.load > 0; n++) {
        if (!waiting.length) { out(car.off[0], car.off[1], 210); continue; }
        waiting[n % waiting.length].owed.push(face(world)); onto[n % waiting.length].count++; car.load--;
      }
      events.push({ type: 'arrive', name: car.name, stop: car.stop, count, onto, x: car.off[0], y: car.off[1] });
    }
  }
  // The ground refills at a steady rate, never all at once, so it stays busy without being bottomless.
  for (world.sprout = (world.sprout ?? 0) + SPROUT * dt; world.sprout >= 1; world.sprout--) if (world.strays.length < world.feed) world.strays.push(stray(world));
  if (world.strays.length > STRAY_CAP) world.strays.splice(0, world.strays.length - STRAY_CAP);
  // Once, when the lines together pass FULL: the page starts a new round.
  if (!world.full && world.lines.reduce((sum, line) => sum + (line.dead ? 0 : line.tail.length), 0) > FULL) { world.full = true; events.push({ type: 'full' }); }
  return events;
}
