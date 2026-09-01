-- Dev-only bootstrap, mirroring Pratu's own scripts/devdb.
--
-- The app role must NOT be a superuser and must not have BYPASSRLS, or every
-- row-level-security policy is silently inert. Pratu refuses to start when it
-- detects an elevated role, so `POSTGRES_USER=pratu` does not work — the
-- container's own user is a superuser.
CREATE ROLE pratu LOGIN PASSWORD 'pratu' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE pratu OWNER pratu;
