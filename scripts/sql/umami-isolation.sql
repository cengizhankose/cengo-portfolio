-- SEC-14 / T-13: Umami's own database is closed to every other role.
--
-- Umami (self-hosted, K-05) shares the managed Postgres instance, but uses its
-- own `umami` database owned by its own `umami` role. This file closes the
-- direction portfolio -> umami: no role but the owner may connect to it.
-- The direction umami -> portfolio is closed by scripts/sql/least-privilege.sql
-- (REVOKE CONNECT ... FROM PUBLIC there, and no grant to `umami`).
--
-- Owner step, before Umami is deployed (ANL-01):
--   outplane db role create <PROD_DB> umami
--   outplane db database create <PROD_DB> umami --owner umami
--   psql "<umami role URL, database umami>" -v ON_ERROR_STOP=1 -f scripts/sql/umami-isolation.sql
--
-- No passwords, hosts or URLs in this file; Umami's connection string and
-- session secret live only in the `umami` app's Out Plane environment.

REVOKE CONNECT, TEMPORARY ON DATABASE umami FROM PUBLIC;

-- Check: expect f | f (a role that does not exist yet is reported as f).
SELECT coalesce((SELECT has_database_privilege(r.oid, 'umami', 'CONNECT')
                   FROM pg_roles r WHERE r.rolname = 'portfolio_reader'), false) AS reader_connect,
       coalesce((SELECT has_database_privilege(r.oid, 'umami', 'CONNECT')
                   FROM pg_roles r WHERE r.rolname = 'portfolio_writer'), false) AS writer_connect;
