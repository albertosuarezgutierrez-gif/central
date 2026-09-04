-- Vertical ASEGURA (correduría "Grupo ASegura") — cimientos de BD.
-- BD compartida wswbehlcuxqxyinousql, schema PROPIO `seguros` (patrón de iarest/rrhh,
-- no prefijo de tablas en public). Aplicar como `postgres` (Supabase/MCP), NUNCA con
-- el rol de la app. Aditivo e idempotente.
--
-- ⚠️ AQUÍ NO HAY TABLAS TODAVÍA, Y ESO NO SIGNIFICA QUE LA CORREDURÍA NO TENGA MODELO:
-- el modelo real vive en el repo `manuelsuarez/asegura`, al que aún no se ha podido
-- acceder desde el monorepo. "Sin tablas" = "sin inventariar", no "no hay".
-- Las tablas entran en un fichero POSTERIOR, cuando se lea ese repo.

CREATE SCHEMA IF NOT EXISTS seguros;

-- Rol dedicado, clon de prisma_sivra: login + BYPASSRLS, SIN CREATE (mínimo privilegio).
-- Se crea INERTE (sin contraseña) → no puede conectarse a nada hasta que Alberto ejecute:
--   ALTER ROLE prisma_seguros WITH PASSWORD '<generada>';
-- y la guarde en las envs de Vercel. Así el fichero no lleva secretos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_seguros') THEN
    CREATE ROLE prisma_seguros WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
END $$;

-- Su propio schema: DML completo.
GRANT USAGE ON SCHEMA seguros TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA seguros TO prisma_seguros;
GRANT USAGE, SELECT               ON ALL SEQUENCES IN SCHEMA seguros TO prisma_seguros;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA seguros
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prisma_seguros;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA seguros
  GRANT USAGE, SELECT ON SEQUENCES TO prisma_seguros;

-- `public`: SOLO LECTURA y SOLO de la jerarquía Cuenta → Sociedad → Negocio.
-- Nada de DML sobre las ~254 tablas de public (lección del rol prisma_almacen, 26/07/2026).
GRANT USAGE  ON SCHEMA public TO prisma_seguros;
GRANT SELECT ON public.cuentas, public.sociedades, public.negocios TO prisma_seguros;
