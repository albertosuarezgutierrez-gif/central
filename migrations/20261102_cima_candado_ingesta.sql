-- 20261102_cima_candado_ingesta.sql
--
-- CANDADO ÚNICO entre los escritores de la ingesta CIMA (proyecto Supabase central
-- `wswbehlcuxqxyinousql`, schema `seguros`). PREPARADO, NO APLICADO: lo aplica
-- Alberto (o la sesión con su OK) tras el gate de DDL del CRM (asegura/AGENTS.md:
-- PR + CI verde + 2-eyes sobre este SQL literal + audit en operational_events).
-- Revertir: `20261102_cima_candado_ingesta_rollback.sql`.
--
-- Es el bloque «PRODUCCIÓN» de asegura `src/db/migrations/0109_cima_candado_ingesta.sql`,
-- ejecutable. La parte NO comentada de la 0109 escribe en `public.*` (lo que aplica
-- el CI `rls cross-tenant` en BD limpia): NO se pega aquí, crearía la tabla en el
-- schema expuesto por PostgREST.
--
-- Por qué y cómo (detalle en la 0109 y en asegura `src/lib/integrations/cima/ingesta-candado.ts`):
--   - Dos escritores (Actions del CRM + respaldo de plataforma `cima-pull-respaldo`)
--     pueden ingerir a la vez: 14 arranques < 320 s en 60 días.
--   - Advisory locks no sirven: pooler 6543 en modo transacción.
--   - Adquirir = INSERT … ON CONFLICT (nombre) DO UPDATE … WHERE expira_en < now()
--     RETURNING; liberar = DELETE … WHERE nombre AND titular. Caducidad 10 min
--     (máximo observado 156 s, maxDuration 300 s).
--   - Sin esta tabla el código corre SIN candado (fail-safe), así que el orden
--     despliegue/migración da igual y el rollback es inocuo.
--
-- Roles: crm_seguros y prisma_seguros (BYPASSRLS, search_path=seguros; verificado
-- 02/11/2026). Sin RLS a propósito (como `cima_ficheros`/`operational_events`): el
-- aislamiento lo dan los GRANTs; con RLS y sin policies, un rol que perdiera
-- BYPASSRLS degradaría a «sin candado» en silencio. Los privilegios por defecto del
-- schema ya darían lo mismo; se escriben explícitos para que la revisión los vea.

BEGIN;

CREATE TABLE IF NOT EXISTS seguros.ingesta_candado (
  nombre        text PRIMARY KEY,
  titular       text NOT NULL,
  adquirido_en  timestamptz NOT NULL DEFAULT now(),
  expira_en     timestamptz NOT NULL,
  CONSTRAINT ingesta_candado_nombre_no_vacio CHECK (length(btrim(nombre)) > 0),
  CONSTRAINT ingesta_candado_titular_no_vacio CHECK (length(btrim(titular)) > 0),
  CONSTRAINT ingesta_candado_expira_tras_adquirir CHECK (expira_en > adquirido_en)
);
COMMENT ON TABLE seguros.ingesta_candado IS 'Candado entre escritores de la ingesta CIMA (02/11/2026). Ver asegura src/db/migrations/0109_cima_candado_ingesta.sql.';
REVOKE ALL ON seguros.ingesta_candado FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.ingesta_candado TO crm_seguros, prisma_seguros;
GRANT SELECT ON seguros.ingesta_candado TO backup_seguros;

COMMIT;

-- Verificación (solo lectura) tras aplicar:
--   SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type)
--     FROM information_schema.role_table_grants
--    WHERE table_schema = 'seguros' AND table_name = 'ingesta_candado' GROUP BY 1;
--   -- esperado: backup_seguros SELECT · crm_seguros y prisma_seguros DELETE,INSERT,SELECT,UPDATE
--   -- (+ postgres, owner)
