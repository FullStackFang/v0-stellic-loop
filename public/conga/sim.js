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
const ROOMY = 45000; // square units of ground for each stray kept on it
const STRAY_CAP = 420;
// A line has no longest length. What keeps a frame cheap is that the world holds at most BUDGET animals, in lines, loose
// and aboard cars together: past it no new strays appear and cars set off empty, so a line grows by taking from others,
// and one scattered feeds everyone.
const BUDGET = 750;
// A line that has picked nobody up for IDLE seconds gets restless: its back wanders off, slowly at first and faster the
// longer the line (agar.io's decay is a share of size; slither.io has none). Picking anyone up settles it again.
const IDLE = 10;
const WANDER = 0.4; // animals a second off a restless line, at the least
const WANDER_SHARE = 0.004; // and this share of the line a second on top
const SHY = 12; // seconds before one that wandered off will join the line it left again
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
// from twice as far, coffee makes dashing free, and the whistle keeps the bus or tram from taking anyone off the line.
export const POWERS = { megaphone: 10, coffee: 8, whistle: 15 };
export const LOUD = PULL * 2; // how far a megaphone draws strays from
const TAKE = 46; // a head this close to a pickup takes it
const LYING = 50; // strays kept on the ground for each pickup lying there, so a bigger ground has more
const AGAIN = 6; // seconds before a taken pickup is replaced somewhere else

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
export const inside = (world, x, y) => world.rings.some(ring => within(ring, x, y)) && !world.holes.some(ring => within(ring, x, y));

// Somewhere on the ground, with `room` clear on each side when asked.
function spot(world, room = 0) {
  const { west, east, north, south } = world.box;
  for (let tries = 0; tries < 400; tries++) {
    const x = west + world.random() * (east - west), y = north + world.random() * (south - north);
    if (inside(world, x, y) && (!room || [[room, 0], [-room, 0], [0, room], [0, -room]].every(([dx, dy]) => inside(world, x + dx, y + dy)))) return { x, y };
  }
  return { x: world.rings[0][0][0], y: world.rings[0][0][1] };
}
/** Every animal in the world: in lines, loose, and aboard cars. */
const counted = world => world.lines.reduce((sum, line) => sum + (line.dead ? 0 : line.tail.length), world.strays.length) + world.shuttles.reduce((sum, car) => sum + car.load, 0);
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
  const world = { t: 0, lines: [], strays: [], random, rings, holes, feed: Math.round(Math.min(260, Math.max(60, area / ROOMY))), shuttles: shuttles.map(each => ({ ...each, clock: 0, load: each.riders, kept: 0, hop: 0, x: each.from[0], y: each.from[1] })), box: { west: Math.min(...xs), east: Math.max(...xs), north: Math.min(...ys), south: Math.max(...ys) } };
  while (world.strays.length < world.feed) world.strays.push(stray(world));
  world.items = []; world.lay = Math.max(2, Math.round(world.feed / LYING)); world.later = 0;
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
  Object.assign(line, { ...at, a, want: a, dash: false, dead: 0, safe: SAFE, dance: 0, drop: 0, idle: 0, wander: 0, powers: { megaphone: 0, coffee: 0, whistle: 0 }, top: 0, slack: 0, spared: 0, path: [{ ...at }] });
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

  // A pickup close by is worth a short detour.
  let pick = null, far = 600;
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

