## Context

`campus_tag` (migration `20261118300000`) is a slug per campus, made on first use. `campus_listing.tag_id` holds one tag per plan. `readLine` (`lib/campus/line.ts`) reads one `@word` from the line, after first treating a time said after an @ ("@tonight") as a time. `nearTags` counts people per tag for the suggestions in the posting panel. The "Near you" map and the spot-settling mockup both assume the tag is a place.

Loop already groups words by meaning without a model: `lib/campus/words.ts` is a fixed table ("run, runs, running, jog, jogging ..." gives the event its "good for" words), which the founder can read and correct.

Founder, 2026-11-18: an @ "could be an activity, it could be a person, an event, it's anything you want to be able to sort of group by in the future"; "@jogging ... smartly associates that to @running"; then, agreeing to the plan: "make some way to intelligently group things behind the scenes automatically".

## Goals / Non-Goals

**Goals**
- Several tags on a plan, of any kind, with no extra question to the person posting.
- Same-meaning tags counted and suggested as one, automatically.
- The map and exact spots keep working: they use the plan's place tag only.
- Wrong grouping is cheap to undo, and a correction sticks.

**Non-Goals**
- Tagging a person (needs consent; separate change).
- Filtering "This week" by a tag, or following a tag. This change makes them possible; it does not build them.
- Translating between languages, or grouping across campuses. A group belongs to one campus.

## Decisions

### D1. A plan has a list of tags; the place is whichever one is a place
New table `campus_listing_tag(listing_id, tag_id, position)`, at most four per plan. `campus_listing.tag_id` stays and means "this plan's place tag" (the first tag of kind place), so the map, `nearTags` callers and spot settling need no rewrite. The migration copies each existing `tag_id` into the new table.
*Instead of* dropping `tag_id`: that would touch every reader for no gain.

### D2. Kind is stored on the tag and worked out, never asked
`campus_tag.kind`: `place`, `activity`, `event`, `other`, or null while not yet sorted. Existing tags become `place` (that is what they were made as). A null-kind tag behaves as `other`: it shows on the plan and in suggestions, and is not put on the map.
A tag's kind is one fact per campus, not per plan. "@track" is whatever that campus mostly means by it; the admin can change it.

### D3. Grouping is a pointer to a lead tag
`campus_tag.same_as` points to the group's lead tag (null for a lead or a loner). One level only: a tag never points at a tag that itself points elsewhere. The lead is the tag in the group that the most people are in plans with, so the suggestion reads as the common word.
What a person typed is kept: the plan stores their tag's own id. Counting and suggesting go through `coalesce(same_as, id)`.
Only tags of the same kind are grouped. A place is never grouped with an activity.

### D4. Two layers decide kind and group, in order
1. **The word table.** `lib/campus/words.ts` gains one exported helper that says whether two words fall under the same first row-pattern ("jog" and "running" both match the run row). Same row means same group, kind `activity`. Also folded here: plurals, and dashes ("college-town" and "collegetown" are one). No outside call.
2. **A model, for what layer 1 does not settle.** One structured question per new tag through the AI Gateway (`generateObject`, a small model): given the tag, up to three titles of plans it came with, and the campus's lead tags with their kinds, answer `{ kind, sameAs: one of those lead tags or null, sure: 0..1 }`. The answer is used for `kind` always, and for `sameAs` only when `sure >= 0.8`, the kinds match, and `sameAs` is one of the tags that were offered (never a name the model made up).

*Instead of* embeddings and nearest neighbour (`lib/emba/embeddings.ts`): a bare word such as "track" or "commons" has no context in an embedding, and a distance cut-off is hard for the founder to reason about. A question with the plan's title beside the tag handles both, and its answer is a plain row an admin can read.

### D5. Sorting never blocks a post
Posting stores the tags with `sorted_at` null and returns. Sorting runs after: layer 1 inside the same request (it is a table lookup), layer 2 in the hourly campus sweep (`/api/cron/campus-feeds`), which takes up to 40 unsorted tags a run, oldest first. Each tag is sent at most once (`sorted_at` is set whether or not an answer came back usable). With the switch `LOOP_TAG_SORTING` not `on`, layer 2 does nothing and tags stay as layer 1 left them.

### D6. A choice made by hand wins for good
The admin page's Tags section lists groups and loners with kind and people count. The admin can change a kind, join a tag to a group, or split one out. Any of these sets `by_hand`, and the sweep never touches a `by_hand` tag again. Same rule as `words_by_hand` on events.

### D7. Suggestions search the group
Typing "@jog" matches any tag in a group whose own slug starts with what is typed, and offers the group's lead with the group's people count. Picking it writes the lead ("@running"). The person may also keep typing their own word; it is accepted and will be grouped.

### D8. The line reads up to four tags
`readLine` returns `tags: string[]` in the order typed (and keeps `tag`, the first, until callers are moved). The time-after-@ rule stays ahead of tag reading. "in/at/on" before any tag is dropped, as now. A fifth tag stays in the title as written.

