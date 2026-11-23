// Measures how smoothly Conga plays (openspec conga-smooth-motion, D1). A function for the Playwright tool, not a node
// script: run it with browser_run_code_unsafe and `filename: scripts/conga-perf.js`, with the app up on localhost:3000.
// It plays scripted rounds with nobody at the keyboard (steering in a wandering circle, ending each round by putting the
// head onto another line, pressing Again from inside the page) and gives back:
//   frames    gaps between frames and script time in each, by what was on screen (start card, play, over card)
//   long      every stretch of script over 25 ms, with the functions that ran in it (CPU profile)
//   collector time spent collecting garbage, and its longest stretch
//   makes     which functions made the most memory (allocation sampling), biggest first
// Gaps between frames depend on what else the machine is doing; the profile's figures do not, so judge by those.
async (page) => {
  const GROUND = 'columbia', WIDE = 1920, TALL = 1000; // change these to measure another ground or screen
  const ROUNDS = 4, ROUND_SECONDS = 14, CARD_SECONDS = 3;
  // Every ground but Cornell's hill takes its school or Ink+ (openspec conga-ground-gate), so the script plays as someone
  // with Ink+: it puts that player where the page would write who is playing, before the page's own scripts run.
  await page.addInitScript(() => { if (!location.pathname.startsWith('/conga/play') || !location.search.includes('perf')) return; const player = { ink: true, plus: true, kit: 'cornell', schools: ['cornell'], animals: [{ face: 12, picture: null, kit: 'cornell' }] }; Object.defineProperty(window, 'congaPlayer', { get: () => player, set() {}, configurable: true }); });
  await page.setViewportSize({ width: WIDE, height: TALL });
  await page.goto(`http://localhost:3000/conga/play?map=${GROUND}&perf`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  await cdp.send('HeapProfiler.enable');
  await page.evaluate(() => {
    window.__f = [];
    let last = performance.now();
    const over = document.getElementById('over'), start = document.getElementById('start');
    // The game's own frame callback is asked for before this one, so `performance.now() - now` is the frame's script time.
    const tick = now => { window.__f.push([now - last, performance.now() - now, over.hidden ? (start.hidden ? 'play' : 'start') : 'over']); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    // Puts your head onto the longest other line, so the round ends.
    window.__end = () => { const w = window.conga.world, me = w.lines.find(l => l.id === 'me'), other = w.lines.filter(l => l !== me && !l.dead && l.tail.length > 2).sort((a, b) => b.tail.length - a.tail.length)[0]; if (!me || me.dead || !other) return; me.safe = 0; me.x = other.tail[1].x; me.y = other.tail[1].y; };
  });
  await cdp.send('Profiler.start');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const shown = id => page.evaluate(id => !document.getElementById(id).hidden, id);
  let n = 0;
  for (let round = 0; round < ROUNDS; round++) {
    await page.evaluate(id => document.getElementById(id).click(), round ? 'again' : 'go');
    const t0 = Date.now();
    while (Date.now() - t0 < ROUND_SECONDS * 1000) {
      const a = n / 90 + 0.5 * Math.sin(n / 25); // wanders all over the ground, so new ground keeps coming into view
      await page.mouse.move(WIDE / 2 + Math.cos(a) * 300, TALL / 2 + Math.sin(a) * 300);
      if (n++ % 20 === 0 && await shown('over')) break; // walked into someone on its own
      await page.waitForTimeout(50);
    }
    await page.evaluate(() => window.__end());
    await page.waitForTimeout(CARD_SECONDS * 1000);
  }
  const { profile } = await cdp.send('Profiler.stop');
  const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');

  const byId = new Map(profile.nodes.map(node => [node.id, node])), parent = new Map();
  for (const node of profile.nodes) for (const c of node.children || []) parent.set(c, node.id);
  const name = id => byId.get(id).callFrame.functionName || '(anon)';
  const bursts = [], collects = [];
  let now = profile.startTime, run = null, gc = null, gcTotal = 0;
  profile.samples.forEach((id, i) => {
    const d = profile.timeDeltas[i]; now += d;
    if (name(id) === '(garbage collector)') { gcTotal += d; gc ??= { start: now - d }; gc.end = now; } else if (gc) { collects.push(gc.end - gc.start); gc = null; }
    if (['(idle)', '(program)', '(root)'].includes(name(id))) { if (run && now - run.end > 1500) { bursts.push(run); run = null; } return; }
    run ??= { start: now, end: now, incl: {} }; run.end = now;
    const seen = new Set();
    for (let at = id; at != null; at = parent.get(at)) { const f = `${name(at)}:${byId.get(at).callFrame.lineNumber + 1}`; if (!seen.has(f)) { seen.add(f); run.incl[f] = (run.incl[f] || 0) + d / 1000; } }
  });
  const long = bursts.filter(b => b.end - b.start > 25000).map(b => `${((b.start - profile.startTime) / 1e6).toFixed(1)}s ${((b.end - b.start) / 1000).toFixed(0)}ms: ` + Object.entries(b.incl).sort((x, y) => y[1] - x[1]).slice(0, 18).map(([f, ms]) => `${f}=${ms.toFixed(0)}`).join(' '));

  const made = new Map();
  (function walk(node) { const f = `${node.callFrame.functionName || '(anon)'}:${node.callFrame.lineNumber + 1}`; if (node.selfSize) made.set(f, (made.get(f) || 0) + node.selfSize); for (const c of node.children || []) walk(c); })(heap.head);
  const total = [...made.values()].reduce((a, b) => a + b, 0);
  const makes = [...made].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([f, size]) => `${(size / total * 100).toFixed(0)}% ${f}`);

  const frames = await page.evaluate(() => {
    const by = {};
    for (const [d, js, state] of window.__f.slice(5)) { const s = by[state] ??= { frames: 0, over25ms: 0, worstGap: 0, js: [] }; s.frames++; if (d > 25) s.over25ms++; s.worstGap = Math.max(s.worstGap, Math.round(d)); s.js.push(js); }
    for (const s of Object.values(by)) { s.js.sort((a, b) => a - b); s.scriptMid = +s.js[s.js.length >> 1].toFixed(1); s.script99 = +s.js[Math.floor(s.js.length * 0.99)].toFixed(1); s.scriptWorst = +s.js.at(-1).toFixed(1); delete s.js; }
    return by;
  });
  const seconds = (profile.endTime - profile.startTime) / 1e6;
  return JSON.stringify({ ground: GROUND, screen: `${WIDE}x${TALL}`, seconds: Math.round(seconds), frames, long,
    collector: { totalMs: Math.round(gcTotal / 1000), msPerMinute: Math.round(gcTotal / 1000 / seconds * 60), longestMs: Math.round(Math.max(0, ...collects) / 1000), times: collects.length },
    sampledMb: +(total / 1048576).toFixed(1), makes }, null, 1);
}
