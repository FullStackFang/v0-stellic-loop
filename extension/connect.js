// On Loopd's own connect page only (/ext/connect; openspec loopd-browser-extension, design D4). It tells the page the
// extension is here, and takes the token the page hands over to the service worker. Only messages from this same window
// and this same origin are taken; the token is posted nowhere else.
(function () {
  const here = () => window.postMessage({ loopd: 'ext-here' }, location.origin);
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.loopd === 'ext-ask') here();
    if (data?.loopd === 'ext-token' && typeof data.token === 'string')
      chrome.runtime.sendMessage({ kind: 'connect', token: data.token, base: location.origin }).then(ok => { if (ok) window.postMessage({ loopd: 'ext-saved' }, location.origin); });
    if (data?.loopd === 'ext-forget') chrome.runtime.sendMessage({ kind: 'forget' });
  });
  here();
})();
