## Context

The repo has the `ai` package (version 7). The Vercel AI Gateway reaches models from several makers with one key and plain `"maker/model"` names. Nothing in the app asks an assistant about venues today.

The founder's standing rules that apply: ask before any paid run, with the list and the cost; no debug or output files inside the repo; plain English.

What a person sees in a chat app is not the same as what the same model says through the API: the apps add web search, location and their own instructions. The report must not pretend otherwise.

## Goals / Non-Goals

**Goals:**
- A number a venue owner can check by asking the same questions themselves.
- One command per venue, with the cost stated first.
- A sheet that looks like the mockup and can be sent as one file.

**Non-Goals:**
- A page in the app, a schedule, or a database table.
- Tracking a venue over time.
- Scoring how good the venue is, or advising it on its website.
- Claiming to reproduce what any chat app shows a given user.

## Decisions

**D1. Ten questions, written once.** `scripts/venue-questions.json` holds ten group-outing questions with two blanks, the area and the campus ("Where can six of us get dinner on {area} tonight?"). The same ten are asked for every venue in an area so results can be compared. The file is the record of what was asked.

**D2. Three assistants, named in one place.** A short list of `"maker/model"` names in the script's config, one each from three makers. The names are looked up in the gateway's current model list when this is built, not written from memory, and the run fails clearly if one is no longer offered.

  Picked 2026-11-24 from the live gateway list, one each from three makers at the same listed price ($2 per million tokens in, **D2. Three assistants, named in one place.** A short list of `"maker/model"` names in the script's config, one each from three makers. The names are looked up in the gateway's current model list when this is built, not written from memory, and the run fails clearly if one is no longer offered.0 out): `openai/gpt-6.1-sol` (shown as ChatGPT), `anthropic/claude-sonnet-5.5` (Claude), `google/gemini-4-argon` (Gemini). The reading call uses `anthropic/claude-sonnet-5.5`. The sheet names the models and says they were asked through their APIs, not the chat apps.

**D3. Ask, then read the answer.** Each question is sent as a plain user message with no system text, once per assistant, and the full answer is kept. A second, cheaper call reads each answer and returns the place names it recommends as a list. Alternative: ask the assistant to answer in a fixed format. Rejected: it changes what is being measured. The reading call's model is one of the three and is the same for all answers.

**D4. With search where it exists.** If the gateway offers a model with web search turned on, the run uses it and the sheet says "with web search". If not, the sheet says "without web search, so from what the assistant already knew". Either is stated; neither is hidden.

  Found 2026-11-24: all three carry the gateway's web-search tag, but each maker's own search tool needs that maker's SDK package. The gateway's own Perplexity Search tool (`gateway.tools.perplexitySearch`, from the `ai` package already installed, $5 per 1,000 searches) works with any model, so all three are asked with the same search tool and the sheet says "with web search". Search results are capped (8 results, 8,000 tokens) to keep the cost down.

**D5. Counting.** The venue is "named" in an answer when the list holds its name or one of the other names given on the command line (`--also "Nisi", "Nisi Estiatorio"`), compared without case, punctuation or a leading "the". "Named instead" is every other place, counted across all answers, top three shown. The counting is a pure function with tests on saved answers.

**D6. The cost check.** With no `--yes`, the script prints the venue, the assistants, the number of calls (questions × assistants, plus the reading calls) and a rough cost from the gateway's listed prices, then stops. With `--yes` it runs. Tests never call an assistant.

**D7. What comes out.** Two files in a folder outside the repo (`--out`, default a `loopd-reports` folder beside the repo): the raw answers as JSON, and one self-contained HTML sheet. The sheet follows the mockup: an ink top half with the question as the headline, the big number, thirty dots; then by assistant, named instead, three of the questions, and the offer. Its last line says the date, the assistants by name, whether search was on, and that answers vary from run to run.

**D8. Loopd's own numbers.** `--record "41,33,12"` puts the venue's said / showed / came back numbers in the offer box. Without it the offer box makes no claim about the venue and says what Loopd would measure. Once `campus-venue-record` is built, the numbers are copied from that page by hand; no link between the two is built here.

**D9. Other places are real businesses.** The "named instead" names come from the answers as given. The sheet reports them as what assistants said, with no comment on those businesses.

## Risks / Trade-offs

- [Answers change from run to run] → The sheet says so, keeps the raw answers, and reports "4 of 30", never a percentage that looks more exact than it is.
- [The API answer differs from the chat app] → Stated on the sheet (D4, D7). The owner is invited to try three of the questions themselves.
- [The reading call misses or invents a place] → Raw answers are kept; a `--check` flag prints each answer beside the names read from it so the founder can eyeball a run before sending.
- [A model name goes stale] → D2: fail clearly and name the model.
- [Cost creeps up] → D6: nothing runs without `--yes`, and the count is printed every time.

## Open Questions

- Which three assistants matter most to venue owners? The mockup shows ChatGPT, Claude and Gemini.
- Should the first five reports be gathered by hand in the chat apps instead, to see what owners react to before the script is trusted?
