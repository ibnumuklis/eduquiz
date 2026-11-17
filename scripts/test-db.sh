#!/usr/bin/env bash
# Recreates a throwaway PostgreSQL database, applies the Supabase shim and
# every migration, then runs the database integration tests.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres ./scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${TEST_DB_NAME:-eduquiz_test}"
psql -q -d postgres -c "drop database if exists ${DB}" -c "create database ${DB}"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f tests/db/supabase-shim.sql
for f in supabase/migrations/*.sql; do
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
echo "Migrations applied to ${DB}"

export TEST_DATABASE_URL="postgresql://${PGUSER:-postgres}@localhost/${DB}?host=${PGHOST:-/tmp}&port=${PGPORT:-5432}"
npx vitest run tests/integration "$@"
