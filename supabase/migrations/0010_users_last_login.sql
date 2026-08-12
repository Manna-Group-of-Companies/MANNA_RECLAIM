-- =============================================================================
-- MANNA RECLAIM - when each account last signed in
--
-- The back office lists who may sign in but never showed whether anyone does.
-- A supervisor who left months ago and an account in use on every shift read
-- exactly alike on the Users page, so "disable the ones nobody uses" was a
-- question nobody could answer from the screen.
--
-- One column, written on a successful sign-in and by nothing else - see
-- userService.touchLogin. Null means the account has never been used, which is
-- the honest answer for every account created before this ran: the sign-ins
-- that already happened were not recorded anywhere, so they cannot be
-- backfilled and are not guessed at.
--
-- Idempotent. supabase/schema.sql carries the same column.
-- =============================================================================

alter table if exists public.users add column if not exists last_login_at timestamptz;
