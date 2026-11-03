-- 2026-10-28e — Fila de integración `fidelidade/hogar` (Fidelidade Vivienda) para la EXPLORACIÓN IA del tarificador RPA.
-- Requiere 2026-10-13c_tarificador_explorador_fase_b.sql (misma tabla y patrón; igual que 2026-10-28c para Mapfre patinete).
--
-- ⚠️ NO APLICADA. Sin esta fila, `POST /api/operador/tarificador/exploracion` con `fidelidade:particulares:vivienda` responde
--    409 `modo_no_automatizable: sin_integracion` (el endpoint busca por (compania, ramo) = fidelidade/hogar).
--
-- Qué hace (idempotente): inserta `fidelidade/hogar`, `rpa_autorizada`, credencial `FIDELIDADE_MEDIADORES` (fly secrets
-- CRED_FIDELIDADE_MEDIADORES_USER / _PASS, ya puestos), concurrencia 1, APAGADA (`activo = false`). La compuerta de exploración EXIGE
-- `activo = true`: la enciende Alberto para la primera exploración:
--   update seguros.companias_integracion set activo = true where compania = 'fidelidade' and ramo = 'hogar';
-- Encenderla NO permite tarificar ni emitir: no hay adaptador de tarificación; solo deja lanzar la exploración (sintética, hasta el
-- formulario de Vivienda, sin emisión). Apagar: el mismo update con `activo = false`.
--
-- Se deshace con: DELETE FROM seguros.companias_integracion WHERE compania = 'fidelidade' AND ramo = 'hogar';

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
    (v_correduria, 'fidelidade', 'hogar', 'rpa_autorizada',
     'Solo EXPLORACIÓN IA (intranet de mediadores: Oficina Virtual › Proyecto › Nuevo proyecto › Particulares › Fidelidade Vivienda › Simulación; Alberto 28/10/2026). Sin adaptador de tarificación. Apagada hasta la primera exploración',
     'FIDELIDADE_MEDIADORES', 1, false)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;

COMMIT;

-- Comprobación tras aplicar:
--   select compania, ramo, modo, credencial_clave, activo from seguros.companias_integracion where compania = 'fidelidade';
