// The Loopd card (openspec loopd-browser-extension, design D7, D9; public/demo/mockups-six-adds.html section 3).
// It draws what Loopd answered and nothing else. Every text is set as text, never as markup. Every control is a pill.
(function () {
  const CSS = `
:host { all: initial; }
.card { position: fixed; z-index: 2147483647; right: 16px; top: 16px; box-sizing: border-box; width: 252px; display: grid; gap: 9px;
  padding: 12px 13px 13px; border-radius: 18px 18px 18px 5px; font: 13px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink); background: oklch(99% 0.008 100); box-shadow: 0 0 0 1.5px var(--ink), 5px 5px 0 var(--field); -webkit-font-smoothing: antialiased; }
.card * { box-sizing: border-box; margin: 0; }
.top { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 820; letter-spacing: -0.02em; }
.top svg { width: 22px; height: 14px; } .top .sp { flex: 1; }
.big { font-size: 17px; font-weight: 800; line-height: 1.12; letter-spacing: -0.02em; }
.line { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 1.25; color: color-mix(in oklab, var(--ink) 68%, white); }
.line b { color: var(--ink); }
.strip { padding: 7px 10px; border-radius: 11px 11px 11px 3px; font-size: 12px; font-weight: 700; line-height: 1.25; background: var(--field); }
.seats { display: inline-flex; flex: none; padding-right: 6px; }
.seat { flex: none; display: grid; place-items: center; width: 34px; height: 34px; margin-right: -6px; border-radius: 50%; overflow: hidden;
  font-size: 10.5px; font-weight: 800; background: var(--field); box-shadow: 0 0 0 2px oklch(99% 0.008 100), 0 0 0 3.5px var(--ink); }
.seat img { width: 100%; height: 100%; object-fit: cover; display: block; }
.two { display: flex; gap: 8px; } .two > * { flex: 1; }
.btn { display: inline-flex; align-items: center; justify-content: center; height: 40px; padding: 0 12px; border: 0; border-radius: 99px; cursor: pointer;
  font: inherit; font-size: 14px; font-weight: 760; white-space: nowrap; text-decoration: none; color: oklch(99% 0.008 100); background: var(--action);
  box-shadow: inset 0 0 0 1.5px var(--ink), 2px 2px 0 var(--ink); }
.btn.plain { color: var(--ink); background: oklch(99% 0.008 100); box-shadow: inset 0 0 0 1.5px var(--ink); }
.btn.sm { height: 26px; padding: 0 10px; font-size: 12px; }
.btn:disabled { opacity: .6; cursor: default; }
.btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.link { display: flex; align-items: center; gap: 6px; padding: 5px 5px 5px 11px; border-radius: 99px; font-size: 11.5px; box-shadow: inset 0 0 0 1.5px var(--ink); }
.link span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.said { padding: 8px 10px; border-radius: 11px; font-size: 12px; color: oklch(99% 0.008 100); background: var(--ink); }
`;
  const LOOP = { field: 'oklch(96.4% 0.19 117)', ink: 'oklch(25% 0.07 252)', action: 'oklch(47.6% 0.13 250)' };

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) if (child) node.append(child);
    return node;
  }
  const rings = () => {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 22 14'); svg.setAttribute('aria-hidden', 'true');
    for (const cx of [7, 15]) { const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', cx); c.setAttribute('cy', 7); c.setAttribute('r', 5.6); c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'currentColor'); c.setAttribute('stroke-width', 2.2); svg.append(c); }
    return svg;
  };
  const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const seat = face => el('span', { class: 'seat' }, el('img', { src: face.photo, alt: face.first }));
  const count = n => el('span', { class: 'seat', 'aria-hidden': 'true', text: String(n) });
  const open = (href, text, plain = true) => el('a', { class: `btn${plain ? ' plain' : ''}`, href, target: '_blank', rel: 'noopener', text });

  /**
   * The card for one answer. `on` holds what the buttons do: in, leave, copy(link), close. `said` is a line to show
   * above the buttons (a refusal, in Loopd's words). `busy` turns the buttons off while a press is on its way.
   */
  function draw(answer, on, { said = '', busy = false } = {}) {
    const kit = answer.kit || LOOP, body = [];
    const press = (text, act, plain = false, small = false) => el('button', { type: 'button', class: `btn${plain ? ' plain' : ''}${small ? ' sm' : ''}`, disabled: busy, onclick: act, text });
    if (answer.state === 'known') {
      const names = answer.known.map(face => face.first), n = answer.known.length;
      body.push(el('p', { class: 'big', text: n === 1 ? `${names[0]} is in` : `${n} people you know are in` }));
      body.push(el('div', { class: 'line' }, el('span', { class: 'seats' }, answer.known.slice(0, 5).map(seat)), el('b', { text: names.join(', ') })));
      if (answer.others) body.push(el('p', { class: 'strip', text: `${answer.others} more from ${answer.campus} ${answer.others === 1 ? 'is' : 'are'} going` }));
      body.push(el('div', { class: 'two' }, press('I’m in', on.in), answer.invite && open(answer.invite, 'Invite')));
    } else if (answer.state === 'in') {
      const others = answer.faces.filter(face => !face.me).map(face => face.first);
      body.push(el('p', { class: 'big', text: others.length ? `You’re in, with ${list(others)}` : 'You’re in' }));
      body.push(el('div', { class: 'line' }, el('span', { class: 'seats' }, answer.faces.slice(0, 5).map(seat), answer.others > 0 && count(`+${answer.others}`)),
        answer.others > 0 && el('span', { text: `and ${answer.others} more` })));
      body.push(el('div', { class: 'link' }, el('span', { text: answer.share.replace(/^https?:\/\//, '') }), press('Copy link', () => on.copy(answer.share), true, true)));
      body.push(el('div', { class: 'two' }, open(answer.invite, 'Invite'), answer.leave && press('Leave', on.leave, true)));
    } else if (answer.state === 'none') {
      body.push(el('p', { class: 'big', text: 'Nobody you know yet' }));
      body.push(el('div', { class: 'line' }, count(answer.others), el('span', { text: answer.others ? `${answer.others} going. Be the first you know, then bring someone.` : 'Be the first, then bring someone.' })));
      if (!answer.seen) body.push(el('p', { class: 'strip', text: `New to Loopd. Pressing I’m in adds it to ${answer.campus}’s list.` }));
      body.push(el('div', { class: 'two' }, press('I’m in', on.in)));
    } else if (answer.state === 'finish') {
      body.push(el('p', { class: 'big', text: 'Finish it in Loopd' }));
      body.push(el('p', { class: 'line', text: 'Pick where you meet, then post it. Your plan opens with this page’s link in it.' }));
      body.push(el('div', { class: 'two' }, open(answer.finish, 'Finish in Loopd', false)));
    } else {
      body.push(el('p', { class: 'big', text: 'See who you know here' }));
      if (answer.going !== null && answer.going !== undefined) body.push(el('div', { class: 'line' }, count(answer.going), el('span', {}, el('b', { text: `${answer.going} ${answer.going === 1 ? 'student' : 'students'}` }), ` ${answer.going === 1 ? 'is' : 'are'} going`)));
      if (answer.say) body.push(el('p', { class: 'line', text: answer.say }));
      body.push(el('div', { class: 'two' }, open(answer.connect, 'Sign in with school email', false)));
    }
    const card = el('section', { class: 'card', role: 'dialog', 'aria-label': 'Loopd' },
      el('div', { class: 'top' }, rings(), el('span', { text: 'Loopd' }), el('span', { class: 'sp' }), el('button', { type: 'button', class: 'btn plain sm', onclick: on.close, text: 'Close' })),
      body.slice(0, -1), said && el('p', { class: 'said', role: 'alert', text: said }), body[body.length - 1]);
    card.style.setProperty('--field', kit.field); card.style.setProperty('--ink', kit.ink); card.style.setProperty('--action', kit.action);
    return card;
  }

  globalThis.LoopdCard = { CSS, draw };
})();
