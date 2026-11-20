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

**D6. Staged tickets say "Try".** For the admin a staged ticket links to where the game is being worked on. Nothing is staged today.

**D7. Seats is a plain page.** `public/seats/index.html`, served at `/seats` as Conga is at `/conga`: the footer ticket of `public/demo/mockups-footer-seats.html` with the mockup strip taken off, a way back to Doodles, and "In the works". It wears the colours the person picked. The game (founder, 2026-11-20: "they all get kicked out and you need to put them back in the same order, and there is a timer for the fastest"): each round gives every animal a seat and shows it there; "Kick them out" throws all to the floor and starts the clock; an animal sits only in its own seat; a wrong seat adds 2 seconds; the clock stops when all are in. The best time is kept in the browser under `seats-best` and shown on the Doodles ticket. A narrow window holds fewer animals, so a phone best is not a desktop best.

## Risks / Trade-offs

- [The bar has one more full page link, and Conga is now two presses away] → the founder asked for one home for games; Conga's address has not changed.
- [The name is not confirmed word for word] → it is one string in the bar, the page title and the address.

## Open Questions

1. Is "Doodles" the name?
2. Should Conga's "back to Loopd" lead to Doodles?

**D8. Flourishes, and your own animal.** Asked for on 2026-11-20 ("add some nice touches and flourishes", "with ink+ you can choose your avatar to participate in the game instead of random"). The seated animals bob while they are shown; the ticket jolts on the kick; an animal lands in its own seat with a squash and a ring; a wrong seat sends up "+2s"; on "All in" the row cheers, ink drops fly in the school colours, and the time is stamped on the stub, in the third ink when it is a best. All of it is CSS on `translate`, `scale` and `rotate`, which add to the transform the script moves the animals with, and none of it plays with reduced motion. The page is served by `app/seats/route.ts`, which writes who is playing into it exactly as `app/conga` does (the same `congaPlayer`). With Ink+ one of the person's own animals takes a place in the crowd with a spark, chosen from a "You" pill above the ticket and kept under `seats-own`. Without Ink+ a pill says what it gives and leads to the Ink page.
