## Why

Today an "@" on a campus plan means one thing: a place. The founder's intent (2026-11-18) is wider: an @ is anything people might gather around and later want to group by. A place (@collegetown), an activity (@jogging), an event (@slope-day). People will write the same thing in different ways (@jogging, @running, @run), and nobody should have to tidy that up by hand.

## What Changes

- An @ becomes a **tag**, not only a place. A line may carry up to four: "@jogging @collegetown tonight 7".
- Every tag has a **kind**: place, activity, event or other. Nobody is asked for it. Loop works it out behind the scenes. Only a tag of kind place goes on the map and takes exact spots.
- Tags that mean the same thing are **grouped automatically**. @jogging and @run join @running. Nothing a person typed is rewritten: their plan still says @jogging. Counts, suggestions and filters treat the group as one.
- Grouping is done in two layers: first the word table Loop already uses for search (`lib/campus/words.ts`), then, for a tag the table does not know, one small question to a model. A plan is never held up waiting for it, and if the model is off or down, tags simply stay ungrouped.
- While typing an @, the suggestions come from the whole group: typing "@jog" offers "@running · 12 people this week".
- The admin page gets a "Tags" section: every group, its kind, and buttons to split, join or change the kind. A choice made by hand is never overwritten by the automatic pass.
- Wording on the posting panel stops saying "places" where it means tags.
- **Not in this change:** tagging a person. That puts someone's name on a plan they have not agreed to, so it needs to be an invite they accept. It gets its own change.

## Capabilities

### New Capabilities
- `campus-tags`: what a tag is, several per plan, its kind, automatic grouping, suggestions by group, and the admin's corrections. It takes over the requirement "People define @places, and the places others use guide the post" from `campus-one-line` (in `loop-group-event-links`, not yet archived).

### Modified Capabilities

None in `openspec/specs/` (the one-line posting spec is still inside `loop-group-event-links`). Archive that change first, or accept that this change's spec supersedes that one requirement.

## Impact

- Database: one additive migration (`campus_tag.kind`, `same_as`, `sorted_at`, `by_hand`; a `campus_listing_tag` table; existing tags become kind place). The founder applies it by hand.
- `lib/campus/line.ts` (several tags), `lib/campus/tags.ts` (groups, kinds, the sorting pass), `lib/campus/plans.ts` and `app/c/actions.ts` (posting), `lib/campus/screen.ts` and `view.ts`, `components/campus/composer.tsx`, `app/c/admin/page.tsx`, `app/api/cron/campus-feeds` (the sweep).
- A new outside call: tag names and the titles of the plans they came with are sent to a model through the AI Gateway. No names, emails or faces. Off unless a switch is set.
- The spot-settling mockup (`mockups-campus-spot.html`, not built) assumes "the @place"; it will hang off the plan's place tag.
