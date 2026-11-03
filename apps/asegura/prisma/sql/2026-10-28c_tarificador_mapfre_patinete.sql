-- 2026-10-28c — Fila de integración `mapfre/patinete` (Patinetes · «MásPatín») para la EXPLORACIÓN IA del tarificador RPA.
-- Requiere 2026-10-13c_tarificador_explorador_fase_b.sql (misma tabla y patrón; igual que 2026-10-28b para Allianz).
--
-- ⚠️ NO APLICADA. Sin esta fila, `POST /api/operador/tarificador/exploracion` con `mapfre:automoviles:patinetes` responde
--    409 `modo_no_automatizable: sin_integracion` (el endpoint busca por (compania, ramo) = los de la entrada: mapfre/patinete).
--
-- Qué hace (idempotente): inserta `mapfre/patinete`, `rpa_autorizada`, credencial `MAPFRE_WMEDIADORES` (la misma que las filas
-- mapfre/auto y mapfre/moto), concurrencia 1, APAGADA (`activo = false`). La compuerta de exploración EXIGE `activo = true`: la
-- enciende Alberto para la primera exploración:
--   update seguros.companias_integracion set activo = true where compania = 'mapfre' and ramo = 'patinete';
-- Encenderla NO permite tarificar ni emitir patinete: no hay adaptador (`probar`/cotizaciones reales siguen imposibles);
-- solo deja lanzar la exploración (tomador = el mediador, sintética, sin emisión). Apagar: el mismo update con `activo = false`.
--
-- Se deshace con: DELETE FROM seguros.companias_integracion WHERE compania = 'mapfre' AND ramo = 'patinete';

BEGIN;

DO $seed$
DECLARE
  v_correduria uuid;
  v_n integer;
BEGIN
  SELECT count(*)::int INTO v_n FROM seguros.corredurias WHERE nombre = 'Grupo ASegura';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'companias_integracion: se esperaba UNA correduría «Grupo ASegura» y hay %', v_n;
  END IF;
  SELECT id INTO v_correduria FROM seguros.corredurias WHERE nombre = 'Grupo ASegura';
  INSERT INTO seguros.companias_integracion
    (correduria_id, compania, ramo, modo, nota_autorizacion, credencial_clave, max_concurrencia, activo)
  VALUES
    (v_correduria, 'mapfre', 'patinete', 'rpa_autorizada',
     'Solo EXPLORACIÓN IA (wmediadores: Nueva producción › Automóviles › Patinetes › Tarificación y Emisión, «MásPatín»; tomador = el mediador, Alberto 28/10/2026). Sin adaptador de tarificación. Apagada hasta la primera exploración',
     'MAPFRE_WMEDIADORES', 1, false)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;

COMMIT;

-- Comprobación tras aplicar:
--   select compania, ramo, modo, credencial_clave, activo from seguros.companias_integracion where compania = 'mapfre';
