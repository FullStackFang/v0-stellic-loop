// Checks a Conga ground the tests do not: every road, toy foot, lawn and stop badge on the land, no toy on a lawn or a
// road's felt, no stop badge under a tree. Prints every thing with its place; the lines in capitals are the problems.
//   node scripts/conga-check.mjs <slug>     (columbia, cornell-tech...; prints every ground's size first)
import { MAPS } from '../public/conga/maps.js';
const only = process.argv[2];
const onLand = (rings, x, y) => rings.some(ring => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit; } return hit; });
const area = r => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
for (const [id, m] of Object.entries(MAPS)) {
  console.log('==', id, 'scale', m.scale, 'area', Math.round(m.rings.reduce((s, r) => s + area(r), 0) / 1e6 * 10) / 10, 'M', 'trees', m.trees.length, 'zones', m.zones.map(z => z.name + '@' + z.at.map(Math.round) + (onLand(m.rings, ...z.at) ? '' : ' OFF')).join(' | '));
  if (id !== only) continue;
  m.rings.forEach((r, i) => console.log(' ring', i, Math.round(area(r) / 1e6 * 100) / 100, r.map(p => p.map(Math.round).join(',')).join(' ')));
  for (const t of m.things) {
    if (t.from) { console.log(' road', t.name, t.from.map(Math.round), t.to.map(Math.round), 'w', t.w, onLand(m.rings, ...t.from) ? '' : 'START OFF', onLand(m.rings, ...t.to) ? '' : 'END OFF', 'mid', onLand(m.rings, (t.from[0] + t.to[0]) / 2, (t.from[1] + t.to[1]) / 2)); continue; }
    const cos = Math.cos(t.turn), sin = Math.sin(t.turn), cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [t.x + a * t.w / 2 * cos - b * t.h / 2 * sin, t.y + a * t.w / 2 * sin + b * t.h / 2 * cos]);
    const sec = m.rings.findIndex(r => onLand([r], t.x, t.y));
    console.log(' ', t.kind, t.name, Math.round(t.x), Math.round(t.y), 'w', Math.round(t.w), 'h', Math.round(t.h), 'toy', t.toy, 'section', sec, cs.some(c => !onLand(m.rings, ...c)) ? 'CORNER OFF' : '');
  }
  const greens = m.things.filter(t => t.kind === 'green' || t.kind === 'field');
  const inBox = (g, x, y, pad = 0) => { const c = Math.cos(-g.turn), s = Math.sin(-g.turn), dx = x - g.x, dy = y - g.y, u = dx * c - dy * s, v = dx * s + dy * c; return Math.abs(u) < g.w / 2 + pad && Math.abs(v) < g.h / 2 + pad; };
  for (const t of m.things) if (t.toy) for (const g of greens) if (inBox(g, t.x, t.y)) console.log(' TOY ON LAWN', t.name, g.name);
  for (let i = 0; i < greens.length; i++) for (let j = i + 1; j < greens.length; j++) if (inBox(greens[i], greens[j].x, greens[j].y, Math.min(greens[j].w, greens[j].h) / 2)) console.log(' LAWNS OVERLAP?', greens[i].name, greens[j].name);
  const roads = m.things.filter(t => t.from);
  const dseg = (r, x, y) => { const dx = r.to[0] - r.from[0], dy = r.to[1] - r.from[1], f = Math.max(0, Math.min(1, ((x - r.from[0]) * dx + (y - r.from[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - r.from[0] - dx * f, y - r.from[1] - dy * f); };
  for (const t of m.things) if (!t.from) for (const r of roads) { const d = dseg(r, t.x, t.y); if (d < Math.max(130, r.w) / 2 + Math.min(t.w, t.h) / 2) console.log(' NEAR ROAD', t.name, r.name, Math.round(d), 'road half', Math.max(130, r.w) / 2, 'thing', Math.round(t.w), Math.round(t.h)); }
  for (const s of m.shuttles) {
    console.log(' shuttle', s.name, 'from', s.from.map(Math.round), onLand(m.rings, ...s.from), 'to', s.to.map(Math.round), onLand(m.rings, ...s.to), 'off', s.off.map(Math.round), onLand(m.rings, ...s.off), 'ride', s.ride, 'len', Math.round(Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1])));
    for (const r of roads) console.log('   off to road', r.name, Math.round(dseg(r, ...s.off)), 'to->road', Math.round(dseg(r, ...s.to)));
    for (const t of m.things) if (!t.from) { const d = Math.hypot(t.x - s.off[0], t.y - s.off[1]); if (d < 400) console.log('   near stop', t.name, Math.round(d), 'dx', Math.round(t.x - s.off[0]), 'dy', Math.round(t.y - s.off[1])); }
    for (const tr of m.trees) { const d = Math.hypot(tr.x - s.off[0], tr.y - s.off[1]); if (d < 220) console.log('   tree near stop', Math.round(d)); }
    for (const g of greens) if (inBox(g, ...s.off, 150)) console.log('   STOP BADGE ON LAWN', g.name);
    // on-land share of the path
    let on = 0; for (let k = 0; k <= 100; k++) if (onLand(m.rings, s.from[0] + (s.to[0] - s.from[0]) * k / 100, s.from[1] + (s.to[1] - s.from[1]) * k / 100)) on++; console.log('   path on land %', on);
  }
  console.log(' box', Math.min(...m.rings.flat().map(p => p[0])), Math.max(...m.rings.flat().map(p => p[0])), Math.min(...m.rings.flat().map(p => p[1])), Math.max(...m.rings.flat().map(p => p[1])));
}
