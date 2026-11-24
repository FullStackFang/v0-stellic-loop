## Why

"Join our platform" is a weak way to open a conversation with a bar owner. "Here is how often AI assistants recommend you when a group asks where to go, and who they name instead" is a strong one, and it leads straight to what Loopd offers. The report has to be cheap to make for a handful of venues and honest about how it was measured.

## What Changes

- A script the founder runs for one venue. It asks several assistants the same set of group-outing questions about the venue's area and counts how often the venue is named.
- A one-page sheet from the result: the headline number, the split by assistant, who was named instead, a few of the questions, and Loopd's offer.
- Before asking anything, the script says how many questions it will send and to which assistants, and stops unless told to go ahead.
- The sheet says on its face how and when the answers were gathered.
- The venue's Loopd record numbers appear on the sheet only when given.
- Nothing is added to the app. The sheet is a file the founder sends.
- Mockup: `public/demo/mockups-six-adds.html`, section 6.

## Capabilities

### New Capabilities
- `venue-ai-report`: the questions, the counting, the cost check before running, and what the sheet shows and admits.

### Modified Capabilities

(none)

## Impact

- New: `scripts/venue-ai-report.ts`, `lib/report/` (counting and the sheet, with tests), `scripts/venue-questions.json`.
- Uses the `ai` package already in the repo, through the Vercel AI Gateway, so one key reaches every assistant.
- Each run costs a little in assistant usage. The founder approves each run.
- No migration, no page, no route.
