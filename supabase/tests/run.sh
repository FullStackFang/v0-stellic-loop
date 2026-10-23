#!/usr/bin/env sh
# Resets the board-test project, applies migrations + seed, then runs the SQL
# tests and the integration suites against it.
# Never point SUPABASE_TEST_DB_URL at board-dev: this drops and recreates the schema.
set -eu
: "${SUPABASE_TEST_DB_URL:?set SUPABASE_TEST_DB_URL to the board-test connection string}"
cd "$(dirname "$0")/../.."
npx --yes supabase db reset --yes --db-url "$SUPABASE_TEST_DB_URL" --workdir .
node supabase/tests/run-sql.mjs
QB_DB=remote npx vitest run --dir . lib actions app components
