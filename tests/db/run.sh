#!/usr/bin/env bash
# Runs the migrations + tests on a throwaway local PostgreSQL database.
# Usage: PGURL=postgres://user@localhost/postgres tests/db/run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=pbl_test_$$
psql "${PGURL:-postgres:///postgres}" -qc "create database $DB" >/dev/null
trap 'psql "${PGURL:-postgres:///postgres}" -qc "drop database $DB" >/dev/null' EXIT
URL="${PGURL:-postgres:///postgres}"; URL="${URL%/*}/$DB"
psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase_shim.sql
for f in ../../supabase/migrations/*.sql; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$URL" -q -v ON_ERROR_STOP=1 -f rls_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
