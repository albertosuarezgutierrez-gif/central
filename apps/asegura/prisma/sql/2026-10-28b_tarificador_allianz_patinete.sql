-- 2026-10-28b — Fila de integración `allianz/patinete` (Movilidad Personal / VMP) para la EXPLORACIÓN IA del tarificador RPA.
-- Requiere 2026-10-13c_tarificador_explorador_fase_b.sql (misma tabla y patrón).
--
-- ⚠️ NO APLICADA. Sin esta fila, `POST /api/operador/tarificador/exploracion` con `allianz:autos:movilidad_personal` responde
--    409 `modo_no_automatizable: sin_integracion` (el endpoint busca por (compania, ramo) = los de la entrada: allianz/patinete).
--
-- Qué hace (idempotente): inserta `allianz/patinete`, `rpa_autorizada`, `ALLIANZ_EPAC`, concurrencia 1, APAGADA (`activo = false`,
-- igual que la de Hogar). La compuerta de exploración EXIGE `activo = true`: la enciende Alberto para la primera exploración:
--   update seguros.companias_integracion set activo = true where compania = 'allianz' and ramo = 'patinete';
-- Encenderla NO permite tarificar ni emitir patinete: no hay adaptador (`probar`/cotizaciones reales siguen imposibles);
-- solo deja lanzar la exploración (sintética, sin emisión). Apagar de nuevo: el mismo update con `activo = false`.
--
-- Se deshace con: DELETE FROM seguros.companias_integracion WHERE compania = 'allianz' AND ramo = 'patinete';

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
    (v_correduria, 'allianz', 'patinete', 'rpa_autorizada',
     'Solo EXPLORACIÓN IA (Allianz ePAC: Nueva Alta › Autos › Movilidad Personal; patinete/VMP). Sin adaptador de tarificación. Apagada hasta la primera exploración',
     'ALLIANZ_EPAC', 1, false)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;

COMMIT;

-- Comprobación tras aplicar:
--   select compania, ramo, modo, activo from seguros.companias_integracion where compania = 'allianz';
