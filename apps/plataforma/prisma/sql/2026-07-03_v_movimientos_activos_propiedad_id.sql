-- Regenera v_movimientos_activos para incluir columnas añadidas a movimientos_bancarios
-- DESPUÉS de crear la vista. En Postgres `CREATE VIEW ... SELECT *` congela la lista de
-- columnas en el momento de la creación; la vista se creó el 2026-06-26 y la columna
-- `propiedad_id` se añadió el 2026-07-01 (PR #638, 2026-07-01_mov_propiedad_id.sql), así que
-- la vista NO la exponía. Cualquier `SELECT propiedad_id FROM v_movimientos_activos` fallaba
-- → 500 en /api/sivra/pl-mensual → «Error cargando datos» en /sivra/resultado-pisos (todos los meses).
--
-- APLICADA en prod por MCP el 2026-07-03. Rollback: volver a la definición de
-- 2026-06-26_v_movimientos_activos.sql (mismo CREATE OR REPLACE, sin propiedad_id).
--
-- ⚠️ RECORDATORIO: al añadir una columna a movimientos_bancarios, re-ejecuta este
-- CREATE OR REPLACE para que la vista la exponga (SELECT * no se re-expande solo).
CREATE OR REPLACE VIEW v_movimientos_activos AS
  SELECT *
  FROM movimientos_bancarios
  WHERE COALESCE(duplicado_estado, '') <> 'ignorado';

COMMENT ON VIEW v_movimientos_activos IS
  'Movimientos bancarios activos (excluye duplicado_estado=ignorado). Lee SIEMPRE de aquí en consultas de saldo/P&L para no recontar duplicados. Creada 2026-06-26, regenerada 2026-07-03 para incluir propiedad_id.';
