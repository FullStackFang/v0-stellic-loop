## Why

The paid plan now has a name, a page and a set of perks the founder approved on 2026-11-18: **Ink** ($2.99 a month) and **Ink+** ($9.99), shown in `public/demo/mockups-premium.html`. Inside the campus app it is still called "Loop Premium", it is reachable only by opening the animal picker, and its perk list promises things that are no longer the plan. Nobody can find it, and what they find is out of date.

The founder picked the placements from `public/demo/mockups-premium-places.html`, which follows where Discord puts Nitro: one entry that is always there, an offer at the moment something is locked, and marks that other people see.

## What Changes

- The plan is called **Ink** everywhere a person reads it. "Loop Premium" and "Premium" go. The $9.99 tier is **Ink+** and is named only on the Ink page.
- A new **Ink tab in the top bar**, on the campus screen and on the groups pages, for everyone including signed-out visitors. It opens the Ink page.
- The **Ink page** is, for now, the approved mockup at `/demo/mockups-premium.html`. Its buttons do not charge anyone.
- A **row in the account card**: "Loop Ink", one line, and a button to the Ink page. Someone who has Ink sees "You have Ink" there.
- The **animal picker** shows the Ink animals in the same grid as today, each wearing the Ink mark, with one "With Ink" chip that opens the Ink page. The old perk list in the ask pane is replaced by the four perks the Ink page leads with.
- The **Ink mark on a face**: wherever a person's face shows (tickets, the account card, the bar), someone who has Ink wears a small stamp mark on it.
- **Not in this change:** the three placements that need features that do not exist yet. The stamp about to go needs the passport; the gift that arrives needs gifting; the boost on a reward needs boosts. Each is written down in `design.md` so the change that builds the feature builds its placement with it. Payment is also not in this change: "has Ink" keeps meaning what "asked to subscribe" means today.

## Capabilities

### New Capabilities
- `ink-placements`: the plan's name, the Ink page's address, the account row, the mark in the picker and the mark on faces.

### Modified Capabilities
- `campus-screen`: the requirement "Top bar on one line" gains the Ink tab.

## Impact

- `components/campus/screen.tsx` (bar, account card, picker), `components/campus/own-face.tsx` (wording, perk list), `app/groups/bar.tsx` (bar), `app/c/campus.css` (the tab, the row, the mark).
- `lib/campus/view.ts` and `lib/campus/screen.ts`: a face carries whether its person has Ink. `lib/campus/animal-tiers.ts`: the sentence a locked animal answers with.
- No migration. The database keeps the tier value `premium`; only words a person reads change.
- Tests that assert "Premium" in rendered text (`app/c/campus-screen.test.tsx` and others) change with the wording.
- The admin page keeps its own words ("Animals", tiers, "Premium asks"): it is not student-facing. Renaming it is optional and listed as a task.
