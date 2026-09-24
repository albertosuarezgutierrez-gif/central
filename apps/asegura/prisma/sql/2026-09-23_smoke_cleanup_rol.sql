-- Rol `smoke_cleanup` — purga del residuo que deja el e2e-smoke del CRM (repo `asegura`,
-- `scripts/smoke/cleanup-smoke-data.mjs`, LOO-873). Aplicar como `postgres`. Idempotente.
--
-- Por qué existe (medido 23/09/2026): desde el traspaso a central (05/09) el smoke escribe en
-- `seguros` de central, pero la purga seguía apuntando al Supabase congelado de Manuel con el
-- superusuario `postgres` (`FRANKFURT_DATABASE_URL`). Resultado: 17 cotizaciones `smoke-pq-*`,
-- 17 leads «Smoke Test Auto» en la cartera y 48 `operational_events` acumulados aquí, y 0 allí.
-- Reponer la contraseña de Frankfurt la habría puesto en verde borrando 0 filas.
--
-- Mínimo privilegio: la BD es la compartida de TODAS las apps. Lee lo que el script consulta,
-- borra solo en las tres tablas que purga, sin BYPASSRLS (ninguna de estas tablas tiene RLS) y
-- nada de `public` — donde hay OTRA tabla `clientes` que un search_path mal puesto alcanzaría.
-- `search_path = seguros` en el propio rol: el script usa nombres sin schema.
--
-- Se crea INERTE (sin contraseña). Alberto la pone con
--   ALTER ROLE smoke_cleanup WITH PASSWORD '<generada>';
-- y en el MISMO paso la pega en el secret `SMOKE_CLEANUP_DATABASE_URL` de GitHub Actions del
-- repo `asegura` (pooler de central, transacción: aws-0-eu-west-1.pooler.supabase.com:6543,
-- usuario `smoke_cleanup.wswbehlcuxqxyinousql`).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smoke_cleanup') THEN
    CREATE ROLE smoke_cleanup WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

ALTER ROLE smoke_cleanup SET search_path = seguros;

GRANT USAGE ON SCHEMA seguros TO smoke_cleanup;

-- SELECT por COLUMNA: solo lo que usan los WHERE del script. Con la tabla entera, el rol de un
-- job de CI podría leer los nombres y el PII cifrado de 32.600 fichas.
GRANT DELETE ON seguros.operational_events, seguros.cotizaciones, seguros.clientes TO smoke_cleanup;
GRANT SELECT (cotizacion_id, payload) ON seguros.operational_events TO smoke_cleanup;
GRANT SELECT (id, web_lead_idempotency_key, cliente_id) ON seguros.cotizaciones TO smoke_cleanup;
GRANT SELECT (id, tipo, nombre, import_ref) ON seguros.clientes TO smoke_cleanup;
GRANT SELECT (cotizacion_id) ON seguros.consent_logs, seguros.recordatorios,
  seguros.ofertas_automaticas, seguros.peticiones, seguros.codeoscopic_projects,
  seguros.mediator_audit_log TO smoke_cleanup;