### D9. What is sent outside
Only the tag, plan titles, and other tags' names. No person's name, email, face or id. Requests use the gateway's zero-retention option, as the embeddings adapter does. Titles are written by students and may contain anything; that is the same text already shown to the whole campus.

## My calls the founder has not confirmed
- Four tags a plan at most.
- The 0.8 bar, and that kind is taken from the model even when the grouping is not.
- A model is asked at all for kind (the alternative: everything the table does not know stays `other` until the admin sorts it).
- Existing tags all become `place`.
- The lead of a group is its most-used tag, so a group's shown name can change as use shifts.
- Person tags left out of this change.

Made while building (2026-11-18), also not confirmed:
- **Layer 1 does not use the search table's rows to group.** D4 said two words under the same row of `TABLE` are one tag. Those rows are too wide for that: one row holds basketball, soccer and tennis, another dinner, pizza and sushi, and some hold places (library, gym, gorge). Grouping by them would have joined @soccer to @basketball and called @library an activity. So `lib/campus/words.ts` has a second, narrower table (`SAME`) of words that really are one tag (run, running, jog, jogging), and `tagRow` reads only that. A word in it is kind activity. The founder can read and correct it like the first.
- A word the table does not know stays unsorted (it behaves as other) until the admin sets it, since the model layer is not built (1.3).
- A tag that differs from another only by a dash or a plural "s" joins it and takes its kind, whatever that kind is.
- The lead is picked again each time a plan is posted with a tag of the group, counting people in plans ever (not only this week). On a tie the lead stays.
- A kind belongs to the whole group: changing one tag's kind on the admin page changes its group's, and marks all of them set by hand. Joining a tag to a group gives it that group's kind.
- A tag set by hand can still be joined by a new spelling of it, and the group's lead can still move to another of its tags. Its kind and which group it is in are what stay.
- The old index on `campus_listing.tag_id` was named `campus_listing_tag`, the name the new table needs. The migration renames the index to `campus_listing_tag_id`.
- A plan's tags all show on its ticket and are all searchable. `tag_id` (the place) has no reader yet besides the list; the map still places a plan by its place text, as before.
- "Already on" in the posting panel offers plans with any tag of the line, or of the same group, to join.

### D10. The posting panel is three lines (founder, 2026-11-18)
Founder: "3 lines is fine, i prefer wider vs longer but not arbitrarily long, just perhaps suggest top choices not an unlimited list". The panel is the line with its button, what Loop read, and one row of what is nearby. That row holds one thing at a time: tags (while an @ is typed, or the line has none people are in plans with) or plans to join. Nothing scrolls sideways.
Founder, same day: a plan in that row is never joined from the row ("people would need to look at the info where, location details and then decide to join or not (perhaps it's invite only etc)"). Its button is a magnifying glass (founder asked for it in place of a word): it closes the posting panel and opens the plan's own panel, which has the one way in. The way in stays where it was, on the plan's ticket, and in a row the open ticket and its panel are drawn as one piece (no gap, same height, a tear line between), as the founder asked. Not confirmed: the line being typed is dropped when the posting panel closes, and a search left in the box is cleared.
My calls here, not confirmed: five tags and three plans at most; a tag pill is the tag and its people count, with the names the viewer knows only in its hover title; a plan in the row has no faces; the row's heading is "Near you", "Starts with @x" or "Already on"; the sentence "Shows at Cornell at once" shows only when the row has nothing else.

## Risks / Trade-offs
- **A wrong merge hides a real difference** ("@track" the sport joined to "@track" the place). Held down by same-kind-only grouping, the 0.8 bar, and one-click split that sticks.
- **A kind that is wrong keeps a place off the map**, or puts an activity on it. The map only uses tags with a known location anyway, so an activity mis-sorted as a place shows nowhere rather than somewhere wrong.
- **Cost and failure of the outside call.** One small call per new tag, capped at 40 an hour per sweep; a failure leaves the tag ungrouped and is not retried.
- **Student-written text reaches a model provider.** See D9; the switch is off by default, so this is the founder's choice to turn on.

## Migration Plan
One additive migration, dated after the newest in `supabase/migrations/`. Code tolerates its absence only in the sense that the feature is behind the reader change: ship the migration first, then the code. The founder applies it by hand. Rolling back the code leaves the new columns unused.

## Open Questions
- Which model. A small one is enough; the id goes in one constant.
- Whether the lead's name should be fixed once chosen instead of following use.

### D11. No model; a monthly batch (founder, 2026-11-18)
Founder: "we can just create a compendium ... to start, and we can track all of the events that get made, and at the end of each month try to group them and process it etc, doesn't need to be real time". Layer 2 (D9, the model sweep) is not built. Grouping is the word table at posting time, plus a pass about once a month over what people actually made: every tag and every plan is already kept (`campus_tag`, `campus_listing_tag`), a tag the table did not know has no kind, and the admin Tags section joins, splits and labels. What the month's pass teaches goes back into the word table. How that pass is run (by hand in Tags, or with a script or a model over the month's export) is not decided.
