-- 2026-10-31 · Vista AGREGADA de comisiones de CIMA para el motor fiscal de plataforma.
--
-- Por qué: la base fiscal por devengo (`lib/base-fiscal-devengo-db.ts::leerIngresosCima`) necesita los ingresos
-- de la correduría desde `seguros.poliza_recibos`, pero `prisma_plataforma` NO lee la cartera (datos personales
-- de clientes; por diseño el dato de la correduría llega a plataforma por el puerto de asegura). Esta vista solo
-- expone SUMAS por cuenta/mes/compañía/situación: ni póliza, ni cliente, ni recibo.
--
-- Diseño (y por qué NO `GRANT USAGE ON SCHEMA seguros`):
--  · Las funciones de `seguros` tienen EXECUTE para PUBLIC (default de Postgres). Con USAGE sobre `seguros`,
--    `prisma_plataforma` podría invocarlas. Por eso la vista vive en un schema PROPIO, `seguros_agregado`, y el rol
--    recibe USAGE solo ahí. Postgres comprueba los objetos referenciados por una vista con los permisos del
--    DUEÑO (postgres), así que el rol no necesita nada sobre `seguros`.
--  · Vista normal (NO security_invoker): lee con permisos del dueño. `security_barrier` para que ningún filtro
--    del llamador se evalúe sobre filas sueltas antes de agregar.
--  · `seguros.poliza_recibos` no tiene RLS (comprobado 31/10/2026); aunque la tuviera, el dueño la salta.
--  · Schema nuevo = no expuesto por PostgREST (anon/authenticated no tienen USAGE ni default ACL aquí).
--  · Multi-tenant: la vista resuelve `cuenta_id` (plataforma) → `correduria_id` (cartera) con la MISMA regla que
--    usaba el cargador (usuario activo de la correduría con el email de la cuenta; admin primero, luego el más
--    antiguo). El llamador filtra SIEMPRE por `cuenta_id`.
--
-- Columnas:
--  · `mes` (YYYY-MM, Europe/Madrid): `cobrado`/`anulado`/`devuelto` → mes de `fecha_situacion`;
--    `pendiente` → mes de `fecha_efecto_actual` (el pendiente se estima por mes de efecto).
--  · `comision_bruta_sum`: suma de `comision_bruta` (texto) SOLO de los recibos con valor numérico; NULL si
--    ninguno lo tiene (NULL = no se sabe, no 0). `n_comision_ilegible` cuenta los que no se pudieron leer.
--  · `retencion_irpf_sum`: NULL si ningún recibo del grupo trae retención (no consta ≠ 0).
--
-- Idempotente: CREATE SCHEMA IF NOT EXISTS + CREATE OR REPLACE VIEW + GRANT/REVOKE repetibles.

CREATE SCHEMA IF NOT EXISTS seguros_agregado AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA seguros_agregado FROM PUBLIC;
COMMENT ON SCHEMA seguros_agregado IS
  'Agregados SIN datos personales de la cartera (schema seguros) para otras apps. Solo vistas; nada de tablas.';

CREATE OR REPLACE VIEW seguros_agregado.v_comisiones_mes
WITH (security_barrier = true) AS
WITH cuenta_correduria AS (
  SELECT DISTINCT ON (c.id) c.id AS cuenta_id, u.correduria_id
  FROM public.cuentas c
  JOIN seguros.usuarios u ON lower(u.email) = lower(c.email)
  WHERE u.activo AND u.correduria_id IS NOT NULL
  ORDER BY c.id, (u.rol = 'admin') DESC, u.created_at ASC
)
SELECT cc.cuenta_id,
       to_char(CASE WHEN r.situacion = 'pendiente' THEN r.fecha_efecto_actual ELSE r.fecha_situacion END
               AT TIME ZONE 'Europe/Madrid', 'YYYY-MM') AS mes,
       r.codigo_entidad_dgs,
       r.situacion::text AS situacion,
       count(*)::int AS n_recibos,
       sum(CASE WHEN r.comision_bruta ~ '^-?[0-9]+(\.[0-9]+)?$' THEN r.comision_bruta::numeric END) AS comision_bruta_sum,
       count(*) FILTER (WHERE r.comision_bruta IS NULL OR r.comision_bruta !~ '^-?[0-9]+(\.[0-9]+)?$')::int AS n_comision_ilegible,
       sum(r.retencion_irpf) AS retencion_irpf_sum
FROM seguros.poliza_recibos r
JOIN cuenta_correduria cc ON cc.correduria_id = r.correduria_id
GROUP BY 1, 2, 3, 4;

COMMENT ON VIEW seguros_agregado.v_comisiones_mes IS
  'Comisiones de CIMA agregadas por cuenta/mes/compañía DGS/situación. Sin datos personales. Lectora: prisma_plataforma (motor fiscal).';

REVOKE ALL ON seguros_agregado.v_comisiones_mes FROM PUBLIC;
GRANT USAGE ON SCHEMA seguros_agregado TO prisma_plataforma;
GRANT SELECT ON seguros_agregado.v_comisiones_mes TO prisma_plataforma;

-- Verificación (ejecutar a mano; todas deben dar lo indicado):
--   SELECT has_schema_privilege('prisma_plataforma','seguros','USAGE');                         -- false
--   SELECT has_table_privilege('prisma_plataforma','seguros.poliza_recibos','SELECT');          -- false
--   SELECT has_table_privilege('prisma_plataforma','seguros_agregado.v_comisiones_mes','SELECT'); -- true
--   SELECT has_schema_privilege('anon','seguros_agregado','USAGE');                              -- false
--   SET ROLE prisma_plataforma;
--     SELECT sum(comision_bruta_sum) FROM seguros_agregado.v_comisiones_mes
--      WHERE situacion = 'cobrado' AND mes BETWEEN '2026-01' AND '2026-10';                     -- ≈ 5767.51 (31/10/2026)
--     SELECT 1 FROM seguros.poliza_recibos LIMIT 1;                                              -- ERROR permission denied
--   RESET ROLE;