function scatter(world, line, by, events) {
  for (const f of line.tail) {
    const a = world.random() * Math.PI * 2, v = 120 + world.random() * 160;
    world.strays.push({ x: f.x, y: f.y, face: f.face, a, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
  }
  events.push({ type: 'scatter', line: line.id, by: by.id, size: line.tail.length + 1, x: line.x, y: line.y });
  line.tail = [];
  line.dash = false;
  line.dead = line.bot ? BACK : Infinity;
}

/** Moves the world on by dt seconds. Returns what happened: { type: 'join' | 'dance' | 'scatter' | 'arrive' | 'lift' | 'restless' | 'power', ... }. */
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
    // Dashing costs animals off the back, and so does a line that has gone a while without picking anyone up.
    const was = line.idle;
    line.idle += dt;
    if (was < IDLE && line.idle >= IDLE && line.tail.length) events.push({ type: 'restless', line: line.id });
    if (line.idle >= IDLE) line.wander += (WANDER + line.tail.length * WANDER_SHARE) * dt;
    // One that wandered off will not come back to the line it left for a while, or walking in circles would undo it.
    const leave = shy => { const f = line.tail.pop(); world.strays.push({ x: f.x, y: f.y, face: f.face, a: world.random() * Math.PI * 2, vx: 0, vy: 0, ...shy }); };
    if (dashing && line.powers.coffee <= 0 && (line.drop += dt) >= DROP && line.tail.length) { line.drop = 0; leave(); }
    for (; line.wander >= 1; line.wander--) if (line.tail.length) leave({ shy: line.id, until: world.t + SHY });
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

  const slow = Math.exp(-3 * dt);
  for (let i = world.strays.length - 1; i >= 0; i--) {
    const s = world.strays[i];
    // Each head draws strays from its own reach, twice as far with a megaphone; the nearest head that reaches one has it.
    let head = null, close = Infinity, span = PULL;
    for (const line of world.lines) {
      if (line.dead || (s.shy === line.id && world.t < s.until)) continue;
      const d = Math.hypot(line.x - s.x, line.y - s.y), r = reachOf(line);
      if (d < r && d < close) { close = d; head = line; span = r; }
    }
    if (head && close < JOIN) {
      world.strays.splice(i, 1);
      join(world, head, s.face, s.x, s.y, events);
      continue;
    }
    s.a += (world.random() - 0.5) * 2 * dt;
    s.vx *= slow; s.vy *= slow;
    const pull = head ? (170 + 280 * (1 - close / span)) / (close || 1) : 0;
    const x = s.x + (Math.cos(s.a) * 14 + s.vx + (head ? head.x - s.x : 0) * pull) * dt, y = s.y + (Math.sin(s.a) * 14 + s.vy + (head ? head.y - s.y : 0) * pull) * dt;
    if (inside(world, x, y)) { s.x = x; s.y = y; } else s.a += Math.PI;
  }

  // Everyone who walked into someone is found first and scattered after, so two heads meeting is fair to both.
  const hits = [];
  for (const line of world.lines) {
    if (line.dead || line.safe > 0) continue;
    for (const other of world.lines) {
      if (other === line || other.dead) continue;
      const heads = Math.hypot(other.x - line.x, other.y - line.y) < HEAD_HIT && other.safe <= 0 && line.tail.length <= other.tail.length;
      if (heads || other.tail.some(f => Math.hypot(f.x - line.x, f.y - line.y) < HIT)) { hits.push([line, other]); break; }
    }
  }
  for (const [line, by] of hits) scatter(world, line, by, events);

  for (const car of world.shuttles) {
    const there = car.ride, leaves = there + car.stay, back = leaves + car.ride, was = car.clock, ease = f => f * f * (3 - 2 * f);
    car.clock = (car.clock + dt) % (back + car.away);
    if (car.clock < was) { car.load = Math.min(SEATS, (counted(world) < BUDGET ? car.riders : 0) + car.kept); car.kept = 0; } // it sets off again, full, with anyone it carried away
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
      if (line.dead || line.safe > 0 || line.spared > 0 || line.powers.whistle > 0 || !line.tail.length) continue;
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
        join(world, waiting[n % waiting.length], face(world), car.off[0], car.off[1], events); onto[n % waiting.length].count++; car.load--;
      }
      events.push({ type: 'arrive', name: car.name, stop: car.stop, count, onto, x: car.off[0], y: car.off[1] });
    }
  }
  for (let total = counted(world); world.strays.length < world.feed && total < BUDGET; total++) world.strays.push(stray(world));
  if (world.strays.length > STRAY_CAP) world.strays.splice(0, world.strays.length - STRAY_CAP);
  return events;
}
