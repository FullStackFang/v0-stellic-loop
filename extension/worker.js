// The service worker (openspec loopd-browser-extension, design D4, D5, D8). It keeps the token in the extension's own
// storage, which no page can read, and makes the three calls to Loopd: look up, I'm in, Leave. Each sends the page's
// address and the token, nothing else. Loopd is reached at the address the token came from.
const LOOPD = 'https://www.getloopdin.social';
/** Loopd addresses the token may come from: the manifest's host permissions. */
const ALLOWED = ['https://www.getloopdin.social', 'https://getloopdin.social', 'http://localhost:3000'];

async function held() {
  const { token = null, base = LOOPD } = await chrome.storage.local.get(['token', 'base']);
  return { token, base: ALLOWED.includes(base) ? base : LOOPD };
}

async function call(kind, url) {
  const { token, base } = await held();
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const response = kind === 'look'
    ? await fetch(`${base}/api/ext/event?url=${encodeURIComponent(url)}`, { headers, credentials: 'omit', cache: 'no-store' })
    : await fetch(`${base}/api/ext/${kind}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ url }), credentials: 'omit' });
  return response.json();
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const from = sender.url ? new URL(sender.url).origin : '';
  if (message?.kind === 'connect') {
    // Only Loopd's own connect page hands over a token.
    if (!ALLOWED.includes(from) || from !== message.base || typeof message.token !== 'string') { reply(false); return false; }
    chrome.storage.local.set({ token: message.token, base: from }).then(() => reply(true), () => reply(false));
    return true;
  }
  if (message?.kind === 'forget') {
    if (ALLOWED.includes(from)) chrome.storage.local.remove(['token']);
    return false;
  }
  if (['look', 'in', 'leave'].includes(message?.kind) && typeof message.url === 'string') {
    call(message.kind, message.url).then(reply, () => reply({ state: 'refused', message: 'Loopd could not be reached. Try again.' }));
    return true;
  }
  return false;
});

// The toolbar button brings the card back on the page it is pressed on (design D10).
chrome.action.onClicked.addListener(tab => { if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, { kind: 'show' }).catch(() => {}); });
