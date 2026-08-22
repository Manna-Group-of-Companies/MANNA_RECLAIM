-- =============================================================================
-- MANNA RECLAIM - the managing director's account
--
-- `users.role` is a checked column, so a role the check does not name cannot be
-- inserted at all: seeding the MD account against the old constraint fails in
-- Postgres before it reaches any code. This widens the set by one.
--
-- What 'md' is, and what it deliberately is not:
--
--   It reads the plant overview and the shift efficiency. That is the whole
--   account. It is NOT a quieter manager - it has no write anywhere in the app,
--   and it is not in ADMIN_ROLES, which is the list that means "the back
--   office" and carries the rate card, the ideal values, run corrections,
--   dispatches and the answer for a shift that came in short. The server gates
--   the MD's three routes on SUMMARY_ROLES instead, which is read-only by
--   construction because it is only ever put on a GET.
--
--   Nothing in the database enforces that. A role column holds a string and the
--   check here says which strings are allowed; which of them may write is the
--   API's question, in config/constants.js and middlewares/role.middleware.js.
--   Said plainly because a widened check reads like a widened permission and is
--   not one.
--
-- The constraint is dropped and recreated rather than altered because Postgres
-- has no ALTER CONSTRAINT for a check expression. Both statements run inside the
-- one transaction apply-sql.js wraps the file in, so a failure on the second
-- leaves the first rolled back rather than the table unconstrained.
-- =============================================================================

alter table public.users drop constraint if exists users_role_check;

alter table public.users add constraint users_role_check
  check (role in ('worker', 'supervisor', 'lab', 'manager', 'admin', 'md'));

comment on column public.users.role is
  'worker, supervisor, lab, manager, admin, md. Which of these may write is '
  'settled by the API, not here - see SUMMARY_ROLES and ADMIN_ROLES in '
  'server/src/config/constants.js. md reads the summary screens and nothing '
  'else. See 0016_md_role.sql.';
