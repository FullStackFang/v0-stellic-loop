# The Loopd extension (Chrome)

A Loopd card on top of Luma, Posh, Eventbrite and CampusGroups event pages: who you know is going, and "I'm in".
Spec: `openspec/changes/loopd-browser-extension`. Look: `public/demo/mockups-six-adds.html`, section 3.

## Load it for the demo

1. Run the migration `supabase/migrations/20261124090000_campus_ext.sql` once (one database serves localhost and production).
2. Start the app (`npm run dev`, on http://localhost:3000).
3. In Chrome open `chrome://extensions`, turn on **Developer mode**, press **Load unpacked** and pick this `extension/` folder.
4. Sign in to Loopd, then open **Account card → More → Browser extension** (`/ext/connect`) and press **Connect**.
   The extension keeps the token for the Loopd address it was connected on (localhost or getloopdin.social).
5. Open an event page, for example a `lu.ma/...`, `posh.vip/e/...`, `eventbrite.com/e/...` or CampusGroups event. The card sits in the top right corner.

**Close** hides the card on that page; the Loopd toolbar button brings it back. Disconnect is on the same `/ext/connect` page.
After changing a file here, press the reload arrow on the extension in `chrome://extensions` and reload the event page.

## What is in it

| File | Does |
|---|---|
| `manifest.json` | Manifest V3: the four sites, the Loopd addresses, the service worker, two content scripts, the toolbar button. |
| `pages.js` | Which addresses are one event page. Nothing on the page is read. |
| `card.js` | Draws the card for one answer from Loopd. Text only, never markup. |
| `content.js` | On event pages: asks the service worker, draws the card in a closed shadow root, follows address changes. |
| `connect.js` | On Loopd's `/ext/connect` only: passes the token from the page to the service worker. |
| `worker.js` | Keeps the token in extension storage and makes the three calls (`/api/ext/event`, `/api/ext/in`, `/api/ext/leave`). |

What is sent: the event page's address and the extension's token, only on single event pages of the four sites.

Tests: `npx vitest run extension/extension.test.ts`.
