#!/usr/bin/env sh
# Resets the loop-test project, applies migrations + seed, then runs every SQL test.
# Never point SUPABASE_TEST_DB_URL at loop-dev: this script drops and recreates the schema.
set -eu
: "${SUPABASE_TEST_DB_URL:?set SUPABASE_TEST_DB_URL to the loop-test connection string}"
cd "$(dirname "$0")/.."
npx --yes supabase db reset --yes --no-seed --db-url "$SUPABASE_TEST_DB_URL"
psql "$SUPABASE_TEST_DB_URL" -v ON_ERROR_STOP=1 -f seed.sql
for f in tests/*.test.sql; do
  [ -e "$f" ] || { echo "no SQL tests yet"; exit 0; }
  echo "== $f"
  psql "$SUPABASE_TEST_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
