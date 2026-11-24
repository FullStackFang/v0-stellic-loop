// Which pages are one event (openspec loopd-browser-extension, design D2 and the table in design.md). Only the address is
// looked at: nothing on the page is read. Every other page gets no card and sends nothing. Loopd's server keys the
// address again on its own (lib/campus/ext-page.ts); this table only decides whether to ask.
(function () {
  const LUMA_PAGES = new Set(['discover', 'home', 'calendar', 'calendars', 'user', 'u', 'signin', 'login', 'signup', 'create', 'settings', 'explore', 'pricing', 'about', 'terms', 'privacy', 'help', 'search', 'events', 'map', 'download', 'check-in']);
  const SLUG = /^[A-Za-z0-9][A-Za-z0-9._~%-]{0,199}$/;

  /** Whether this address is a single event page of Luma, Posh, Eventbrite or CampusGroups. */
  function isEventPage(href) {
    let url;
    try { url = new URL(href); } catch { return false; }
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, ''), parts = url.pathname.split('/').filter(Boolean);
    if (host === 'lu.ma' || host === 'luma.com') return parts.length === 1 && SLUG.test(parts[0]) && !LUMA_PAGES.has(parts[0].toLowerCase());
    if (host === 'posh.vip' || host === 'eventbrite.com') return parts.length === 2 && parts[0] === 'e' && SLUG.test(parts[1]);
    if (/^[a-z0-9-]{1,63}\.campusgroups\.com$/.test(host)) {
      const last = (parts[parts.length - 1] || '').toLowerCase();
      if ((last === 'rsvp' || last === 'rsvp_boot') && parts.length <= 2) return /^\d{1,12}$/.test(url.searchParams.get('id') || '');
      const at = parts.findIndex(part => part.toLowerCase() === 'events');
      return at >= 0 && parts.length === at + 2;
    }
    return false;
  }

  globalThis.LoopdPages = { isEventPage };
})();
