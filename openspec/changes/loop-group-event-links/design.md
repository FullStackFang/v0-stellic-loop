## Context

Group events live in `emba_team_event` (`lib/emba/team-events.ts`). An event has a tag, a name, optional start, end, place, link and note, a share link, and interest marks. Only owners and organizers add one (`need:'manage'`); a group holds at most 50 upcoming events; adding one enters the change sequence, so every member's `whats_new` and `waiting` reports it. The event's `url` is documented as "a pointer only, never fetched".

The campus side has a calendar-feed reader (`lib/campus/import.ts`): `parseFeed` turns iCal text into items, and `readFeeds` syncs them into `campus_listing` every hour. Its tables hang off `campus`. The campus pages are live in production as of 2026-11-18 (PRs #13 to #16: school colours, the ticket front door, the shared header that links to the person's team). Those merges changed only campus pages, styles and `lib/campus/session.ts`; none touched `lib/emba`, `app/groups`, the cron routes, `vercel.json` or the migrations, so this change starts from the same team-side code it was written against. This change leaves every campus page and table as it is.

Settled with the founder on 2026-11-18:
- A group is seeded with local events, and any member can link an event from Posh, Luma or similar.
- No curation: a real event on a known site is in. Nothing a member has expressed intent for is second-guessed.
- It lives in the existing hosted Supabase database.

Checked on 2026-11-18 by fetching live pages: a Luma event page carries a schema.org `Event` in a `application/ld+json` script (name, start and end with offset, address, coordinates, organizer). A Posh event page carries the same `Event` object, but as a string inside the Next.js `self.__next_f.push` payload, not as a script tag. Posh has no public feed or API. Luma offers an iCal feed per calendar. Eventbrite's public search API is closed; its event pages were not checked.

## Goals / Non-Goals

**Goals:**
- A member adds an event by pasting one link, with nothing to approve.
- A new group shows local things to do before any member has added anything.
- Seeded items do not flood `whats_new`, `waiting`, or the 50-event cap.
- One reader path per source kind, reusing `parseFeed` and the existing event, interest, share-link and calendar code.

**Non-Goals:**
- A distance radius or map. Public CampusGroups feeds replace the place with "Sign in to…", so a radius would silently drop most items. Locality comes from which feeds the group has.
- Crawling listing or explore pages of any site.
- Approval, moderation, ranking or recommendation.
- Reading sites that need a sign-in (Partiful, Instagram).
- Sharing feeds or nearby items between groups, or with the campus tables.
- A control on the in-chat card.

## Decisions

### D1. A linked event is an ordinary group event with a source
`emba_team_event` gains `source` (`'link'`, `'feed'` or null), `source_follow boolean`, `source_read_at`, `source_gone_at`. The pasted link is stored in the existing `url` column in the normal form `normaliseLink` already produces, with the query and fragment dropped for the listed sites. A partial unique index on `(org_id, loop_id, url)` where `source='link'` and not archived makes "one event per link" a database rule.

Why not a separate table: interest, the share page, calendar invites, `whats_new`, `waiting` and the card all read `emba_team_event`. A second table would need all of them again.

### D2. Members add by link through a new write, not through `add`
A new `linkEvent` in `team-events.ts` uses `teamWrite` with `need:'post'`. It makes the tag from the name (`slugOf`, with a numeric suffix when taken), respects the 50-event cap, adds at most 10 upcoming linked events per member, logs `event_added`, and marks the caller interested in the same transaction. `add`, `change` and `archive` keep `need:'manage'`.

Alternative considered: lowering `add` to `need:'post'`. Rejected because it would let any member create undated label events and change the meaning of the existing tool.

### D3. Reading a page: fixed sites, one reader each
`lib/emba/event-link.ts` exports `readEventPage(url, fetch)` returning the facts or a reason. Sites and readers:

| Host | Reader |
|---|---|
| `lu.ma`, `luma.com` | first `Event` in `application/ld+json` |
| `posh.vip` (path `/e/…`) | the `Event` object inside the `__next_f` payload, then the same mapping |
| `www.eventbrite.com` | `application/ld+json`, to be confirmed against a saved page in task 2.1 |

A page counts as an event when it yields a name and a start instant. Name, place and host are cut to the existing column limits and stripped of the characters the columns refuse. Everything read is untrusted text and is returned to assistants under the existing untrusted marking.

A link on any other host is never fetched. The member supplies name and start, and the link is kept as the pointer it always was. The same fallback applies when a listed site cannot be read.

Why a fixed list rather than "any page with event data": a member-supplied address fetched from the server is a way to probe private addresses, and the founder's rule is "a real Luma event, a real Posh event or something like that".

### D4. One guarded fetch for both readers
A small helper (`lib/guarded-fetch.ts`): https only, no credentials or cookies, a generic user agent, 15-second limit, 5 MB cap, redirects followed by hand (at most 3) with every hop re-checked. For links, every hop must be on the fixed list. For feeds, every hop's host must resolve to a public address (loopback, private, link-local and unique-local ranges refused).

Known gap: a host that changes its DNS answer between the check and the request. Accepted, because feed addresses are entered only by an owner or organizer on the site, and nothing of the response is shown unless it parses as a calendar.

### D5. Same link twice, taking back
Pasting a link the group already has returns the existing event and marks the caller interested. The member who added a linked event can archive it while no other member is interested; after that it is no longer only theirs. Owners and organizers archive as before. An archived link can be added again.

The "while nobody else is interested" limit is my reading of "we don't curate anything someone expresses intent for"; it was not stated by the founder.

### D6. Daily re-read
The daily cron re-reads upcoming events with `source='link'`, `source_follow`, on a listed host, oldest read first, at most 200 per run. A changed start, end or place goes through the same code as an organizer's change, so `whats_new` reports it and sent calendar invites move. A page that is gone or says cancelled sets `source_gone_at`; the event is labelled "No longer listed at the source" and is never archived by Loop. When an owner or organizer changes a linked event by hand, `source_follow` turns off and the re-read leaves it alone.

### D7. Nearby is its own list, promoted on first interest
Two new tables:
- `emba_team_feed`: group, name, address, on/off, added by, last read time, last result. At most 10 per group.
- `emba_team_nearby`: group, feed, the feed's item id, title, start, end, place, host, item link, the group event it became (`event_id`), and when it left the feed. Unique on feed and item id.

`lib/emba/team-nearby.ts` syncs a feed with `parseFeed` (group's timezone), keeping items that start within 14 days, and marking items gone from the feed. The Nearby list is the soonest 30 that have not ended, have not left their feed and have no `event_id`.

When a member marks interest in a nearby item, `linkEvent` creates the group event from it with `source='feed'`, sets `event_id`, and marks them interested. From then on the hourly read updates that event the way D6 does.

Why not make every feed item a group event: an hourly read of a busy club feed would exceed the 50-event cap in one pass and put dozens of entries in every member's `whats_new` and `waiting`.

Why not reuse `campus_feed` and `campus_listing`: they require a campus, and carry places, words, outings and rewards the team side does not use. A campus page's week list and a group's Nearby list can show the same club event; they are separate lists for separate audiences, and joining them is left for a later change. The pure parser is shared; the two sync loops are about 40 lines each and write different tables.

### D8. Recognising the same event from two sources
When a link is read, or a feed item arrives, and the group already holds an upcoming event or nearby item with the same start instant and the same name (compared lowercase, letters and digits only), they are treated as one: the nearby item is promoted or attached instead of listed twice. This is deliberately strict; two differently worded titles stay separate.

### D9. Who manages feeds
Owners and organizers, on the site only, like the group's brief. An assistant cannot add a feed, so no model-supplied address is ever fetched as a feed. Adding a feed reads it once at once and shows the result.

### D10. Surfaces
- **Team page, events tab:** one paste box above the list for members who can post; when the page cannot be read, the box opens name and start fields. A "Nearby" section under upcoming events with one "Interested" control per item. A "Feeds" block for owners and organizers with add, on/off, "Read now" and the last result.
- **Connector:** new tool `link_event` (team; `url` or `nearby` code; optional name, start, end, place for unreadable links). `whats_on` gains a Nearby section listing each item with its code. `link_event` joins `TEAM_TOOLS`.
- Styles follow `app/groups/groups.css`.

### D11. The campus gets the link on "Post a plan" (added 2026-11-18)
The founder, on seeing the team page: the live app is the campus view, where the groups site is the admin's alone, so any user must be able to create an event or link and load one there. The campus already has both halves: feeds fill This week (admin page) and "Post a plan" lets anyone create one. So this adds only the link, to that form, and no second way to post.

- Paste, read, check, post. "Fill in" reads the page with the D3 readers and the D4 fetch and fills the form; nothing is saved until "Post it". A group link saves at once because a group is closed; a campus list is seen by a whole school, so the person looks first.
- A linked plan is an ordinary plan (`origin='member'`) with one new column, `campus_listing.link`. Same three-plan cap and 14 days ahead.
- Same link, same campus, not ended: nothing is added, the person is counted in (D5's rule). Held on the campus row so two at once make one plan.
- The page's organizer goes in the line about it, never in `host_name`: group rewards can ride on every event of a host name, and a member must not be able to post into one.
- No daily re-read on the campus: the poster can change the plan, and the admin can hide it.
- Alternative considered: a separate "Add from link" page. Rejected: two doors to one list.

## Risks / Trade-offs

- [Posh changes its page payload] → the reader returns "cannot read", the member types name and time; a saved-page fixture test shows the break; the daily re-read marks nothing gone on a parse failure, only on a missing page.
- [A site blocks server requests or objects to them] → one page per member action and one re-read a day per event; no listing pages; a blocked site behaves like an unreadable one.
- [A member floods the group with links] → 10 upcoming linked events per member, the 50-event cap, existing per-assistant write counting; owners and organizers can archive.
- [Linked events notify every member through `waiting`] → intended, it is how a suggestion reaches the group; the per-member cap bounds it.
- [Duplicates slip past the strict match in D8] → accepted; an organizer can archive one.
- [Feed address used to reach an internal host] → D4 checks, organizer-only, site-only entry.
- [Text from a page carries instructions aimed at an assistant] → stored as plain event fields within existing limits and returned under the existing untrusted marking.

## Migration Plan

1. One migration, `supabase/migrations/20261118000000_emba_event_links.sql`: the four columns and index on `emba_team_event`, the two tables with row level security on and no grants to `anon` or `authenticated`, matching the other team tables. All additive.
2. The founder applies it by hand on the hosted project before the deploy.
3. Deploy. Add the hourly cron entry in `vercel.json`.
4. Rollback: remove the cron entry and redeploy the previous build. The new columns and tables can stay; nothing else reads them.

## Open Questions

- Which feeds seed the founder's EMBA cohort first. Needed to try it for real, not to build it.
- Whether Eventbrite stays on the list if its saved page shows no usable event data (task 2.1 decides; dropping it changes no other part).

## Implementation notes (2026-11-18)

What was built differs from, or adds to, the decisions above in these places. None was confirmed by the founder.

- **Eventbrite stays on the list.** A saved page (task 2.1) carries a `SocialEvent` in `application/ld+json` with name, start, end and place.
- **`linkEvent` and `unlinkEvent` live in `lib/emba/team-event-links.ts`**, not in `team-events.ts`, with the daily re-read. `team-interest.ts` already imports `team-events.ts`, and adding by link needs the interest code, so one file would have made a circular import.
- **The host is kept in the event's note** as "Hosted by …". The event table has no host column and D1 adds none.
- **A feed item has no link of its own.** `parseFeed` is reused unchanged and does not return one, so an event made from a nearby item has no link, and `emba_team_nearby` has no link column.
- **A feed can be removed**, not only turned off. With a limit of 10 and no removal, a mistyped address would hold a place for good. Events made from a removed feed are kept and stop following it.
- **The limit of 10 feeds is a column rule** (`slot` 1 to 10, unique per group).
- **A link whose page matches an event the group already has** (same name and start, D8) marks the caller interested in that event and adds nothing. This also covers the same Luma event pasted as `lu.ma/…` and as `luma.com/…`.
- **An event that matches both a link and a feed item follows the link**, read daily. The feed item is held against it and not listed.
- **A member-typed event on a page Loop cannot read is not followed.** Only facts Loop read itself are kept in step.
- **Taking back an event made from nearby returns the item to the Nearby list.** An organizer's archive does not.
- **The daily job's answer is unchanged** (`{ idled }`); the re-read reports nothing in it.
- **No control on the in-chat card**, as the non-goals say: `link_event` is a plain tool.
