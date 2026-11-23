## Context

Grounds today (`PLACES` in `public/conga/maps.js`): Cornell's hill and Cornell Tech (school `cornell`), Morningside (`columbia`), Washington Square (`nyu`). The player written into the page is `{ ink, plus, kit, schools, animals }` or null when signed out (`lib/campus/conga.ts`); `plus` is true for Ink+ and for admins.

The rule now, in two places that must agree:

- Game: `mineSchool = school => !you || you.plus || !grounded().length || grounded().includes(school)`.
- Server: `saveBest()` refuses a round only when the player has a grounded school, lacks Ink+, and the ground is another school's.

So signed out, or with no grounded school, everything is open. That was chosen on purpose when the picker was built ("with no school that has a ground every ground is open"); the founder has now reversed it.

## Goals / Non-Goals

**Goals:**

- A stranger sees that grounds belong to schools, and has one ground to play at once.
- One rule, one place.
- The lock always says the cheapest true way in.

**Non-Goals:**

- Stopping someone from reading the map files. They are public; only the board is the server's to guard.
- Changing prices, what Ink+ holds, or the board's weekly rule.
- A new ground. If the founder picks a neutral ground, drawing it is the `conga-new-map` skill's work and a change of its own.

## Decisions

**D1. One rule in `maps.js`.** `maps.js` is already read by both the game and the server.

```js
export const OPEN_GROUND = 'cornell';
/** The grounds a player may play. `player`: { schools, plus } or null when signed out. */
export const mayPlay = (player, id) => {
  if (player?.plus) return true;
  const own = (player?.schools ?? []).filter(school => Object.values(PLACES).some(place => place.school === school));
  return own.length ? own.includes(PLACES[id].school) : id === OPEN_GROUND;
};
```

The game's `free(id)` becomes `mayPlay(you, id)`; `mineSchool(school)` becomes "any of that school's grounds may be played". `saveBest()` calls the same function. *Instead of* keeping two copies in step by comment, which is how they are kept now.

**D2. A stranger's open ground is one ground, not one school.** With Cornell as the choice, a stranger plays the hill and sees Cornell Tech locked like any other. *Instead of* opening the whole school: "Cornell is free for everyone" would make Cornell's own players' second ground worth nothing, and the lesson for a stranger should be "one taste", the same whichever ground is chosen.

**D3. The ground at load.** `where` is taken from `?map=`, then the kept `conga-map`, then `cornell`. After the player is known (it is written into the page, so it is known at once), a ground they may not play is replaced by the first they may, own school first, and the picker's ticket shows that ground. The check that exists for signed-in players (`if (!free(where)) open(...)`) is run for everyone. A Play link from another school's Doodles page therefore lands a stranger on the open ground; the sheet is opened on the school they asked for with its ask showing, so they see why.

