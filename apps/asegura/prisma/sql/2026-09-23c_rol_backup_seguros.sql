-- Rol `backup_seguros` — copia semanal cifrada del schema `seguros` (Fase 0 de ASegura OS,
-- «continuidad y copias», 23/09/2026). Lo usa `.github/workflows/copia-seguros.yml`.
--
-- Por qué: la cartera vive en una Supabase FREE sin copias restaurables, y es la BD compartida de
-- todas las apps. Hasta pasar a Pro, una copia semanal fuera de Supabase es la red barata.
--
-- Mínimo privilegio: SOLO lectura y SOLO `seguros`. BYPASSRLS es imprescindible, no un lujo: las
-- tablas del CRM tienen RLS por `auth.uid()` y, sin él, `pg_dump` fallaría (bien) o, con
-- `row_security=on`, volcaría tablas VACÍAS sin error (mal). Es el mismo motivo que `prisma_seguros`.
--
-- Se crea INERTE (sin contraseña). Alberto la pone con
--   ALTER ROLE backup_seguros WITH PASSWORD '<generada>';
-- y en el MISMO paso la pega en el secret `SEGUROS_BACKUP_DATABASE_URL` del repo `central`
-- (conexión DIRECTA o pooler en modo SESIÓN :5432 — pg_dump no funciona por el pooler de
-- transacción :6543), junto con `SEGUROS_BACKUP_PASSPHRASE` (la clave con la que se cifra la copia).
-- Idempotente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_seguros') THEN
    CREATE ROLE backup_seguros WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
END $$;

ALTER ROLE backup_seguros SET search_path = seguros;
GRANT USAGE ON SCHEMA seguros TO backup_seguros;
GRANT SELECT ON ALL TABLES IN SCHEMA seguros TO backup_seguros;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA seguros TO backup_seguros;
-- Las tablas que se creen después también entran en la copia (si no, faltarían sin error).
ALTER DEFAULT PRIVILEGES IN SCHEMA seguros GRANT SELECT ON TABLES TO backup_seguros;
ALTER DEFAULT PRIVILEGES IN SCHEMA seguros GRANT SELECT ON SEQUENCES TO backup_seguros;
