## Context

Conga is a plain page under `public/conga`, served at `/conga`, linked from the top bar (`components/campus/top-bar.tsx`). It keeps the player's best in the browser under `conga-best`. Pages that draw no campus screen of their own (Ink, Admin) get the bar and the foot from `siteBar()` in `app/c/site-bar.tsx`.

## Goals / Non-Goals

**Goals:** one page for every game; one link in the bar however many there are; a way to keep a game on the page before it is out.

**Non-Goals:** moving Conga's files, a database of games, scores on the server, a game on an event card.

## Decisions

**D1. The list is code.** `DOODLES` in `lib/campus/doodles.ts` names each game, where it is played and whether it is out. With two games a table and an admin form would be more to own than the list they replace. Putting a game out is a one-word change and a deploy.

**D2. Staged means admin only.** `doodlesFor(admin)` leaves staged ones out for everyone else, on the server, so their names never reach another person's browser.

**D3. The page is under `/c`.** The sign-in is read there (`proxy.ts`), which the page needs to know the admin. It follows the Ink page: open to signed-out visitors, the bar drawn from the campus last looked at.

**D4. The pictures are CSS.** Each ticket's moving picture is a few animals on a CSS path, not the game. The page loads no game to show one.

**D5. The best score is read in the browser.** The stub shows "Your best" from the game's own stored value, and nothing before a first game.

**D6. Staged tickets say "Try".** For the admin a staged ticket links to where the game is being worked on. For Seats that is its mockup.

## Risks / Trade-offs

- [The bar has one more full page link, and Conga is now two presses away] → the founder asked for one home for games; Conga's address has not changed.
- [The name is not confirmed word for word] → it is one string in the bar, the page title and the address.

## Open Questions

1. Is "Doodles" the name?
2. Should Conga's "back to Loopd" lead to Doodles?