**D4. What a locked ground says.** Shown to all, never hidden (the founder's rule for paid things). The ask card reads by who is looking:

- Signed out: "Morningside is Columbia's ground. At Columbia? Sign in and it's yours." with **Sign in** first and **See Ink+ · $9.99** second.
- Signed in, no grounded school, or another school's: as now, "Every school's grounds come with Ink+".

Sign in uses what the board's "Sign in to go on the board" already uses (`tell('signin')` to the app page, or `/conga`). The card's shape is the existing ask; only its words and a second button change. Wording and the two-button layout are shown as a mockup (`/demo/mockups-conga-gate.html`, phone and laptop, opened in the locked state) and built after the founder's yes.

**D5. The board.** `saveBest()` keeps a round only where `mayPlay(player, map)`. A signed-in stranger playing the open ground is kept on its board, under their own school's colours as every row is: they are signed in, and a board with more names on it is better than a rule nobody can see. Signed out stays unkept, shown "You, once signed in".

**D6. Rounds already on a board.** This week's rows from strangers on grounds now locked to them stay until the week turns; nothing is deleted. Their own row still shows to them.

## Risks / Trade-offs

- [A visitor who played Columbia's ground yesterday finds it locked] → the ask says the free way in first; the kept `conga-map` falls back quietly to the open ground.
- [Cornell's board fills with strangers] → they carry their own school's tag; if the founder would rather keep boards to their schools, D5 becomes "not kept" in one line.
- [The game and server drift apart again] → D1; a test calls `mayPlay` for each kind of player against every ground, and `saveBest`'s tests use the same table.
- [A signed-out student of a school with a ground is told to pay] → D4 puts Sign in first for anyone signed out.

## Migration Plan

Ships in one commit on local main after the mockup's yes. No data to move. Taking it back is reverting `mayPlay` to the old rule.

## Open Questions

**Which ground is open to strangers?** One constant (`OPEN_GROUND`), so it can change later without other work.

1. **Cornell's hill** (working choice; the founder's first thought). Nothing to draw, a finished ground with its own toys, and a true story: "where Loopd began". A stranger's first sight of the game is another school's campus.
2. **Ground of the week.** One ground open to everyone each week, turning with the weekly board. Every school gets shown off in turn, and there is a reason to come back on Monday. Needs a line on the card ("This week: Morningside") and a rule for the order; no art.
3. **The campus they came from.** A stranger arriving from a campus's page (`?map=`) plays that one ground and no other; arriving bare, Cornell. Friendliest to a Columbia visitor not yet signed in, but the lock is then rarely seen, which is the complaint this change answers.
4. **A neutral Loopd ground.** A small made-up quad that belongs to no school, with its own board. The cleanest story, and the only choice that needs drawing a new ground.

Recommended: 1 now, and 2 later if strangers turn out to matter.

**Is a signed-in stranger kept on the open ground's board?** D5 says yes.

## After the review (2026-11-23)

A second agent checked this design against the code. The founder then said to build it, with Cornell's hill as the open ground. What changed:

- **The open ground is open to everyone, not only to strangers.** As first written, a Columbia student played the hill signed out and lost it on signing in, and a round they played signed out ("You, once signed in") was refused once they had signed in. The rule is now: a ground may be played if the player has Ink+, or it is the open ground, or it is one of their schools'. D1's function becomes:

  ```js
  export const mayPlay = (player, id) => !!PLACES[id] && (!!player?.plus || id === OPEN_GROUND || (player?.schools ?? []).includes(PLACES[id].school));
  ```

  It answers false for a ground that does not exist, for anyone.
- **The ground at load is decided once, before anything reads it** (D3). The player is written into the page before the game's script runs, so `where` is settled with `mayPlay(window.congaPlayer ?? null, …)` where it is first set, and only one world is made. The kept choice is left as it is in the browser, so a visitor who later signs in gets their own ground back.
- **D6's "their own row still shows to them" was wrong** and is struck: a card shows only the board of the ground being played.
- **The Ink+ ask** names the ground pressed, not every ground of that school, comes back to that ground after joining (`back` carried the open ground), and no longer says "Yours stay free" to someone with no ground of their own.
- **The lock chip** on a school's row says "Sign in" to someone signed out and "Ink+" to someone signed in. Signed out, the card's first button is Sign in.
- **The measuring script and the still views** (`?at=`) need grounds a signed-out browser may not play. The script gives itself a player with Ink+ before the page's own scripts run; nothing is added to the game for it.
- **Tests that held the old rule** are `lib/campus/conga-board.test.ts` (a player with no grounded school was kept on Columbia) and the lists in `app/conga/sim.test.ts`; the paths in the proposal's Impact were wrong.
- **Left alone, noted:** `MAPPED` in `lib/campus/doodles.ts` is a third list of grounds kept in step by a test. A signed-in player whose school ticks more schools on LinkedIn gets those schools' grounds too, since the rule goes by the schools on their account.
- **A school that gets a ground later** takes nothing away any more: the open ground stays open to its players.
