-- SEC-14 (K-01 = A, T-13): least-privilege roles for the portfolio database.
--
--   portfolio_reader  the runtime (server.ts, PG_CONNECTION_URL): SELECT on posts only
--   portfolio_writer  the publish CLI only (--prod, PG_WRITE_CONNECTION_URL): posts DML
--   owner role        migrations only (PG_MIGRATE_URL); it keeps what it owns
--
-- Owner step. The two roles must exist first (`outplane db role create
-- <PROD_DB> portfolio_reader`, same for portfolio_writer; or `CREATE ROLE
-- portfolio_reader LOGIN;` + `\password portfolio_reader` in psql). Then, as
-- the owner role, connected to the portfolio database:
--
--   psql "<owner URL>" -v ON_ERROR_STOP=1 -f scripts/sql/least-privilege.sql
--
-- No passwords, hosts or URLs in this file. The database is always the one
-- the session is connected to (current_database()), so the file cannot touch
-- another database by mistake. Safe to run again: every run first removes
-- what the two roles may have been given, then grants exactly the set below.
-- Run it again after every migration that adds a table or a sequence.
--
-- T-13: `REVOKE CONNECT ... FROM PUBLIC` also keeps the `umami` role (and any
-- future role) out of this database; the reverse direction is
-- scripts/sql/umami-isolation.sql. The database owner keeps CONNECT.

BEGIN;

-- Nobody but the owner creates objects in public (default before Postgres 15).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());

  -- Start from nothing, whatever the platform or an earlier run granted.
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM portfolio_reader, portfolio_writer', current_database());
  REVOKE ALL ON SCHEMA public FROM portfolio_reader, portfolio_writer;
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM portfolio_reader, portfolio_writer;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM portfolio_reader, portfolio_writer;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO portfolio_reader, portfolio_writer', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO portfolio_reader, portfolio_writer;
GRANT SELECT ON public.posts TO portfolio_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO portfolio_writer;
GRANT USAGE, SELECT ON SEQUENCE public.posts_id_seq TO portfolio_writer;

COMMIT;

-- Checks (SEC-14 acceptance criteria), printed after the grants:
--   reader: SELECT t, INSERT f, DELETE f
SELECT has_table_privilege('portfolio_reader', 'public.posts', 'SELECT') AS reader_select,
       has_table_privilege('portfolio_reader', 'public.posts', 'INSERT') AS reader_insert,
       has_table_privilege('portfolio_reader', 'public.posts', 'DELETE') AS reader_delete;
--   writer: INSERT t, CREATE on the database f, CREATE on schema public f
SELECT has_table_privilege('portfolio_writer', 'public.posts', 'INSERT') AS writer_insert,
       has_database_privilege('portfolio_writer', current_database(), 'CREATE') AS writer_db_create,
       has_schema_privilege('portfolio_writer', 'public', 'CREATE') AS writer_schema_create;
--   T-13: the umami role cannot connect here: expect f (also f while it does not exist)
SELECT coalesce((SELECT has_database_privilege(r.oid, current_database(), 'CONNECT')
                   FROM pg_roles r WHERE r.rolname = 'umami'), false) AS umami_connect;
--   memberships of the three limited roles: expect 0 rows
SELECT r.rolname AS member, g.rolname AS member_of
  FROM pg_auth_members m
  JOIN pg_roles r ON r.oid = m.member
  JOIN pg_roles g ON g.oid = m.roleid
 WHERE r.rolname IN ('portfolio_reader', 'portfolio_writer', 'umami');
--   attributes: every column f
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
  FROM pg_roles
 WHERE rolname IN ('portfolio_reader', 'portfolio_writer', 'umami')
 ORDER BY rolname;
