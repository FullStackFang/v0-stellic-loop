## Context

- The paid plan today: a "Premium" tier of animals (`lib/campus/animal-tiers.ts`), an animal drawn from a pet photo (`lib/campus/custom-face.ts`), and an ask pane in the account card (`components/campus/own-face.tsx`). There is no payment. "Subscribing" records an email in `campus_custom_face`, and `subscribed()` reads that row. `Viewer.asked` carries it to the screen.
- The founder approved, on 2026-11-18: the name Ink and Ink+ (rejected "Foil"), the Ink page mockup (`public/demo/mockups-premium.html`), and the placements mockup (`public/demo/mockups-premium-places.html`) with the words "this is fine, create a spec to place it everywhere you think you should, and have a new navigation tab for the premium mock".
- Standing founder rules that bind this change: every clickable control is a pill, never bare text; one meaning per button; campus panels are wide and one line per piece; student copy never mentions advising.
- The campus bar is drawn twice: in `components/campus/screen.tsx` and in `app/groups/bar.tsx`. Colours come from the person's kit (`components/campus/kit.tsx`), so nothing here may assume the Cornell colours of the mockups.

## Goals / Non-Goals

**Goals:**
- One name, Ink, wherever a person reads about the plan.
- A way to reach the Ink page from any page, in one press.
- The placements that can be honest today: the tab, the account row, the picker, the mark on faces.

**Non-Goals:**
- Charging anyone. No payment provider, no prices in the app outside the Ink page.
- Ink+ as something a person can have. It is named on the Ink page only.
- The passport, gifting and boosts, and so their three placements (see D7).
- Making the Ink page a real app page. It stays the mockup until payment exists.
- Renaming database values, tables or the admin page's own words.

## Decisions

**D1. The Ink page has one address, kept in one place.** A constant `INK_PAGE = '/demo/mockups-premium.html'` in `lib/campus/ink.ts`, used by every placement. When the real page exists, one line changes. Alternative considered: a route `/ink` that redirects to the mockup. Rejected for now: it adds a route to maintain for no gain, and a redirect hides that the target is a mockup.

**D2. The tab is a plain link in the bar's own nav, after the groups.** It reads "Ink" with the mark before it. It is an outlined pill on the bar with a hard shadow, never the kit's field colour, so it stands apart from "This week" and the groups in every kit. It is shown to everyone, signed in or not, as Discord shows Nitro. It opens the Ink page in the same tab. Alternative considered: a yellow pill as in the mockup. Rejected: yellow is the Cornell kit's highlight and clashes with the default lime kit.

**D3. "Has Ink" is one function.** `hasInk(q, personId)` in `lib/campus/ink.ts` wraps today's `subscribed()`. Every placement asks it, so the day payment exists only this function changes. The admin does not count as having Ink for the mark, though the admin can still use every animal.

**D4. The mark is the small stamp from the mockup:** a dashed ring with a dot, drawn once as a component (`InkMark`) and reused in the tab, the account row, the picker and on faces. On a face it sits at the lower right, opposite the level badge, and is `aria-hidden` with the fact carried in the face's label ("Maya, has Ink").

**D5. A face carries `ink: boolean`.** `Face` in `lib/campus/view.ts` gains the field; `lib/campus/screen.ts` fills it for every face it builds from the same query that reads made pictures, so there is no extra query per face. Faces of signed-out previews and of people from outside feeds are `false`.

**D6. The picker keeps its behaviour and changes its words.** Ink animals stay in the one grid and keep opening the ask pane when a person without Ink presses one. The "Premium" filter button becomes "Ink". A "With Ink" chip beside it opens the Ink page. The ask pane's perk list becomes: your book kept for good, give an animal a month, boost a group a month, join at any school. A short line under it says which of these exist today, because three of the four do not yet: the pane must not promise what a person cannot use.

**D7. The three placements that wait.** Each is built by the change that builds its feature, to these rules:

| Placement | Waits for | Rule when built |
|---|---|---|
| The stamp about to go | The passport (stamps, deleted after 30 days without Ink) | A stamp within five days of deletion shows the day it goes and one "Keep it" button to the Ink page. Nothing is shown to someone who has Ink. |
| The gift that arrives | Gifting (one animal a month with Ink) | A gift arrives as a tag naming the giver. "Give one back" opens the gift flow for someone with Ink, the Ink page otherwise. |
| The boost on a reward | Boosts (one a month with Ink) | A boosted reward names who boosted it. "Boost too" places a boost for someone with Ink, opens the Ink page otherwise. |

**D8. Wording.** "Ink" alone in the tab and chips. "Loop Ink" where the plan is introduced (the account row, the ask pane). Never "Premium". The sentence a locked animal answers with becomes "That one comes with Loop Ink."

## Risks / Trade-offs

- [The tab leads to a mockup with a "Mockup" strip and buttons that do nothing] → It is what the founder asked for. The strip stays so nobody takes the prices as live. The ask pane remains the only place that records interest.
- [The perk list names things that do not exist] → D6's line says so plainly; the Ink page is marked as a mockup.
- [The mark shows who asked to subscribe, to everyone] → That is the point of a badge, but nobody agreed to it when they asked. Open question below.
- [The bar is already full on a phone: mark, "This week", groups, reward, avatar] → The tab shows the mark alone under 520px, with "Ink" as its label for screen readers.
- [A second session edits campus styling in this tree] → Keep the CSS in one new block at the end of `app/c/campus.css`.

## Open Questions

1. Should a person be able to hide the mark on their face? I assumed no setting for now.
2. Should the admin page's words change to Ink too? I assumed not.
3. Should the tab also sit on the front door (signed-out landing)? I assumed the bar only.
