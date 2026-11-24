## 1. Find out first

- [x] 1.1 Read the installed AI SDK docs in `node_modules/ai/docs/` for plain text generation, structured output and gateway model names, and load the `vercel:ai-gateway` skill. Do not write model names or call shapes from memory.
- [x] 1.2 From the gateway's current model list, pick one model each from three makers, note whether a web-search option exists for each, and note their listed prices. Write the three names and the search answer in design.md under D2 and D4.
- [x] 1.3 Confirm how the gateway key is supplied locally (`vercel env`), without printing it.

## 2. Counting and the sheet (`lib/report/`)

- [x] 2.1 Tests first, on saved sample answers: named by another spelling; not named; named twice counts once; case, punctuation and "the"; by-assistant counts add up; top three named instead.
- [x] 2.2 `countReport(venue, alsoNames, answers)` as a pure function.
- [x] 2.3 `sheetHtml(report, { record? })`: one self-contained page to match `public/demo/mockups-six-adds.html` section 6, with the measured-how line. System font stack, no outside files. Tests: "N of M" present and no "%"; the how line; offer with and without record numbers; no `http` reference to load.

## 3. The script (`scripts/venue-ai-report.ts`)

- [x] 3.1 `scripts/venue-questions.json`: ten questions with `{area}` and `{campus}`.
- [x] 3.2 Arguments: `--venue`, `--also`, `--area`, `--campus`, `--record`, `--out`, `--check`, `--yes`. Refuse an `--out` inside the repo.
- [x] 3.3 Without `--yes`: print venue, assistants, call count and rough cost; exit without calling anything. Test this path with the caller stubbed to throw.
- [x] 3.4 With `--yes`: check the three names against the gateway list and stop clearly on a stale one; ask each question of each assistant; read each answer into place names with the reading call; save the raw result as JSON; write the sheet.
- [x] 3.5 `--check`: print each answer beside the names read from it.

## 4. Check and land

- [x] 4.1 Run only the affected tests with `--maxWorkers=3`, then eslint. No build: nothing here ships in the app.
- [x] 4.2 Ask the founder for a yes, with the call count and cost from the dry run, before the first real run. Then run it for one venue, read the `--check` output against the answers by eye, and open the sheet.
- [x] 4.3 Commit on local main (no push). The output folder is not committed.
- [ ] 4.4 (Founder) Choose the five venues and approve each batch.
