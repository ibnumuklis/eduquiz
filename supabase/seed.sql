-- Local development seed (runs on `supabase db reset` only — never in production).
-- Reference data (achievement catalogue) lives in the migrations.
-- Test accounts are created through the Auth Admin API so passwords are hashed
-- correctly and never committed:
--   EDUQUIZ_ALLOW_TEST_SEED=yes SUPABASE_URL=http://127.0.0.1:54321 \
--   SUPABASE_SERVICE_ROLE_KEY=<local service key> npx tsx scripts/seed-test-accounts.ts
select 1;
