# Quorum board

Slice 1 of the EMBA '27 proposal board (`openspec/changes/quorum-board`). Post an intent, tap in with your free days, and when enough of you overlap the board asks once and locks it. The look is `quorum.html` v5, ported as-is into `app/globals.css`.

Next.js 16 (App Router) · Postgres on Supabase through `pg` (server only; the public key reads nothing) · Vitest.

## Env

Copy `.env.example` to `.env.local` and fill every key.

| Key | Where | What |
| --- | --- | --- |
| `DATABASE_URL` | local (Vercel optional) | the transaction pooler (port 6543); on Vercel the Supabase integration's `POSTGRES_URL` is used when this is unset |
| `SESSION_SECRET` | Vercel + local | 32 random bytes, base64; signs the `qb` session cookie and hashes codes |
| `CRON_SECRET` | Vercel + local | bearer secret for `/api/cron/daily` |
| `NEXT_PUBLIC_APP_URL` | Vercel + local | public origin, no trailing slash; share and OG URLs use it |
| `SUPABASE_TEST_DB_URL` | local only | `board-test`'s direct / session connection (5432); `npm run test:db` resets it |
| `SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLISHABLE_KEY` | local only | `board-test`'s API URL and publishable key, used only to prove they read zero rows |

Never point `SUPABASE_TEST_DB_URL` at `board-dev`.

## Run

```bash
npm install
npm run dev            # http://localhost:3000/b/emba27
```

No hosted project yet? Run a throwaway local Postgres (PGlite over the wire protocol, in memory, no Docker):

```bash
node scripts/local-db.mjs --demo   # prints a /m/local-demo-token link that signs you in as "You"
# .env.local: DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres
```

`--demo` loads the made-up people and answers from `quorum.html`, plus two rolling example boards, `/b/example-team` (12 open, 3 ON) and `/b/example-club` (interest intents); drop it for the bare seed. Data is gone when the process exits.

## Database

The live database is the Supabase project `supabase-loop` (`gtxvuhxjequvhxuerfdw`, created through the Vercel integration); migrations 0001–0004 and the seed are applied there. Migrations are in `supabase/migrations/` (schema, `lock_proposal()`, grants, its search_path). The seed (`supabase/seed.sql`) adds board `emba27` and the five trip proposals and is idempotent.

```bash
# board-dev (once the project exists), with its direct connection string (5432)
npx supabase db push --db-url "<board-dev direct url>" --include-seed

# board-test: reset + migrate + seed + SQL assertions + the integration suites against it
npm run test:db
```

`test:db` runs `supabase db reset --db-url $SUPABASE_TEST_DB_URL`, then `supabase/tests/run-sql.mjs` (seed twice, the `*.test.sql` files in rolled-back transactions, two concurrent `lock_proposal` calls, and the publishable key reading every table), then the Vitest suites with `QB_DB=remote`.

## Test

```bash
npm run lint
npm test               # unit + integration; integration runs on in-process PGlite with the real migrations
npm run test:db        # same integration suites against board-test
npm run build
```

Last run (2026-10-24, quorum-board-sms): lint clean · `npm test` 19 files / 202 tests green · build green · `app/globals.css` unchanged since 7a26f1d · local walkthrough with the log notifier (one-more, lock, drop, `/m/` sign-in) · `test:db` **not yet run**: it needs `board-test` (task 1.1).

The static demos live in `public/demo/` and serve without `.html`: `/demo/stellic` (the Loop campus demo), `/demo/quorum` (the v5 mockup), `/demo/mockups-…`. `next.config.ts` redirects the old static-site URLs (`/quorum.html`, `/index.html`, …) there.

Screenshots of board, proposal, post and you at 390px, 1280px and with reduced motion are in `docs/`.

## Known gaps

- **Codes come from the server log until SMS ships.** A known number on a new device gets a six-digit code through `LogNotifier`, which writes a `text_sent` event but never stores the code. Read it from the server log (the `{"notify":"code",…}` line). Twilio is the next slice.
- Rate limits are in memory, per instance.
- The daily cron (`vercel.json`, 06:00 UTC) writes `proposal_idled`; the board computes idling itself, so a missed run only delays the event.
