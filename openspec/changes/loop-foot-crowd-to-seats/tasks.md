## 1. The foot, the bar alone

- [x] 1.1 Test first in `components/campus/foot.test.tsx`: the foot has no ticket (no "Pick one up", no "Admit everyone", no animal pictures) and its links are Loopd, Terms, Privacy
- [x] 1.2 `components/campus/foot.tsx`: remove the ticket markup, `crowdIn()`, `CROWD` and the constants, the `count` state and the layout effect; drop the imports this orphans
- [x] 1.3 `components/campus/foot.css`: remove the ticket's rules (`.cs-ft-carry`, `.cs-ft-tk`, `.cs-ft-stage`, `.cs-ft-pet`, `.cs-ft-shade`, `.cs-ft-tear`, `.cs-ft-admit`, `.cs-ft-code`) and fix the comments and top padding for a bar alone

## 2. The crowd in Seats

- [x] 2.1 `public/seats/index.html`: give each animal the crowd's turn and lift (look toward the pointer, lean into a run, tiptoe near it); seated ones turn only
- [x] 2.2 Poke: a press with no pull flips an animal that is out and makes its neighbours hop; a pull still picks it up only while the clock runs
- [x] 2.3 The ticket follows a mouse or pen on its paper and tips; floor animals slide and pile up, seated ones stay; on letting go it swings back and they hop; touch scrolls (`touch-action: pan-y`)
- [x] 2.4 Idle hops for an animal on the floor while the page is visible and untouched; the loop rests when nothing moves and when the page is hidden
- [x] 2.5 Reduced motion: none of the above moves anything; the round still plays
- [x] 2.6 Update the script's header comment: it is now the only copy of the crowd

## 3. Tidy up

- [x] 3.1 Remove `openspec/changes/loop-footer-seats` (never built; its footer has no ticket now)
- [x] 3.2 Fix comments that point at the footer's crowd (`public/seats/index.html`, `components/campus/doodles.tsx` if any)

## 4. Check it

- [x] 4.1 `vitest` for the foot test (`--maxWorkers=3`), type check and lint
- [x] 4.2 In the browser: the foot on This week, a groups page, Doodles and the front door is the bar alone (checked: /terms in the browser, the front door by its served HTML; signed-in pages share the same SiteFoot)
- [x] 4.3 In the browser at desktop and phone width: a Seats round with pokes, tipping, looking and idle hops; a won round keeps its best; reduced motion
- [ ] 4.4 The founder's yes
