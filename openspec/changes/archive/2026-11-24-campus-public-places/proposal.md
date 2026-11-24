## Why

More and more people ask an assistant where to go. Today an assistant cannot see anything in Loopd: the campus pages need a school email, there is no guide file for assistants, and nothing can be asked without installing a connector. Public pages for places and listed events, with counts only, let assistants and search engines read and recommend them while everything about people stays behind the school gate.

## What Changes

- A public page per place: its name and address, what is on there this week from feeds and hand-entered events, and how many are going to each. No sign-in needed.
- A public page per feed or hand-entered event.
- A guide file at `/llms.txt` saying what Loopd is, which pages can be read, the one address that can be asked, and what will not be found.
- One address to ask, `/api/ask`, answering "what is on near this campus, for this many people, at this time" with the same public facts as the pages.
- A sitemap of these pages, and robots rules that allow them.
- Nothing about people: no names, no faces, no plans a student posted, no who is going. A bar on each page says a school email shows who you know.
- Mockup: `public/demo/mockups-six-adds.html`, section 5.

## Capabilities

### New Capabilities
- `public-places`: the public place and event pages, the guide file, the ask address, the sitemap, and the rule about what they never show.

### Modified Capabilities

(none)

## Impact

- New: `lib/campus/public.ts`, pages under `app/places/` and `app/events/`, `app/llms.txt/route.ts`, `app/api/ask/route.ts`, `app/sitemap.ts`; `app/robots.ts` changes.
- Reads `lib/campus/listings.ts`, `lib/campus/place-tags.ts`, and `lib/campus/record.ts` when `campus-venue-record` is built and a record is public.
- No migration.
- The school gate on `/c` does not change.
