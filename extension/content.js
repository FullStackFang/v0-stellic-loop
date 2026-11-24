// On Luma, Posh, Eventbrite and CampusGroups (openspec loopd-browser-extension, design D2, D5, D10). On a single event
// page it asks the service worker about this page's address, and draws the card in a closed shadow root, so the page
// can neither style it nor read it. The token stays in the service worker. Other pages get nothing and send nothing.
(function () {
  const { isEventPage } = globalThis.LoopdPages, { CSS, draw } = globalThis.LoopdCard;
  let host = null, root = null, href = '', answer = null, closed = false, said = '', busy = false;

  function remove() { host?.remove(); host = root = null; }
  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('loopd-card');
    root = host.attachShadow({ mode: 'closed' });
    document.documentElement.append(host);
  }
  function render() {
    if (closed || !answer || answer.state === 'not_event') { remove(); return; }
    mount();
    const style = document.createElement('style');
    style.textContent = CSS;
    root.replaceChildren(style, draw(answer, { in: () => press('in'), leave: () => press('leave'), copy, close }, { said, busy }));
  }
  function ask(kind) { return chrome.runtime.sendMessage({ kind, url: href }).catch(() => ({ state: 'refused', message: 'Loopd could not be reached. Try again.' })); }
  async function look() {
    const asked = href, got = await ask('look');
    if (asked !== href) return;
    said = got.state === 'refused' ? got.message : '';
    if (got.state !== 'refused') answer = got;
    render();
  }
  async function press(kind) {
    busy = true; render();
    const asked = href, got = await ask(kind);
    busy = false;
    if (asked !== href) return;
    if (got.state === 'refused') said = got.message; else { said = ''; answer = got; }
    render();
  }
  function copy(link) { navigator.clipboard.writeText(link).then(() => { said = 'Link copied.'; render(); }, () => { said = 'Copy the link from the card.'; render(); }); }
  function close() { closed = true; render(); }

  /** A new address: a page that swaps itself without a reload gets a fresh look, or loses the card. */
  function check() {
    if (location.href === href) return;
    href = location.href; answer = null; said = ''; closed = false;
    if (isEventPage(href)) look(); else remove();
  }
  check();
  setInterval(check, 800);
  window.addEventListener('popstate', check);
  // The toolbar button brings a closed card back (design D10).
  chrome.runtime.onMessage.addListener(message => { if (message?.kind === 'show') { closed = false; href = ''; check(); } });
})();
