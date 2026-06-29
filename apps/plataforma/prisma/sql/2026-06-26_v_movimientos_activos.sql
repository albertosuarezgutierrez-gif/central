-- Vista canónica de movimientos "activos" (26/06/2026). YA APLICADA a la BD compartida por MCP.
--
-- Por qué: el doble conteo de 2026-06 (Excel reimportado sobre el feed del banco) se ocultaba
-- cada vez que una consulta de saldo/P&L se olvidaba de filtrar `duplicado_estado <> 'ignorado'`.
-- Esta vista centraliza ese filtro: toda lectura nueva debe leer de `v_movimientos_activos`
-- en vez de `movimientos_bancarios` directo, así no hay forma de "olvidar" excluir duplicados.
-- (Las escrituras siguen yendo a la tabla base; la vista es solo de lectura.)

CREATE OR REPLACE VIEW v_movimientos_activos AS
  SELECT *
  FROM movimientos_bancarios
  WHERE COALESCE(duplicado_estado, '') <> 'ignorado';

COMMENT ON VIEW v_movimientos_activos IS
  'Movimientos bancarios activos (excluye duplicado_estado=ignorado). Lee SIEMPRE de aquí en consultas de saldo/P&L para no recontar duplicados. Creada 2026-06-26.';
