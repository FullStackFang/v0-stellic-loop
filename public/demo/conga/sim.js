// Conga: the rules of the game. Nothing here draws or touches the browser, so the same file can later run on a room
// server and be the referee. A caller adds lines, sets where each one wants to go, and calls step() every frame.

export const GAP = 33; // distance between animals in a line
export const SPEED = 150;
export const DASH = 270;
export const TURN = 3.4; // radians a second
export const FACES = 42;
export const MILESTONES = [10, 25, 50, 100];
export const SAFE = 2.5; // seconds a fresh line cannot be scattered

const JOIN = 36; // a stray this close to a head joins
const PULL = 95; // a stray this close runs to the head
const HIT = 27; // a head this close to another line's animal scatters
const HEAD_HIT = 38;
const STEP = 5; // distance between remembered points of a head's path
const STRAYS = 110;
const STRAY_CAP = 420;
const BORED = 0.05; // past LONG animals, the chance a second, for each one more, that the last wanders off
const LONG = 30;
const DROP = 0.45; // seconds of dashing that cost one animal
const DANCE = 4;
const DAZE = 0.03; // chance, each time a bot looks, that it stops looking for a moment
const BACK = 2.5; // seconds before a scattered bot comes back

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
const face = world => 1 + Math.floor(world.random() * FACES);
const stray = (world, at = spot(world)) => ({ ...at, face: face(world), a: world.random() * Math.PI * 2, vx: 0, vy: 0 });

/**
 * `rings` are the outlines of the ground, each a list of [x, y] corners. Outlines may touch or overlap.
 * `holes` are the outlines of what stands on it, buildings and water, which everyone walks around.
 * `drops` are places where animals arrive together on a clock, like a tram station: { name, at: [x, y], every, count },
 * with `every` in seconds. Each keeps `left`, the seconds until its next arrival.
 */
export function createWorld(random = Math.random, rings = round(), holes = [], drops = []) {
  const xs = rings.flat().map(p => p[0]), ys = rings.flat().map(p => p[1]);
  const world = { t: 0, lines: [], strays: [], random, rings, holes, drops: drops.map(drop => ({ ...drop, left: drop.every })), box: { west: Math.min(...xs), east: Math.max(...xs), north: Math.min(...ys), south: Math.max(...ys) } };
  while (world.strays.length < STRAYS) world.strays.push(stray(world));
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
  Object.assign(line, { ...at, a, want: a, dash: false, dead: 0, safe: SAFE, dance: 0, drop: 0, top: 0, slack: 0, path: [{ ...at }] });
  line.tail = Array.from({ length: start }, () => ({ face: face(world), ...at }));
  return line;
}

/** A bot is a line with a `bot` of { skill, aggro }, both 0 to 1. A line without one is steered by steer(). */
export function addLine(world, { id, face, name, bot = null, start = 0 }) {
  const line = { id, face, name, bot: bot && { ...bot, wait: 0, drift: 0, chase: -5 } };
  world.lines.push(line);
  return place(world, line, start);
}

export function steer(line, want, dash) {
  line.want = want;
  line.dash = dash;
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

  let pick = null, far = 600;
  for (const s of world.strays) {
    const d = Math.hypot(s.x - line.x, s.y - line.y);
    if (d < far) { far = d; pick = s; }
  }
  if (pick) { line.want = Math.atan2(pick.y - line.y, pick.x - line.x); return; }
  bot.drift += (world.random() - 0.5) * 0.6;
  line.want = bot.drift;
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

/** Moves the world on by dt seconds. Returns what happened: { type: 'join' | 'dance' | 'scatter' | 'drop', ... }. */
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
    // Dashing costs animals off the back, and the back of a very long line gets bored and wanders off by itself.
    const bored = line.tail.length > LONG && world.random() < (line.tail.length - LONG) * BORED * dt;
    if (bored || (dashing && (line.drop += dt) >= DROP)) {
      if (!bored) line.drop = 0;
      const f = line.tail.pop();
      world.strays.push({ x: f.x, y: f.y, face: f.face, a: world.random() * Math.PI * 2, vx: 0, vy: 0 });
    }
    line.safe = Math.max(0, line.safe - dt);
    line.dance = Math.max(0, line.dance - dt);
  }

  const slow = Math.exp(-3 * dt);
  for (let i = world.strays.length - 1; i >= 0; i--) {
    const s = world.strays[i];
    let head = null, close = PULL;
    for (const line of world.lines) {
      if (line.dead) continue;
      const d = Math.hypot(line.x - s.x, line.y - s.y);
      if (d < close) { close = d; head = line; }
    }
    if (head && close < JOIN) {
      world.strays.splice(i, 1);
      // It falls in right behind the head and the rest of the line moves back one place.
      head.tail.unshift({ face: s.face, x: s.x, y: s.y, born: world.t });
      head.slack += GAP;
      events.push({ type: 'join', line: head.id, size: head.tail.length + 1 });
      // A line dances the first time it reaches each size, not every time it gets back there.
      if (MILESTONES.includes(head.tail.length) && head.tail.length > head.top) {
        head.top = head.tail.length;
        head.dance = DANCE;
        events.push({ type: 'dance', line: head.id, size: head.tail.length });
      }
      continue;
    }
    s.a += (world.random() - 0.5) * 2 * dt;
    s.vx *= slow; s.vy *= slow;
    const pull = head ? 70 / close : 0;
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

  for (const drop of world.drops) {
    if ((drop.left -= dt) > 0) continue;
    drop.left += drop.every;
    for (let n = 0; n < drop.count; n++) {
      const a = world.random() * Math.PI * 2, v = 60 + world.random() * 140;
      world.strays.push({ x: drop.at[0], y: drop.at[1], face: face(world), a, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
    }
    events.push({ type: 'drop', name: drop.name, count: drop.count });
  }
  while (world.strays.length < STRAYS) world.strays.push(stray(world));
  if (world.strays.length > STRAY_CAP) world.strays.splice(0, world.strays.length - STRAY_CAP);
  return events;
}
